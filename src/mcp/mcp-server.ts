import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { isAllowedHost } from '../http/allowed-host';
import { TicketsError } from '../tickets/errors';
import { statuses } from '../tickets/status';
import {
  defaultPageSize,
  maxAcceptanceCriteria,
  maxAcceptanceCriterionLength,
  maxBatchSize,
  maxCommentLength,
  maxPageSize,
  type Tickets,
  type UpdateTicketsResult,
} from '../tickets/tickets';

export const instructions = `This server is a ticket tracker shared with the User, who watches the Board in a browser. Work is organised as Tickets in Projects; every Ticket has a Status: Todo, In progress or Done.

- When you start working on a Ticket, move it to In progress. When you finish it, move it to Done. The User follows your progress this way.
- Before creating a Project, call list_projects and reuse an existing Project when one fits. Project names are unique, ignoring case.
- Refer to Tickets by number with a hash, like #42, the same way the User does.
- Classify and triage Tickets with labels. Call list_labels and reuse an existing label when one fits.
- Share progress, findings and triage notes as comments (add_comment) rather than rewriting the description. You can edit or remove only comments written by an Agent.
- Claim Tickets before starting with claim_ticket, using a unique Agent-run ID. Moving a Ticket to Done releases its Claim; use release_ticket_claim when abandoning work. Claims are cooperative coordination, not authentication.
- Record that one Ticket must be finished before another can start with add_blocker, not in the description. A Blocker is resolved once it is Done or archived; list_tickets with blocked: false finds Tickets that are ready to start.
- Use list_tickets with status: "Todo", blocked: false and claimed: false to find ready, unclaimed work.
- A Ticket may have an ordered checklist of acceptanceCriteria, separate from its description. Check each off with set_acceptance_criteria_checked as you verify it; rewrite the list with update_ticket. Checking criteria does not change the Status.
- Errors explain what was wrong with the input; fix it and try again.`;

const projectId = z
  .number()
  .int()
  .positive()
  .describe('The id of a Project, as returned by list_projects.');

const ticketNumber = z
  .number()
  .int()
  .positive()
  .describe('The Ticket number, e.g. 42 for #42.');

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

const status = z
  .enum(statuses)
  .describe('The Status: "Todo", "In progress" or "Done".');

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
 * Like `respond`, but for a batch result: it is a tool error, still listing
 * what changed, when any Ticket in `failed` was left unchanged.
 */
function respondBatch(call: () => UpdateTicketsResult): CallToolResult {
  try {
    const batch = call();
    return { ...jsonResult(batch), isError: batch.failed.length > 0 };
  } catch (error) {
    return errorResult(error);
  }
}

