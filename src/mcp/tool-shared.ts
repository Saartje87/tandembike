import type {
  McpServer,
  ToolCallback,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { attachmentPath } from '../app/lib/paths';
import { maxAttachmentSize } from '../tickets/attachments';
import { removeFromCycleFirst } from '../tickets/cycles';
import { agentEpicLink, type EpicLink } from '../tickets/epic-link';
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
import {
  maxAcceptanceCriteria,
  maxAcceptanceCriterionLength,
  maxCommentLength,
  type Project,
  type Ticket,
  type TicketDetail,
  type Tickets,
  ticketDetails,
  ticketSummary,
} from '../tickets/tickets';
import { readFileSync, type Stats, statSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';

export const projectId = z
  .number()
  .int()
  .positive()
  .describe('The id of a Project, as returned by get_project.');

export const ticketNumber = z
  .number()
  .int()
  .positive()
  .describe('The Ticket number, e.g. 42 for T42.');

export const label = z
  .string()
  .describe(
    'A label, one line of at most 50 characters. It is trimmed and lower-cased.',
  );

export const addLabels = z
  .array(label)
  .optional()
  .describe(
    'Labels to add, after removeLabels are removed. Call get_project to reuse the labels in use.',
  );

export const removeLabels = z
  .array(label)
  .optional()
  .describe(
    'Labels to remove, ignoring case; ones the Ticket does not have are ignored. A label may not be in both addLabels and removeLabels.',
  );

export const externalReference = z
  .string()
  .describe(
    `An External reference: the same work in another system, such as a GitHub issue or a Jira issue. Either an absolute http(s) URL of at most ${maxExternalReferenceUrlLength.toLocaleString('en-US')} characters, or a key without spaces of at most ${maxExternalReferenceKeyLength} characters, such as ABC-33, or a GitHub issue number after a hash, alone or after owner/repo. It is trimmed and kept as typed.`,
  );

export const addExternalReferences = z
  .array(externalReference)
  .optional()
  .describe(
    `External references to add after the ones the Ticket has, after removeExternalReferences are removed; ones it already has (exact match) are ignored. A Ticket has at most ${maxExternalReferences}.`,
  );

export const removeExternalReferences = z
  .array(externalReference)
  .optional()
  .describe(
    'External references to remove, matched exactly; ones the Ticket does not have are ignored. A reference may not be in both addExternalReferences and removeExternalReferences.',
  );

export const commentId = z
  .number()
  .int()
  .positive()
  .describe('The id of a comment, as returned by get_ticket.');

export const commentBody = z
  .string()
  .describe(
    `The comment in Markdown, at most ${maxCommentLength.toLocaleString('en-US')} characters. It is trimmed and may not be empty.`,
  );

export const attachmentId = z
  .number()
  .int()
  .positive()
  .describe('The id of an Attachment, as returned by get_ticket or attach.');

export const base64Content = /^[A-Za-z0-9+/]*={0,2}$/;

/** `attachment` with the localhost `url` the app serves its content at. */
export function withUrl<Metadata extends { id: number }>(
  attachment: Metadata,
  origin: string,
) {
  return { ...attachment, url: `${origin}${attachmentPath(attachment.id)}` };
}

/** The bytes of base64 `content`, or a refusal when it is not base64. */
export function bytesOfContent(content: string): Uint8Array {
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
export function readLocalFile(path: string, name: string | undefined) {
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
export function decodeBase64(text: string): Uint8Array | undefined {
  const compact = text.replace(/\s/g, '');
  if (compact.length % 4 !== 0 || !base64Content.test(compact)) {
    return undefined;
  }
  return new Uint8Array(Buffer.from(compact, 'base64'));
}

export const criterionId = z
  .number()
  .int()
  .positive()
  .describe(
    "The id of one of the Ticket's acceptance criteria, as returned by get_ticket.",
  );

export const criterionText = z
  .string()
  .describe(
    `The criterion: one line of at most ${maxAcceptanceCriterionLength} characters. It is trimmed and may not be empty.`,
  );

export const newCriterion = z.strictObject({
  text: criterionText,
  checked: z
    .boolean()
    .optional()
    .describe('Whether it is met already. Defaults to false.'),
});

export const cycleId = z
  .number()
  .int()
  .positive()
  .describe('The id of a Cycle, as returned by get_project or create_cycle.');

export const batchTicketNumbers = z
  .array(ticketNumber)
  .describe(
    `The Ticket numbers, each once, from 1 to ${maxBatchSize} of them.`,
  );

export const cycleTitle = z
  .string()
  .describe(
    "The Cycle's goal as its title: one line of at most 200 characters. It is trimmed and may not be empty.",
  );

export const originNumber = ticketNumber.describe(
  'The Ticket it was split from, such as the spec it came out of, in any Project. An Origin chain cannot loop.',
);

export const epicColor = z
  .enum(paletteColors)
  .describe(
    `An Epic's colour, one of ${paletteColors.join(', ')}, which marks its children on the Board. Only an Epic has a colour.`,
  );

export const status = z
  .enum(statuses)
  .describe('The Status: "Todo", "In progress" or "Done".');

export const detail = z
  .enum(ticketDetails)
  .optional()
  .describe(
    'How much of the Ticket to return. "summary", the default: the short answer this tool describes. "full": the whole Ticket, as get_ticket returns it.',
  );

/** The fields of a `TicketSummary`, as tool descriptions list them. */
export const summaryFields = 'number, title, status, labels and blocked';

/**
 * How a tool that changes a Ticket describes its answer: the summary of the
 * Ticket `subject` names, plus `extra` when the summary does not show the
 * change (ADR 0014).
 */
export function returnsSummary({
  subject = 'the Ticket',
  extra,
}: {
  subject?: string;
  extra?: string;
} = {}) {
  return `Returns ${subject}'s summary: ${summaryFields}${extra ? `, plus ${extra}` : ''}. detail: "full" returns the whole Ticket instead, as get_ticket does.`;
}

/** What the text fields of a `file_tickets` Ticket say about `{{T:n}}`. */
export const placeholderNote =
  '{{T:n}} is replaced by the number of the Ticket at position n of this list, counted from 0.';

/** `field` with `placeholderNote` added to its description. */
export function withPlaceholderNote<Field extends z.ZodType>(
  field: Field,
): Field {
  return field.describe(`${field.description} ${placeholderNote}`);
}

/** The fields of a new Ticket that `file_tickets` share. */
export const newTicketFields = {
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
    .describe('Optional labels. Call get_project to reuse the labels in use.'),
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
export function agentProject({ id, name, archived, createdAt }: Project) {
  return { id, name, archived, createdAt };
}

/**
 * A Ticket's `epic` as Agents see it, wherever a result holds one: its
 * number, title and colour. The Claim and PR reference it also carries are
 * for the Board's Lanes (T1143); Agents read those on the Epic itself.
 */
export function agentValue(key: string, value: unknown): unknown {
  return key === 'epic' && isEpicLink(value) ? agentEpicLink(value) : value;
}

export function isEpicLink(value: unknown): value is EpicLink {
  return (
    typeof value === 'object' &&
    value !== null &&
    'number' in value &&
    'hasPullRequest' in value
  );
}

/** `value` as a tool result of pretty-printed JSON text. */
export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, agentValue, 2) }],
  };
}

