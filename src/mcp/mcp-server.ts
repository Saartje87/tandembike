import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { attachmentPath } from '../app/lib/paths';
import { isAllowedHost } from '../http/allowed-host';
import { isPreviewable, isTextMediaType } from '../tickets/attachment-preview';
import { maxAttachmentSize } from '../tickets/attachments';
import { removeFromCycleFirst } from '../tickets/cycles';
import {
  type BatchFailure,
  TicketsError,
  ValidationError,
} from '../tickets/errors';
import {
  maxExternalReferenceKeyLength,
  maxExternalReferences,
  maxExternalReferenceUrlLength,
} from '../tickets/external-references';
import { paletteColors } from '../tickets/palette';
import { maxBatchSize } from '../tickets/rules';
import { statuses } from '../tickets/status';
import { ticketTypes } from '../tickets/ticket-type';
import {
  defaultPageSize,
  maxAcceptanceCriteria,
  maxAcceptanceCriterionLength,
  maxCommentLength,
  maxPageSize,
  type Project,
  type Ticket,
  type TicketDetail,
  type Tickets,
  ticketDetails,
  ticketSorts,
  ticketSummary,
} from '../tickets/tickets';
import { readFileSync, type Stats, statSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';

/**
 * The most characters the instructions may render to. Claude Code (2.1.310)
 * cuts server instructions, and each tool description, at 4,096 characters;
 * VS Code's Copilot agent passes them whole. The margin leaves room for new
 * rules, and the most important rules come first in case a client cuts more.
 */
export const maxInstructionsLength = 3500;

export const instructions = `This server is a ticket tracker shared with the User, who watches the Board in a browser. Work is organised as Tickets in Projects; every Ticket has a Status: Todo, In progress or Done.

- When you start working on a Ticket, move it to In progress. When you finish it, move it to Done. The User follows your progress this way.
- When your repository's instructions name a Project, keep that repository's Tickets in it and pass it as projectName. Otherwise call list_projects before creating a Project and reuse an existing one when it fits.
- Only the User archives and restores Projects. An archived Project is read-only: its Tickets can be read, but any change to them, or to its Cycles, is refused until it is restored.
- Claim Tickets before starting with claim_ticket, using a unique Agent-run ID. Moving a Ticket to Done releases its Claim; use release_ticket_claim when abandoning work. Claims are cooperative coordination, not authentication.
- Share progress, findings and triage notes as comments (add_comment) rather than rewriting the description. list_activity shows what changed on a Ticket, when, and whether the User or an Agent did it.
- Attach files to a Ticket with add_attachment, not comments; get_attachment reads one.
- Record that one Ticket must be finished before another can start with add_blocker, not in the description. Use list_tickets with status: "Todo", blocked: false and claimed: false to find ready, unclaimed work.
- To create several related Tickets at once, use create_tickets, with the Blockers between them given by position.
- When you split a Ticket into others, such as a spec into build Tickets, pass it as their originNumber.
- A Ticket may have an ordered checklist of acceptanceCriteria, separate from its description. Store criteria in that field, never as a checklist in the description or a comment. Check each off with set_acceptance_criteria_checked as you verify it.
- Work with Tickets through these tools, not direct database access.
- Tools that change a Ticket return its summary; get_ticket reads the whole Ticket.
- Refer to Tickets by number with a T, like T42, the same way the User does.
- Classify and triage Tickets with labels. Call list_labels and reuse an existing label when one fits.
- An Epic is a Ticket, created with type: "Epic", that groups child Tickets of its own Project, one level deep, so they are handed off as one unit; its description holds their shared context. Add children with epicNumber or attach_to_epic. To work an Epic, claim the Epic once with claim_ticket: that covers its children. Then work the children in Blocker order, the next being an unfinished child with blocked: false, moving each to In progress and Done as you go.
- A Cycle is a goal-led plan of Tickets in one Project, not a fixed-length sprint: Prepared, Active (at most one per Project) or Archived. list_cycles shows them; plan Tickets in with plan_ticket or plan_tickets, and move them to another Cycle or the Backlog in one step with move_tickets.
- Your client keeps this tool list, the tool descriptions and these instructions from when it connected. When the app's MCP tools change, ask the User to start a new session: reconnecting may keep the tool descriptions already loaded. Until then treat what you loaded as possibly out of date, and a tool missing from your list may still exist.
- Your repository's own instructions set its process, such as when a Ticket counts as finished; follow them where they say more than these.`;

const projectId = z
  .number()
  .int()
  .positive()
  .describe('The id of a Project, as returned by list_projects.');

const ticketNumber = z
  .number()
  .int()
  .positive()
  .describe('The Ticket number, e.g. 42 for T42.');

const label = z
  .string()
  .describe(
    'A label, one line of at most 50 characters. It is trimmed and lower-cased.',
  );

const addLabels = z
  .array(label)
  .optional()
  .describe(
    'Labels to add, after removeLabels are removed. Call list_labels to reuse existing ones.',
  );

const removeLabels = z
  .array(label)
  .optional()
  .describe(
    'Labels to remove, ignoring case; ones the Ticket does not have are ignored. A label may not be in both addLabels and removeLabels.',
  );

const externalReference = z
  .string()
  .describe(
    `An External reference: the same work in another system, such as a GitHub issue or a Jira issue. Either an absolute http(s) URL of at most ${maxExternalReferenceUrlLength.toLocaleString('en-US')} characters, or a key without spaces of at most ${maxExternalReferenceKeyLength} characters, such as ABC-33, or a GitHub issue number after a hash, alone or after owner/repo. It is trimmed and kept as typed.`,
  );

const addExternalReferences = z
  .array(externalReference)
  .optional()
  .describe(
    `External references to add after the ones the Ticket has, after removeExternalReferences are removed; ones it already has (exact match) are ignored. A Ticket has at most ${maxExternalReferences}.`,
  );

const removeExternalReferences = z
  .array(externalReference)
  .optional()
  .describe(
    'External references to remove, matched exactly; ones the Ticket does not have are ignored. A reference may not be in both addExternalReferences and removeExternalReferences.',
  );

const commentId = z
  .number()
  .int()
  .positive()
  .describe(
    'The id of a comment, as returned by list_comments or add_comment.',
  );

const commentBody = z
  .string()
  .describe(
    `The comment in Markdown, at most ${maxCommentLength.toLocaleString('en-US')} characters. It is trimmed and may not be empty.`,
  );

const attachmentId = z
  .number()
  .int()
  .positive()
  .describe(
    'The id of an Attachment, as returned by get_ticket or add_attachment.',
  );

const base64Content = /^[A-Za-z0-9+/]*={0,2}$/;

/** `attachment` with the localhost `url` the app serves its content at. */
function withUrl<Metadata extends { id: number }>(
  attachment: Metadata,
  origin: string,
) {
  return { ...attachment, url: `${origin}${attachmentPath(attachment.id)}` };
}

/** The bytes of base64 `content`, or a refusal when it is not base64. */
function bytesOfContent(content: string): Uint8Array {
  const bytes = decodeBase64(content);
  if (!bytes) {
    throw new ValidationError({ content: 'The content is not valid base64.' });
  }
  return bytes;
}

/**
 * The name and bytes of the file at absolute `path`, read on this machine.
 * Allowed only because the app is local and single-user (ADR 0001, 0018).
 */
function readLocalFile(path: string, name: string | undefined) {
  if (!isAbsolute(path)) {
    throw new ValidationError({ path: 'The path must be absolute.' });
  }
  let stats: Stats;
  try {
    stats = statSync(path);
  } catch {
    throw new ValidationError({ path: `There is no file at ${path}.` });
  }
  if (!stats.isFile()) {
    throw new ValidationError({ path: `${path} is not a file.` });
  }
  if (stats.size > maxAttachmentSize) {
    throw new ValidationError({
      content: 'Keep the file to 10 MB or smaller.',
    });
  }
  try {
    return { name: name ?? basename(path), bytes: readFileSync(path) };
  } catch {
    throw new ValidationError({ path: `The file at ${path} cannot be read.` });
  }
}

/** The bytes of base64 `text`, or `undefined` when it is not valid base64. */
function decodeBase64(text: string): Uint8Array | undefined {
  const compact = text.replace(/\s/g, '');
  if (compact.length % 4 !== 0 || !base64Content.test(compact)) {
    return undefined;
  }
  return new Uint8Array(Buffer.from(compact, 'base64'));
}

const criterionId = z
  .number()
  .int()
  .positive()
  .describe(
    "The id of one of the Ticket's acceptance criteria, as returned by get_ticket.",
  );

const criterionText = z
  .string()
  .describe(
    `The criterion: one line of at most ${maxAcceptanceCriterionLength} characters. It is trimmed and may not be empty.`,
  );

const newCriterion = z.object({
  text: criterionText,
  checked: z
    .boolean()
    .optional()
    .describe('Whether it is met already. Defaults to false.'),
});

const cycleId = z
  .number()
  .int()
  .positive()
  .describe('The id of a Cycle, as returned by list_cycles or create_cycle.');

const batchTicketNumbers = z
  .array(ticketNumber)
  .describe(
    `The Ticket numbers, each once, from 1 to ${maxBatchSize} of them.`,
  );

const cycleTitle = z
  .string()
  .describe(
    "The Cycle's goal as its title: one line of at most 200 characters. It is trimmed and may not be empty.",
  );

const originNumber = ticketNumber.describe(
  'The Ticket it was split from, such as the spec it came out of, in any Project. An Origin chain cannot loop.',
);

const epicColor = z
  .enum(paletteColors)
  .describe(
    `An Epic's colour, one of ${paletteColors.join(', ')}, which marks its children on the Board. Only an Epic has a colour.`,
  );

const status = z
  .enum(statuses)
  .describe('The Status: "Todo", "In progress" or "Done".');

const detail = z
  .enum(ticketDetails)
  .optional()
  .describe(
    'How much of the Ticket to return. "summary", the default: the short answer this tool describes. "full": the whole Ticket, as get_ticket returns it.',
  );

/** The fields of a `TicketSummary`, as tool descriptions list them. */
const summaryFields = 'number, title, status, labels and blocked';

/**
 * How a tool that changes a Ticket describes its answer: the summary of the
 * Ticket `subject` names, plus `extra` when the summary does not show the
 * change (ADR 0014).
 */
function returnsSummary({
  subject = 'the Ticket',
  extra,
}: {
  subject?: string;
  extra?: string;
} = {}) {
  return `Returns ${subject}'s summary: ${summaryFields}${extra ? `, plus ${extra}` : ''}. detail: "full" returns the whole Ticket instead, as get_ticket does.`;
}

/** What the text fields of a `create_tickets` Ticket say about `{{T:n}}`. */
const placeholderNote =
  '{{T:n}} is replaced by the number of the Ticket at position n of this list, counted from 0.';

/** The fields of a new Ticket that `create_ticket` and `create_tickets` share. */
const newTicketFields = {
  title: z.string().describe('A one-line title, at most 200 characters.'),
  description: z
    .string()
    .optional()
    .describe('Optional details in Markdown, at most 50,000 characters.'),
  status: status
    .optional()
    .describe('The starting Status. Defaults to "Todo".'),
  labels: z
    .array(label)
    .optional()
    .describe('Optional labels. Call list_labels to reuse existing ones.'),
  externalReferences: z
    .array(externalReference)
    .optional()
    .describe(
      `Optional External references, in order, at most ${maxExternalReferences}: where the same work lives in another system.`,
    ),
  acceptanceCriteria: z
    .array(newCriterion)
    .optional()
    .describe(
      `Optional acceptance criteria, in order, at most ${maxAcceptanceCriteria}: independently verifiable conditions for the Ticket's outcome.`,
    ),
};

/**
 * A Project as Agents see it: its colour and icon are the User's, set and
 * seen only in the UI. Whether it is archived they see, since it is then
 * read-only.
 */
function agentProject({ id, name, archived, createdAt }: Project) {
  return { id, name, archived, createdAt };
}

/** `value` as a tool result of pretty-printed JSON text. */
function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/**
 * A domain error as a tool error carrying the module's message; anything
 * else is a bug and is rethrown.
 */
function errorResult(error: unknown): CallToolResult {
  if (error instanceof TicketsError) {
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
  throw error;
}

/** Runs a Tickets module call for a tool and returns its result as JSON text. */
function respond(call: () => unknown): CallToolResult {
  try {
    return jsonResult(call());
  } catch (error) {
    return errorResult(error);
  }
}

/**
 * Runs a Tickets module call that changes a Ticket and answers with it as
 * `detail` asks: whole when "full", otherwise its summary plus `changed`, the
 * fields the call changed that the summary does not show (ADR 0014).
 */
function respondTicket(
  detail: TicketDetail | undefined,
  call: () => Ticket,
  changed: (ticket: Ticket) => Partial<Ticket> = () => ({}),
): CallToolResult {
  return respond(() => {
    const ticket = call();
    return detail === 'full'
      ? ticket
      : { ...ticketSummary(ticket), ...changed(ticket) };
  });
}

/**
 * Like `respond`, but for a batch result: it is a tool error, still listing
 * what changed, when any Ticket in `failed` was left unchanged.
 */
function respondBatch(call: () => { failed: BatchFailure[] }): CallToolResult {
  try {
    const batch = call();
    return { ...jsonResult(batch), isError: batch.failed.length > 0 };
  } catch (error) {
    return errorResult(error);
  }
}

/**
 * `message`, pointing an Agent to move_tickets when it is the refusal to plan
 * a Ticket that is in another Cycle already.
 */
function withMoveHint(message: string): string {
  return message.endsWith(removeFromCycleFirst)
    ? `${message.slice(0, -removeFromCycleFirst.length)} Move it with move_tickets, or unplan it from that Cycle first.`
    : message;
}

/** An MCP server whose tools call the Tickets module `tickets` only. */
export function createMcpServer(
  tickets: Tickets,
  origin = 'http://localhost:4747',
): McpServer {
  const server = new McpServer(
    { name: 'tandembike', version: '0.1.0' },
    { instructions },
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List Projects',
      description:
        'List all Projects, oldest first, with their id, name, archived flag and creation time. Call this before create_project to reuse an existing Project, and to find the projectId for Ticket tools. An archived Project is read-only, with its Tickets and Cycles, until the User restores it; its name stays taken.',
      annotations: { readOnlyHint: true },
    },
    () => respond(() => tickets.listProjects().map(agentProject)),
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create Project',
      description:
        'Create a Project and return it. Check list_projects first: names must be unique, ignoring case and surrounding spaces, and a taken name is refused.',
      inputSchema: {
        name: z
          .string()
          .describe('The Project name. Surrounding spaces are trimmed.'),
      },
    },
    ({ name }) => respond(() => agentProject(tickets.createProject({ name }))),
  );

  server.registerTool(
    'rename_project',
    {
      title: 'Rename Project',
      description:
        "Rename a Project and return it. Names must be unique, ignoring case and surrounding spaces; changing only the casing of the Project's own name is allowed. An archived Project cannot be renamed.",
      inputSchema: {
        id: projectId,
        name: z
          .string()
          .describe('The new Project name. Surrounding spaces are trimmed.'),
      },
      annotations: { idempotentHint: true },
    },
    ({ id, name }) =>
      respond(() => agentProject(tickets.renameProject(id, { name }))),
  );

  server.registerTool(
    'list_tickets',
    {
      title: 'List Tickets',
      description: `Find Tickets, oldest-created first or in Board order (sort), optionally only those in one Project (by projectId or projectName), in one or more Statuses, with given labels, with any of given External references, split from one Origin and/or containing a search query. Returns { tickets, nextCursor, total }: a page of at most limit Tickets, the cursor for the next page, or null on the last page, and total, how many Tickets match the filters over all pages, whatever the cursor. An empty tickets list means nothing matched. By default each Ticket is a summary: its number, title, status, labels and blocked (whether any Blocker is unresolved), plus projectId when the list is not for one Project. With detail: "full", each is the whole Ticket: also its description, type, color, epic, blockedBy, claim, External references, acceptance criteria, children, Board position, archived flag and timestamps, as get_ticket returns it.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'Only list Tickets in this Project (id from list_projects).',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'Only list Tickets in the Project with this name, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
        status: z
          .union([status, z.array(status)])
          .optional()
          .describe(
            'Only list Tickets in this Status, or with a list such as ["Todo", "In progress"], in any of those Statuses.',
          ),
        labels: z
          .array(label)
          .optional()
          .describe(
            'Only list Tickets that have every one of these labels, ignoring case.',
          ),
        includeArchived: z
          .boolean()
          .optional()
          .describe(
            'Also list archived Tickets, and Tickets of archived Projects. Defaults to false. Naming an archived Project by projectId or projectName lists its Tickets without this.',
          ),
        blocked: z
          .boolean()
          .optional()
          .describe(
            'true lists only Tickets with an unresolved Blocker; false lists only Tickets with none, ready to start once their Status allows.',
          ),
        claimed: z
          .boolean()
          .optional()
          .describe(
            "true lists only claimed Tickets; false lists only unclaimed Tickets. A claimed Epic's children count as claimed, since its Claim covers them.",
          ),
        query: z
          .string()
          .optional()
          .describe(
            'Only list Tickets whose title or description contains this text, trimmed and ignoring case (for ASCII letters only). % and _ match literally.',
          ),
        externalReferences: z
          .array(externalReference)
          .optional()
          .describe(
            'Only list Tickets that have any of these External references, unlike labels, which needs every one. Each is trimmed and matched exactly, never partly: ABC-3 does not match ABC-33, and a GitHub issue number after a hash does not match the URL of that issue. Use it to check whether a Ticket for an item in another system already exists; pass includeArchived: true when checking for duplicates, since the earlier Ticket may be archived. An empty list is refused.',
          ),
        limit: z
          .number()
          .int()
          .optional()
          .describe(
            `List at most this many Tickets, from 1 to ${maxPageSize}. Defaults to ${defaultPageSize}.`,
          ),
        cursor: ticketNumber
          .optional()
          .describe(
            'Continue after this Ticket number: the nextCursor of the previous page, with the same filters.',
          ),
        detail: z
          .enum(ticketDetails)
          .optional()
          .describe(
            'How much of each Ticket to list. "summary", the default: number, title, status, labels and blocked, plus projectId unless the list is for one Project. "full": the whole Ticket, as get_ticket returns it.',
          ),
        sort: z
          .enum(ticketSorts)
          .optional()
          .describe(
            'The order to list Tickets in. "created", the default: oldest-created first. "position": Board order, the order the User ranks Tickets in, with the lanes Todo, In progress, Done in turn, each top to bottom; it needs projectId or projectName. Paging in Board order can skip or repeat a Ticket that moves on the Board between calls.',
          ),
        originNumber: originNumber
          .optional()
          .describe(
            'Only list the Tickets split from this Ticket: those whose Origin it is.',
          ),
        cycleId: cycleId
          .nullable()
          .optional()
          .describe(
            'Only list the Tickets planned into this Cycle, or with null, the Backlog: those in no Prepared or Active Cycle, except the Done Tickets of an Archived Cycle, which stay with it.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    (input) => respond(() => tickets.findTickets(input)),
  );

  server.registerTool(
    'get_ticket',
    {
      title: 'Get Ticket',
      description:
        'Get one Ticket by its number, including the full Markdown description and its acceptanceCriteria (each with id, text and checked, in order). Its type is Ticket or Epic, and color is the colour of an Epic, or null for a normal Ticket; epic is the Epic it is a child of ({ number, title, color }) or null, and an Epic lists its children, each with number, title, Status, archived, blockedBy and blocked. origin is the Ticket it was split from ({ number, title, status }) or null, and splitOff lists the Tickets split from it, each with number, title, status and archived. cycle is the Cycle whose Board it shows on ({ id, title, state }): the Prepared or Active Cycle it is planned into, else for a Done Ticket the most recently archived Cycle that kept it, else null for the Backlog. externalReferences lists the URLs and keys of the same work in other systems, in the order they were added. attachments lists its files (id, name, mediaType, size, author, createdAt; never the content), in the order added. Read it before starting work on the Ticket.',
      inputSchema: { number: ticketNumber },
      annotations: { readOnlyHint: true },
    },
    ({ number }) => respond(() => tickets.getTicket(number)),
  );

  server.registerTool(
    'claim_ticket',
    {
      title: 'Claim Ticket',
      description: `Atomically claim a Ticket for one Agent run. A repeated claim by the same Agent run succeeds; another run cannot take an existing claim and is told who holds it. Claiming an Epic covers its children: no other run can claim them meanwhile, and an Epic is refused while another run holds a child, or once it is Done. ${returnsSummary({ extra: 'its claim' })}`,
      inputSchema: {
        number: ticketNumber,
        agentRunId: z
          .string()
          .describe('A unique identifier for this Agent run.'),
        agentName: z
          .string()
          .optional()
          .describe(
            'An optional display name for the Agent holding the claim.',
          ),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, agentRunId, agentName, detail }) =>
      respondTicket(
        detail,
        () => tickets.claimTicket(number, { agentRunId, agentName }),
        ({ claim }) => ({ claim }),
      ),
  );

  server.registerTool(
    'release_ticket_claim',
    {
      title: 'Release Ticket claim',
      description: `Release a Ticket claim held by this Agent run. A different Agent run cannot release another run's claim. ${returnsSummary({ extra: 'its claim, now null' })}`,
      inputSchema: {
        number: ticketNumber,
        agentRunId: z
          .string()
          .describe('The unique identifier used when claiming this Ticket.'),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, agentRunId, detail }) =>
      respondTicket(
        detail,
        () => tickets.releaseTicketClaim(number, { agentRunId }),
        ({ claim }) => ({ claim }),
      ),
  );

  server.registerTool(
    'create_ticket',
    {
      title: 'Create Ticket',
      description: `Create a Ticket in a Project, given by projectId or projectName, optionally planned into a Cycle. The title is required, one line and at most 200 characters; the description is optional Markdown of at most 50,000 characters; the Status defaults to Todo. ${returnsSummary({ subject: 'the new Ticket' })} The summary's number is the new Ticket number.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'The Project the Ticket belongs to (id from list_projects). Give this or projectName.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'The name of the Project the Ticket belongs to, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
        ...newTicketFields,
        type: z
          .enum(ticketTypes)
          .optional()
          .describe(
            "Ticket, the default, or Epic: a Ticket that groups child Tickets of its Project. Fixed once created. An Epic's Status follows its children that are not archived (Todo with none or all Todo, Done when all are Done, In progress otherwise), so give it none.",
          ),
        color: epicColor
          .optional()
          .describe(
            `For an Epic: its colour, one of ${paletteColors.join(', ')}. Left out, it gets the colour fewest live Epics in the Project use. Only an Epic has a colour.`,
          ),
        epicNumber: ticketNumber
          .optional()
          .describe(
            'Create the Ticket as a child of this Epic, which must be in the same Project.',
          ),
        originNumber: originNumber.optional(),
        cycleId: cycleId
          .optional()
          .describe(
            'Plan the Ticket into this Cycle, by the rules of plan_ticket: it must be Prepared or Active and in the same Project. A refused Cycle creates nothing.',
          ),
        detail,
      },
    },
    ({ projectId, projectName, detail, ...input }) =>
      respondTicket(detail, () =>
        tickets.createTicket({
          ...input,
          projectId: tickets.resolveProjectId({ projectId, projectName }),
        }),
      ),
  );

  server.registerTool(
    'create_tickets',
    {
      title: 'Create Tickets',
      description: `Create from 1 to ${maxBatchSize} Tickets in one Project, given by projectId or projectName, optionally planned into a Cycle, in one call, in order, with the Blockers between them given by position, instead of one create_ticket and add_blocker call each. To refer to another Ticket of the batch in a title, description or acceptance criterion, write {{T:n}}, n being its position counted from 0: it is replaced by that Ticket's number, such as T42, in the same call, wherever it stands in the text (code included), and may name a later Ticket or the Ticket itself. A position outside the batch refuses it. Do not guess numbers; they are shared by all Projects. Length limits apply after the replacement. All or nothing: if any Ticket breaks a rule, none is created and the error names it by position. Returns { numbers }: the new Ticket numbers, in the order given.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'The Project the Tickets belong to (id from list_projects). Give this or projectName.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'The name of the Project the Tickets belong to, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
        epicNumber: ticketNumber
          .optional()
          .describe(
            'Create every Ticket as a child of this Epic, which must be in the same Project.',
          ),
        originNumber: originNumber
          .optional()
          .describe(
            'The Ticket they were all split from, such as the spec they came out of, in any Project.',
          ),
        cycleId: cycleId
          .optional()
          .describe(
            'Plan every Ticket into this Cycle, by the rules of plan_ticket: it must be Prepared or Active and in the same Project. A refused Cycle creates none.',
          ),
        tickets: z
          .array(
            z.object({
              ...newTicketFields,
              title: z
                .string()
                .describe(
                  `A one-line title, at most 200 characters. ${placeholderNote}`,
                ),
              description: z
                .string()
                .optional()
                .describe(
                  `Optional details in Markdown, at most 50,000 characters. ${placeholderNote}`,
                ),
              acceptanceCriteria: z
                .array(newCriterion)
                .optional()
                .describe(
                  `Optional acceptance criteria, in order, at most ${maxAcceptanceCriteria}: independently verifiable conditions for the Ticket's outcome. ${placeholderNote}`,
                ),
              blockedByPositions: z
                .array(z.number().int())
                .optional()
                .describe(
                  'The positions, counted from 0, of earlier Tickets in this list that block this one. Only earlier positions can be named, so list the Tickets in dependency order.',
                ),
            }),
          )
          .describe(
            `The Tickets to create, in order, from 1 to ${maxBatchSize}.`,
          ),
      },
    },
    ({ projectId, projectName, ...input }) =>
      respond(() => ({
        numbers: tickets
          .createTicketBatch({
            ...input,
            projectId: tickets.resolveProjectId({ projectId, projectName }),
          })
          .map(({ number }) => number),
      })),
  );

  server.registerTool(
    'update_ticket',
    {
      title: 'Update Ticket',
      description: `Change any subset of a Ticket's title, description, Status, an Epic's color, Project (by projectId or projectName), Origin, labels, External references and acceptance criteria in one atomic change. Fields left out stay as they are. Use it to move a Ticket to "In progress" when you start and to "Done" when you finish, and to swap a triage state label with removeLabels and addLabels together. When moving it to "Done", remove its triage state label, if it has one and it is not wontfix, with removeLabels in the same call; its other labels stay. The same rules apply as for create_ticket. ${returnsSummary()}`,
      inputSchema: {
        number: ticketNumber,
        title: z
          .string()
          .optional()
          .describe('A new one-line title, at most 200 characters.'),
        description: z
          .string()
          .optional()
          .describe(
            'A new Markdown description, at most 50,000 characters. Replaces the whole description.',
          ),
        status: status
          .optional()
          .describe(
            "The new Status. An Epic's follows its children and cannot be set.",
          ),
        color: epicColor
          .optional()
          .describe(
            `An Epic's new colour, one of ${paletteColors.join(', ')}. Only an Epic has a colour.`,
          ),
        projectId: projectId
          .optional()
          .describe(
            'Move the Ticket to this Project (id from list_projects). A child, or an Epic with children, cannot move.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'Move the Ticket to the Project with this name, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
        originNumber: originNumber
          .nullable()
          .optional()
          .describe(
            'The Ticket it was split from, in any Project, or null to clear it. A Ticket cannot be its own Origin, and an Origin chain cannot loop.',
          ),
        addLabels,
        removeLabels,
        addExternalReferences,
        removeExternalReferences,
        acceptanceCriteria: z
          .array(
            newCriterion.extend({
              id: criterionId
                .optional()
                .describe(
                  'Keep this existing criterion (id from get_ticket); leave it out for a new one.',
                ),
              checked: newCriterion.shape.checked.describe(
                'Whether it is met. Left out, a kept criterion keeps its state unless its text changes, which unchecks it; a new one starts unchecked.',
              ),
            }),
          )
          .optional()
          .describe(
            `The Ticket's whole new list of acceptance criteria, in order, at most ${maxAcceptanceCriteria}. Criteria left out are removed; an empty list removes them all. To only check or uncheck criteria, use set_acceptance_criteria_checked.`,
          ),
        detail,
      },
    },
    ({ number, projectId, projectName, detail, ...changes }) =>
      respondTicket(detail, () =>
        tickets.updateTicket(number, {
          ...changes,
          ...(projectId === undefined && projectName === undefined
            ? {}
            : {
                projectId: tickets.resolveProjectId({ projectId, projectName }),
              }),
        }),
      ),
  );

  server.registerTool(
    'update_tickets',
    {
      title: 'Update Tickets',
      description: `Apply the same Status, Epic color and/or label change to each of an explicit list of Ticket numbers, at most ${maxBatchSize} per call, by the rules of update_ticket. When moving them to "Done", remove their triage state labels other than wontfix, listing each one any of them has in removeLabels in the same call; their other labels stay. Each Ticket's change is atomic; the batch is not. Returns { updated, failed }: a summary of each changed Ticket (${summaryFields}), or with detail: "full" the whole Ticket, and the number and error of each Ticket left unchanged. If any Ticket failed the result is an error, but the Tickets in updated were still changed. A bad change or list of numbers is refused and changes nothing.`,
      inputSchema: {
        ticketNumbers: batchTicketNumbers,
        status: status.optional().describe('The new Status.'),
        color: epicColor
          .optional()
          .describe(
            'A new colour for each Epic given. Only an Epic has a colour, so a normal Ticket given fails.',
          ),
        addLabels,
        removeLabels,
        detail,
      },
    },
    ({ detail, ...input }) =>
      respondBatch(() => {
        const batch = tickets.updateTickets(input);
        return detail === 'full'
          ? batch
          : { ...batch, updated: batch.updated.map(ticketSummary) };
      }),
  );

  server.registerTool(
    'attach_to_epic',
    {
      title: 'Attach Ticket to Epic',
      description: `Make an existing normal Ticket a child of an Epic in the same Project. An Epic cannot be a child, a Ticket is in at most one Epic (detach_from_epic it first), and a Ticket that blocks or is blocked by the Epic cannot join it. Attaching it again changes nothing. ${returnsSummary({ subject: 'the child', extra: 'its epic' })}`,
      inputSchema: {
        epic: ticketNumber.describe('The Epic, e.g. 41 for T41.'),
        ticket: ticketNumber.describe(
          'The Ticket to make its child, e.g. 42 for T42.',
        ),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ epic, ticket, detail }) =>
      respondTicket(
        detail,
        () => tickets.attachToEpic({ epic, child: ticket }),
        ({ epic }) => ({ epic }),
      ),
  );

  server.registerTool(
    'detach_from_epic',
    {
      title: 'Detach Ticket from Epic',
      description: `Take a Ticket out of its Epic. A Ticket in no Epic stays as it is. ${returnsSummary({ extra: 'its epic, now null' })}`,
      inputSchema: { number: ticketNumber, detail },
      annotations: { idempotentHint: true },
    },
    ({ number, detail }) =>
      respondTicket(
        detail,
        () => tickets.detachFromEpic(number),
        ({ epic }) => ({ epic }),
      ),
  );

  server.registerTool(
    'set_acceptance_criteria_checked',
    {
      title: 'Check acceptance criteria',
      description: `Check or uncheck some of a Ticket's acceptance criteria by id. Its other criteria, their order and the Ticket's Status stay as they are. ${returnsSummary({ extra: 'acceptanceCriteria holding only the criteria named in the call' })}`,
      inputSchema: {
        number: ticketNumber,
        criteria: z
          .array(
            z.object({
              id: criterionId,
              checked: z
                .boolean()
                .describe('true when the criterion is met, false when not.'),
            }),
          )
          .describe('The criteria to change, each once, at least one.'),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, criteria, detail }) =>
      respondTicket(
        detail,
        () => tickets.setAcceptanceCriteriaChecked(number, criteria),
        ({ acceptanceCriteria }) => ({
          acceptanceCriteria: acceptanceCriteria.filter(({ id }) =>
            criteria.some((criterion) => criterion.id === id),
          ),
        }),
      ),
  );

  server.registerTool(
    'list_labels',
    {
      title: 'List labels',
      description:
        'List every label in use on any Ticket, archived ones included, sorted. Reuse one of these before inventing a new label.',
      annotations: { readOnlyHint: true },
    },
    () => respond(() => tickets.listLabels()),
  );

  server.registerTool(
    'add_ticket_labels',
    {
      title: 'Add Ticket labels',
      description: `Add labels to a Ticket. Labels are trimmed and lower-cased; ones the Ticket already has are kept once. ${returnsSummary()}`,
      inputSchema: {
        number: ticketNumber,
        labels: z.array(label).describe('The labels to add, at least one.'),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, labels, detail }) =>
      respondTicket(detail, () => tickets.addLabels(number, labels)),
  );

  server.registerTool(
    'remove_ticket_labels',
    {
      title: 'Remove Ticket labels',
      description: `Remove labels from a Ticket. Matching ignores case; labels the Ticket does not have are ignored. ${returnsSummary()}`,
      inputSchema: {
        number: ticketNumber,
        labels: z.array(label).describe('The labels to remove, at least one.'),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, labels, detail }) =>
      respondTicket(detail, () => tickets.removeLabels(number, labels)),
  );

  server.registerTool(
    'list_blockers',
    {
      title: 'List Blockers',
      description:
        'List the Tickets that block a Ticket (blockedBy) and the Tickets it blocks (blocks), each by number with its title, Status, projectId, archived flag and resolved (true once it is Done or archived). Archived Tickets keep their Blockers.',
      inputSchema: { number: ticketNumber },
      annotations: { readOnlyHint: true },
    },
    ({ number }) => respond(() => tickets.listBlockers(number)),
  );

  server.registerTool(
    'add_blocker',
    {
      title: 'Add Blocker',
      description: `Record that the blocker Ticket must be resolved (Done or archived) before the blocked Ticket can start. The two may be in different Projects. A Ticket cannot block itself, a Blocker that would make a cycle is refused, and Blockers between an Epic and its own children are refused: order the children with Blockers among themselves. Adding one that exists already changes nothing. ${returnsSummary({ subject: 'the blocked Ticket', extra: 'blockedBy, the numbers of the Tickets that block it' })}`,
      inputSchema: {
        blocker: ticketNumber.describe(
          'The Ticket that must be resolved first, e.g. 41 for T41.',
        ),
        blocked: ticketNumber.describe(
          'The Ticket that waits for it, e.g. 42 for T42.',
        ),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ detail, ...input }) =>
      respondTicket(
        detail,
        () => tickets.addBlocker(input),
        ({ blockedBy }) => ({ blockedBy }),
      ),
  );

  server.registerTool(
    'remove_blocker',
    {
      title: 'Remove Blocker',
      description: `Stop the blocker Ticket blocking the blocked Ticket. Removing a Blocker the Ticket does not have changes nothing. ${returnsSummary({ subject: 'the blocked Ticket', extra: 'blockedBy, the numbers of the Tickets that still block it' })}`,
      inputSchema: {
        blocker: ticketNumber.describe(
          'The Ticket that blocks, e.g. 41 for T41.',
        ),
        blocked: ticketNumber.describe(
          'The Ticket it blocks, e.g. 42 for T42.',
        ),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ detail, ...input }) =>
      respondTicket(
        detail,
        () => tickets.removeBlocker(input),
        ({ blockedBy }) => ({ blockedBy }),
      ),
  );

  server.registerTool(
    'list_comments',
    {
      title: 'List comments',
      description:
        'List a Ticket\'s comments, oldest first. Each has its id, author ("user" for the User, "agent" for an Agent), Markdown body, createdAt and editedAt (null until edited).',
      inputSchema: { number: ticketNumber },
      annotations: { readOnlyHint: true },
    },
    ({ number }) => respond(() => tickets.listComments(number)),
  );

  server.registerTool(
    'list_activity',
    {
      title: 'List Activity',
      description:
        'List a Ticket\'s whole Activity, oldest first: one entry per action that changed it, archived Tickets included. Each has its id, actor ("user" for the User, "agent" for an Agent), createdAt and changes, each with its type and its old and new values (from, to), or the label, Ticket number or criterion text it names; Claim entries carry the agentRunId and agentName. Comments are not in it: list_comments lists them.',
      inputSchema: { number: ticketNumber },
      annotations: { readOnlyHint: true },
    },
    ({ number }) =>
      respond(() =>
        tickets
          .listActivity(number)
          .map(({ id, actor, createdAt, changes }) => ({
            id,
            actor,
            createdAt,
            changes,
          })),
      ),
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Add comment',
      description:
        'Add a Markdown comment to a Ticket, written by you as an Agent, and return it. Use comments to share progress and context without overwriting the description.',
      inputSchema: { number: ticketNumber, body: commentBody },
    },
    ({ number, body }) =>
      respond(() => tickets.addComment(number, { body, author: 'agent' })),
  );

  server.registerTool(
    'add_attachment',
    {
      title: 'Add attachment',
      description:
        "Attach a file to a Ticket or Epic, added by you as an Agent, and return its metadata (id, ticketNumber, name, mediaType, size, author, createdAt). Give exactly one of path or content. path is an absolute local file path that the app reads on the machine running it, so a saved screenshot never passes through your context; name defaults to the file's base name. content is the file as base64 and needs a name. At most 10 MB per file and 50 Attachments per Ticket. An Attachment cannot be renamed or replaced. mediaType defaults from the name's extension, else application/octet-stream.",
      inputSchema: {
        number: ticketNumber,
        name: z
          .string()
          .optional()
          .describe(
            'The file name: one line of at most 255 characters. It is trimmed and may not be empty. Required with content; defaults to the base name of path.',
          ),
        path: z
          .string()
          .optional()
          .describe(
            'The absolute path of a file on the machine running the app, which the app reads. Give this or content.',
          ),
        content: z
          .string()
          .optional()
          .describe("The file's bytes as standard base64. Give this or path."),
        mediaType: z
          .string()
          .optional()
          .describe(
            'The media type, such as image/png. Inferred from the name when left out.',
          ),
      },
    },
    ({ number, name, path, content, mediaType }) =>
      respond(() => {
        if ((path === undefined) === (content === undefined)) {
          throw new ValidationError({
            path: 'Give either path or content, not both and not neither.',
          });
        }
        const file =
          path === undefined
            ? { name: name ?? '', bytes: bytesOfContent(content ?? '') }
            : readLocalFile(path, name);
        return tickets.addAttachment(number, {
          name: file.name,
          mediaType,
          content: file.bytes,
          author: 'agent',
        });
      }),
  );

  server.registerTool(
    'get_attachment',
    {
      title: 'Get attachment',
      description:
        'Get an Attachment by its id, as returned by get_ticket or add_attachment. The first content is its metadata (id, ticketNumber, name, mediaType, size, author, createdAt, url) as JSON. A PNG, JPEG, GIF or WebP follows as image content you can look at, and a text type (text/*, JSON, XML, YAML, JavaScript) as text. Any other type is metadata only; its url is where the app serves it on localhost.',
      inputSchema: { id: attachmentId },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => {
      try {
        const { content, ...attachment } = tickets.getAttachment(id);
        const metadata = jsonResult(withUrl(attachment, origin));
        if (isPreviewable(attachment.mediaType)) {
          return {
            content: [
              ...metadata.content,
              {
                type: 'image',
                data: Buffer.from(content).toString('base64'),
                mimeType: attachment.mediaType,
              },
            ],
          };
        }
        if (isTextMediaType(attachment.mediaType)) {
          return {
            content: [
              ...metadata.content,
              { type: 'text', text: new TextDecoder().decode(content) },
            ],
          };
        }
        return metadata;
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'edit_comment',
    {
      title: 'Edit comment',
      description:
        "Replace a comment's body and return it with its editedAt time. Agents can only edit comments written by an Agent, not the User's.",
      inputSchema: { id: commentId, body: commentBody },
    },
    ({ id, body }) =>
      respond(() => tickets.editComment(id, { body, by: 'agent' })),
  );

  server.registerTool(
    'remove_attachment',
    {
      title: 'Remove attachment',
      description:
        "Delete an Attachment permanently by its id; it cannot be restored. Agents can only remove Attachments added by an Agent, not the User's.",
      inputSchema: { id: attachmentId },
      annotations: { destructiveHint: true },
    },
    ({ id }) =>
      respond(() => {
        tickets.removeAttachment(id, { by: 'agent' });
        return { removed: id };
      }),
  );

  server.registerTool(
    'remove_comment',
    {
      title: 'Remove comment',
      description:
        "Delete a comment permanently; it cannot be restored. Agents can only remove comments written by an Agent, not the User's.",
      inputSchema: { id: commentId },
      annotations: { destructiveHint: true },
    },
    ({ id }) =>
      respond(() => {
        tickets.removeComment(id, { by: 'agent' });
        return { removed: id };
      }),
  );

  server.registerTool(
    'archive_ticket',
    {
      title: 'Archive Ticket',
      description: `Archive a Ticket. It leaves the Board and list_tickets (unless includeArchived is set) but keeps everything; restore_ticket brings it back. An Epic cannot be archived while any child is not archived. Agents cannot delete Tickets; the User can, from the app. ${returnsSummary({ extra: 'archived' })}`,
      inputSchema: { number: ticketNumber, detail },
      annotations: { idempotentHint: true },
    },
    ({ number, detail }) =>
      respondTicket(
        detail,
        () => tickets.archiveTicket(number),
        ({ archived }) => ({ archived }),
      ),
  );

  server.registerTool(
    'restore_ticket',
    {
      title: 'Restore Ticket',
      description: `Bring an archived Ticket back onto the Board exactly as it was. Restoring an Epic also brings back the children archived with it, but not ones archived before it. ${returnsSummary({ extra: 'archived' })}`,
      inputSchema: { number: ticketNumber, detail },
      annotations: { idempotentHint: true },
    },
    ({ number, detail }) =>
      respondTicket(
        detail,
        () => tickets.restoreTicket(number),
        ({ archived }) => ({ archived }),
      ),
  );

  server.registerTool(
    'list_cycles',
    {
      title: 'List Cycles',
      description:
        "List a Project's Cycles, given by projectId or projectName, oldest first, each with its id, title (its goal), state (Prepared, Active or Archived), ticketNumbers (the Tickets planned into it; an Archived Cycle's are its final membership), createdAt and archivedAt (null unless Archived).",
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'The Project to list the Cycles of (id from list_projects). Give this or projectName.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'The name of the Project to list the Cycles of, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    ({ projectId, projectName }) =>
      respond(() =>
        tickets.listCycles(
          tickets.resolveProjectId({ projectId, projectName }),
        ),
      ),
  );

  server.registerTool(
    'create_cycle',
    {
      title: 'Create Cycle',
      description:
        'Create an empty, Prepared Cycle in a Project, given by projectId or projectName, and return it. A Project can have several Prepared Cycles.',
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'The Project the Cycle belongs to (id from list_projects). Give this or projectName.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'The name of the Project the Cycle belongs to, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
        title: cycleTitle,
      },
    },
    ({ projectId, projectName, title }) =>
      respond(() =>
        tickets.createCycle({
          projectId: tickets.resolveProjectId({ projectId, projectName }),
          title,
        }),
      ),
  );

  server.registerTool(
    'rename_cycle',
    {
      title: 'Rename Cycle',
      description:
        'Rename a Prepared or Active Cycle and return it. An Archived Cycle cannot change.',
      inputSchema: { cycleId, title: cycleTitle },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, title }) =>
      respond(() => tickets.renameCycle(cycleId, { title })),
  );

  server.registerTool(
    'plan_ticket',
    {
      title: 'Plan Ticket into Cycle',
      description:
        "Plan a Ticket into a Prepared or Active Cycle of its Project and return the Cycle. Any non-archived Ticket can be planned, Done ones included to record finished work, and a Ticket is in at most one Cycle that is not Archived: move_tickets moves it from its current one, or unplan_ticket it from that first. Planning doesn't change its Status, and a member that becomes Done or is archived stays in it.",
      inputSchema: { cycleId, number: ticketNumber },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, number }) => {
      try {
        return jsonResult(tickets.planTicket({ cycleId, number }));
      } catch (error) {
        return error instanceof TicketsError
          ? errorResult(new TicketsError(withMoveHint(error.message)))
          : errorResult(error);
      }
    },
  );

  server.registerTool(
    'unplan_ticket',
    {
      title: 'Unplan Ticket from Cycle',
      description:
        'Take a Ticket out of a Prepared or Active Cycle, back to the Backlog, and return the Cycle. An Archived Cycle cannot change.',
      inputSchema: { cycleId, number: ticketNumber },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, number }) =>
      respond(() => tickets.unplanTicket({ cycleId, number })),
  );

  server.registerTool(
    'plan_tickets',
    {
      title: 'Plan Tickets into Cycle',
      description: `Plan each of an explicit list of Ticket numbers, at most ${maxBatchSize} per call, into one Prepared or Active Cycle, by the rules of plan_ticket; a Ticket already in that Cycle counts as planned. Each Ticket's change is atomic; the batch is not. Returns { updated, failed, cycle }: the planned Ticket numbers, the number and error of each Ticket left unplanned, and the Cycle. If any Ticket failed the result is an error, but the Tickets in updated were still planned. A missing or Archived Cycle, or a bad list of numbers, is refused and changes nothing.`,
      inputSchema: { cycleId, ticketNumbers: batchTicketNumbers },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, ticketNumbers }) =>
      respondBatch(() => {
        const batch = tickets.planTickets({ cycleId, ticketNumbers });
        return {
          ...batch,
          failed: batch.failed.map(({ number, error }) => ({
            number,
            error: withMoveHint(error),
          })),
        };
      }),
  );

  server.registerTool(
    'unplan_tickets',
    {
      title: 'Unplan Tickets from Cycle',
      description: `Take each of an explicit list of Ticket numbers, at most ${maxBatchSize} per call, out of one Prepared or Active Cycle, back to the Backlog, by the rules of unplan_ticket. Returns { updated, failed, cycle } as plan_tickets does, and is an error when any Ticket failed, though the Tickets in updated were still unplanned. A missing or Archived Cycle, or a bad list of numbers, is refused and changes nothing.`,
      inputSchema: { cycleId, ticketNumbers: batchTicketNumbers },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, ticketNumbers }) =>
      respondBatch(() => tickets.unplanTickets({ cycleId, ticketNumbers })),
  );

  server.registerTool(
    'move_tickets',
    {
      title: 'Move Tickets to Cycle or Backlog',
      description: `Move each of an explicit list of Ticket numbers, at most ${maxBatchSize} per call, into one Prepared or Active Cycle, or to the Backlog with cycleId null, in one step: each leaves the Cycle that is not Archived it is in, if any, and joins the target, by the rules of plan_ticket otherwise. A Done Ticket stays in an Archived Cycle that holds it. A Ticket already there counts as moved. Each Ticket's change is atomic; the batch is not. Returns { updated, failed, cycle }: the moved Ticket numbers, the number and error of each Ticket left where it was, and the target Cycle, or null for the Backlog. If any Ticket failed the result is an error, but the Tickets in updated were still moved. A missing or Archived Cycle, or a bad list of numbers, is refused and changes nothing.`,
      inputSchema: {
        cycleId: cycleId
          .nullable()
          .describe(
            'The id of the Cycle to move the Tickets into, as returned by list_cycles or create_cycle, or null for the Backlog.',
          ),
        ticketNumbers: batchTicketNumbers,
      },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, ticketNumbers }) =>
      respondBatch(() =>
        tickets.moveTicketsToCycle({ cycleId, ticketNumbers }),
      ),
  );

  server.registerTool(
    'start_cycle',
    {
      title: 'Start Cycle',
      description:
        "Make a Prepared Cycle its Project's Active Cycle and return it. While another Cycle is Active this is refused, unless confirmArchiveActive is true: then that Cycle is archived and its open, non-archived Tickets roll into this one, all in one step.",
      inputSchema: {
        cycleId,
        confirmArchiveActive: z
          .boolean()
          .optional()
          .describe(
            "Archive the Project's Active Cycle and roll its open Tickets into this one. Set it only once the User has agreed. Defaults to false.",
          ),
      },
    },
    ({ cycleId, confirmArchiveActive }) =>
      respond(() =>
        tickets.startCycle(cycleId, { archiveActive: confirmArchiveActive }),
      ),
  );

  server.registerTool(
    'archive_cycle',
    {
      title: 'Archive Cycle',
      description:
        'Archive the Active Cycle, finished or not, and return it. Its Tickets keep their Status: its unfinished ones leave it and return to the Backlog, and its Done ones stay with it as read-only history.',
      inputSchema: { cycleId },
    },
    ({ cycleId }) => respond(() => tickets.archiveCycle(cycleId)),
  );

  return server;
}

/**
 * Answers one MCP request over Streamable HTTP, statelessly (ADR 0002): each
 * request gets a fresh server and transport around `tickets`. Responses are
 * plain JSON, not SSE streams. A Host other than localhost is refused with
 * 403 against DNS rebinding, as `src/proxy.ts` does for the whole app; the
 * SDK's own `allowedHosts` option is deprecated and cannot allow any port.
 */
export async function handleMcpRequest(
  request: Request,
  tickets: Tickets,
): Promise<Response> {
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (!isAllowedHost(host)) {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'This host is not allowed.' },
        id: null,
      },
      { status: 403 },
    );
  }
  const server = createMcpServer(tickets, new URL(request.url).origin);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