/** An MCP server whose tools call the Tickets module `tickets` only. */
export function createMcpServer(tickets: Tickets): McpServer {
  const server = new McpServer(
    { name: 'tandembike', version: '0.1.0' },
    { instructions },
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List Projects',
      description:
        'List all Projects, oldest first, with their id, name and creation time. Call this before create_project to reuse an existing Project, and to find the projectId for Ticket tools.',
      annotations: { readOnlyHint: true },
    },
    () => respond(() => tickets.listProjects()),
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
    ({ name }) => respond(() => tickets.createProject({ name })),
  );

  server.registerTool(
    'rename_project',
    {
      title: 'Rename Project',
      description:
        "Rename a Project and return it. Names must be unique, ignoring case and surrounding spaces; changing only the casing of the Project's own name is allowed.",
      inputSchema: {
        id: projectId,
        name: z
          .string()
          .describe('The new Project name. Surrounding spaces are trimmed.'),
      },
      annotations: { idempotentHint: true },
    },
    ({ id, name }) => respond(() => tickets.renameProject(id, { name })),
  );

  server.registerTool(
    'list_tickets',
    {
      title: 'List Tickets',
      description: `Find Tickets, oldest-created first, optionally only those in one Project, in one Status, with given labels and/or containing a search query. Returns { tickets, nextCursor }: a page of at most limit Tickets, and the cursor for the next page, or null on the last page. An empty tickets list means nothing matched. Each Ticket has its number, title, Status, projectId, labels, blockedBy (its Blockers' numbers), blocked (whether any Blocker is unresolved), claim (the Agent run holding it, or null), archived flag and timestamps; set includeDescription for whole Tickets, or call get_ticket for one Ticket's description and acceptance criteria.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'Only list Tickets in this Project (id from list_projects).',
          ),
        status: status.optional().describe('Only list Tickets in this Status.'),
        labels: z
          .array(label)
          .optional()
          .describe(
            'Only list Tickets that have every one of these labels, ignoring case.',
          ),
        includeArchived: z
          .boolean()
          .optional()
          .describe('Also list archived Tickets. Defaults to false.'),
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
            'true lists only claimed Tickets; false lists only unclaimed Tickets.',
          ),
        query: z
          .string()
          .optional()
          .describe(
            'Only list Tickets whose title or description contains this text, trimmed and ignoring case (for ASCII letters only). % and _ match literally.',
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
        includeDescription: z
          .boolean()
          .optional()
          .describe(
            "Include each Ticket's Markdown description, acceptance criteria and Board position. Defaults to false.",
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
        'Get one Ticket by its number, including the full Markdown description and its acceptanceCriteria (each with id, text and checked, in order). Read it before starting work on the Ticket.',
      inputSchema: { number: ticketNumber },
      annotations: { readOnlyHint: true },
    },
    ({ number }) => respond(() => tickets.getTicket(number)),
  );

  server.registerTool(
    'claim_ticket',
    {
      title: 'Claim Ticket',
      description:
        'Atomically claim a Ticket for one Agent run. A repeated claim by the same Agent run succeeds; another run cannot take an existing claim and is told who holds it.',
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
      },
      annotations: { idempotentHint: true },
    },
    ({ number, agentRunId, agentName }) =>
      respond(() => tickets.claimTicket(number, { agentRunId, agentName })),
  );

  server.registerTool(
    'release_ticket_claim',
    {
      title: 'Release Ticket claim',
      description:
        "Release a Ticket claim held by this Agent run. A different Agent run cannot release another run's claim.",
      inputSchema: {
        number: ticketNumber,
        agentRunId: z
          .string()
          .describe('The unique identifier used when claiming this Ticket.'),
      },
      annotations: { idempotentHint: true },
    },
    ({ number, agentRunId }) =>
      respond(() => tickets.releaseTicketClaim(number, { agentRunId })),
  );

  server.registerTool(
    'create_ticket',
    {
      title: 'Create Ticket',
      description:
        'Create a Ticket in a Project and return it with its new Ticket number. The title is required, one line and at most 200 characters; the description is optional Markdown of at most 50,000 characters; the Status defaults to Todo.',
      inputSchema: {
        projectId: projectId.describe(
          'The Project the Ticket belongs to (id from list_projects).',
        ),
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
          .describe(
            'Optional labels. Call list_labels to reuse existing ones.',
          ),
        acceptanceCriteria: z
          .array(newCriterion)
          .optional()
          .describe(
            `Optional acceptance criteria, in order, at most ${maxAcceptanceCriteria}: independently verifiable conditions for the Ticket's outcome.`,
          ),
      },
    },
    (input) => respond(() => tickets.createTicket(input)),
  );

  server.registerTool(
    'update_ticket',
    {
      title: 'Update Ticket',
      description:
        'Change any subset of a Ticket\'s title, description, Status, Project, labels and acceptance criteria in one atomic change, and return the updated Ticket. Fields left out stay as they are. Use it to move a Ticket to "In progress" when you start and to "Done" when you finish, and to swap a triage state label with removeLabels and addLabels together. The same rules apply as for create_ticket.',
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
        status: status.optional().describe('The new Status.'),
        projectId: projectId
          .optional()
          .describe('Move the Ticket to this Project (id from list_projects).'),
        addLabels,
        removeLabels,
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
      },
    },
    ({ number, ...changes }) =>
      respond(() => tickets.updateTicket(number, changes)),
  );

  server.registerTool(
    'update_tickets',
    {
      title: 'Update Tickets',
      description: `Apply the same Status and/or label change to each of an explicit list of Ticket numbers, at most ${maxBatchSize} per call, by the rules of update_ticket. Each Ticket's change is atomic; the batch is not. Returns { updated, failed }: the changed Tickets, and the number and error of each Ticket left unchanged. If any Ticket failed the result is an error, but the Tickets in updated were still changed. A bad change or list of numbers is refused and changes nothing.`,
      inputSchema: {
        ticketNumbers: z
          .array(ticketNumber)
          .describe(
            `The Ticket numbers to change, each once, from 1 to ${maxBatchSize} of them.`,
          ),
        status: status.optional().describe('The new Status.'),
        addLabels,
        removeLabels,
      },
    },
    (input) => respondBatch(() => tickets.updateTickets(input)),
  );

  server.registerTool(
    'set_acceptance_criteria_checked',
    {
      title: 'Check acceptance criteria',
      description:
        "Check or uncheck some of a Ticket's acceptance criteria by id, and return the Ticket. Its other criteria, their order and the Ticket's Status stay as they are.",
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
      },
      annotations: { idempotentHint: true },
    },
    ({ number, criteria }) =>
      respond(() => tickets.setAcceptanceCriteriaChecked(number, criteria)),
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
      description:
        'Add labels to a Ticket and return it. Labels are trimmed and lower-cased; ones the Ticket already has are kept once.',
      inputSchema: {
        number: ticketNumber,
        labels: z.array(label).describe('The labels to add, at least one.'),
      },
      annotations: { idempotentHint: true },
    },
    ({ number, labels }) => respond(() => tickets.addLabels(number, labels)),
  );

  server.registerTool(
    'remove_ticket_labels',
    {
      title: 'Remove Ticket labels',
      description:
        'Remove labels from a Ticket and return it. Matching ignores case; labels the Ticket does not have are ignored.',
      inputSchema: {
        number: ticketNumber,
        labels: z.array(label).describe('The labels to remove, at least one.'),
      },
      annotations: { idempotentHint: true },
    },
    ({ number, labels }) => respond(() => tickets.removeLabels(number, labels)),
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
      description:
        'Record that the blocker Ticket must be resolved (Done or archived) before the blocked Ticket can start, and return the blocked Ticket. The two may be in different Projects. A Ticket cannot block itself, and a Blocker that would make a cycle is refused. Adding one that exists already changes nothing.',
      inputSchema: {
        blocker: ticketNumber.describe(
          'The Ticket that must be resolved first, e.g. 41 for #41.',
        ),
        blocked: ticketNumber.describe(
          'The Ticket that waits for it, e.g. 42 for #42.',
        ),
      },
      annotations: { idempotentHint: true },
    },
    (input) => respond(() => tickets.addBlocker(input)),
  );

  server.registerTool(
    'remove_blocker',
    {
      title: 'Remove Blocker',
      description:
        'Stop the blocker Ticket blocking the blocked Ticket, and return the blocked Ticket. Removing a Blocker the Ticket does not have changes nothing.',
      inputSchema: {
        blocker: ticketNumber.describe(
          'The Ticket that blocks, e.g. 41 for #41.',
        ),
        blocked: ticketNumber.describe(
          'The Ticket it blocks, e.g. 42 for #42.',
        ),
      },
      annotations: { idempotentHint: true },
    },
    (input) => respond(() => tickets.removeBlocker(input)),
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
      description:
        'Archive a Ticket and return it. It leaves the Board and list_tickets (unless includeArchived is set) but keeps everything; restore_ticket brings it back. Tickets cannot be deleted.',
      inputSchema: { number: ticketNumber },
      annotations: { idempotentHint: true },
    },
    ({ number }) => respond(() => tickets.archiveTicket(number)),
  );

  server.registerTool(
    'restore_ticket',
    {
      title: 'Restore Ticket',
      description:
        'Bring an archived Ticket back onto the Board exactly as it was, and return it.',
      inputSchema: { number: ticketNumber },
      annotations: { idempotentHint: true },
    },
    ({ number }) => respond(() => tickets.restoreTicket(number)),
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
  const server = createMcpServer(tickets);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