/**
 * A domain error as a tool error carrying the module's message; anything
 * else is a bug and is rethrown.
 */
export function errorResult(error: unknown): CallToolResult {
  if (error instanceof TicketsError) {
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
  throw error;
}

/** Runs a Tickets module call for a tool and returns its result as JSON text. */
export function respond(call: () => unknown): CallToolResult {
  try {
    return jsonResult(call());
  } catch (error) {
    return errorResult(error);
  }
}

/** `ticket` without its description, for reads given `description: false`. */
export function withoutDescription({
  description: _description,
  ...rest
}: Ticket): Omit<Ticket, 'description'> {
  return rest;
}

/**
 * Runs a Tickets module call that changes a Ticket and answers with it as
 * `detail` asks: whole when "full", otherwise its summary plus `changed`, the
 * fields the call changed that the summary does not show (ADR 0014).
 */
export function respondTicket(
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
export function respondBatch(
  call: () => { failed: BatchFailure[] },
): CallToolResult {
  try {
    const batch = call();
    return { ...jsonResult(batch), isError: batch.failed.length > 0 };
  } catch (error) {
    return errorResult(error);
  }
}

/**
 * `message`, pointing an Agent to update_ticket's cycleId when it is the refusal to plan
 * a Ticket that is in another Cycle already.
 */
export function withMoveHint(message: string): string {
  return message.endsWith(removeFromCycleFirst)
    ? `${message.slice(0, -removeFromCycleFirst.length)} Move it with update_ticket cycleId, or unplan it from that Cycle first.`
    : message;
}

/** A tool's input: an object of `Shape` that refuses any other field. */
export type StrictInput<Shape extends z.ZodRawShape> = z.ZodObject<
  Shape,
  z.core.$strict
>;

/**
 * The tools a client loads up front rather than deferring behind a tool
 * search (`_meta["anthropic/alwaysLoad"]`, T623). Without it, Claude Code
 * spent about three ToolSearch calls per Triage run loading these schemas
 * before its first `get_ticket`. Keep the set small: every tool in it costs
 * context in every request, whether the run uses it or not. It holds the
 * tools every stored Triage transcript called; leave the rest deferred.
 */
export const alwaysLoadedTools = new Set([
  'get_ticket',
  'add_note',
  'update_ticket',
  'start_work',
]);

export const hasProject = ({
  projectId,
  projectName,
}: {
  projectId?: number;
  projectName?: string;
}) => projectId !== undefined || projectName !== undefined;

/** Registers one tool on the server it was made for, strictly (T417). */
export type RegisterTool = <Shape extends z.ZodRawShape>(
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: Shape;
    annotations?: ToolAnnotations;
  },
  handler: ToolCallback<StrictInput<Shape>>,
) => ReturnType<McpServer['registerTool']>;

/**
 * Makes the `registerTool` of `server`: a tool whose input refuses any field
 * it does not list, naming it, instead of dropping it (T417). Register every
 * tool through this; nested input objects use `z.strictObject` for the same.
 * It also marks the tools in `alwaysLoadedTools` to load up front.
 */
export const toolRegistrar =
  (server: McpServer): RegisterTool =>
  (name, { inputSchema, ...config }, handler) =>
    server.registerTool<z.ZodRawShape, StrictInput<z.ZodRawShape>>(
      name,
      {
        ...config,
        inputSchema: z.strictObject(inputSchema) as never,
        ...(alwaysLoadedTools.has(name) && {
          _meta: { 'anthropic/alwaysLoad': true },
        }),
      },
      handler as never,
    );

/** What every tool group registers its tools with. */
export type ToolContext = {
  tickets: Tickets;
  origin: string;
  cwd: string | undefined;
  /** The Agent-run ID of the caller's `X-Tandembike-Run` header, if sent. */
  runId: string | undefined;
  /** The Project `ref` names, else the one of the caller's folder (ADR 0036). */
  resolveProjectId: (ref: {
    projectId?: number;
    projectName?: string;
  }) => number;
  registerTool: RegisterTool;
};

/** An explicit `agentRunId` wins over the run's header; with neither, refuse. */
export function requireRunId(
  explicit: string | undefined,
  runId: string | undefined,
): string {
  const id = explicit?.trim() || runId;
  if (!id) {
    throw new Error('Pass agentRunId, a unique ID for this Agent run.');
  }
  return id;
}
