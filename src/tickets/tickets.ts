import {
  type AnyColumn,
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  not,
  notInArray,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import {
  projects,
  ticketAcceptanceCriteria,
  ticketAttachments,
  ticketBlockers,
  ticketComments,
  ticketLabels,
  tickets,
} from '../db/schema';
import {
  type ActivityEntry,
  type Actor,
  activityOf,
  deleteActivity,
  recordActivity,
} from './activity';
import type { ActivityChange } from './activity-change';
import { checkProjectWritable, checkTicketWritable } from './archived-projects';
import {
  type AddAttachmentInput,
  type Attachment,
  attachmentColumns,
  checkAttachmentCount,
  checkedAttachment,
  deleteAttachments,
  type StoredAttachment,
  withAttachments,
} from './attachments';
import { type ChangeChannel, createChangeChannel } from './changes';
import { claimOwner } from './claim-owner';
import {
  type CycleLink,
  createCycles,
  cycleMembers,
  leaveAllCycles,
  leaveOpenCycles,
  outOfBacklog,
  planNewTicket,
  withCycles,
} from './cycles';
import {
  checkChildrenArchived,
  checkEpicChild,
  checkEpicClaimable,
  checkEpicNotArchived,
  checkNoBlockerBetween,
  checkNotEpicAndChild,
  checkUngrouped,
  claimedEpics,
  type EpicChildInput,
  type EpicChildrenInput,
  epicStatusRule,
  syncEpicStatus,
} from './epics';
import {
  type BatchFailure,
  NameTakenError,
  NotAllowedError,
  NotFoundError,
  TicketsError,
  ValidationError,
} from './errors';
import {
  checkExternalReferenceCount,
  checkExternalReferences,
  checkExternalReferencesFilter,
  checkedExternalReferences,
  checkNewExternalReferences,
  deleteExternalReferences,
  externalReferenceChanges,
  externalReferencesOf,
  insertExternalReferences,
  normalizeExternalReferences,
  withAnyExternalReference,
  withExternalReferences,
} from './external-references';
import {
  checkOrigin,
  type OriginLink,
  type SplitOffTicket,
  withOrigins,
} from './origins';
import {
  isPaletteColor,
  type PaletteColor,
  paletteColors,
  paletteRule,
} from './palette';
import { nextPosition } from './positions';
import {
  isProjectIcon,
  type ProjectIcon,
  projectIconRule,
} from './project-icons';
import { createReferenceTemplates } from './reference-templates';
import {
  checkBatchNumbers,
  checkTitle,
  maxBatchSize,
  throwFieldErrors,
} from './rules';
import { createStats } from './stats';
import { isStatus, type Status, statuses, statusRule } from './status';
import { isTicketType, type TicketType } from './ticket-type';

export type Project = {
  id: number;
  name: string;
  /** A colour from the palette, set by the User, or `null` for none. */
  color: PaletteColor | null;
  /** One of the Project icons, set by the User, or `null` for the default. */
  icon: ProjectIcon | null;
  /** Hidden from the normal views, and read-only with its Tickets. */
  archived: boolean;
  createdAt: Date;
};

export type CreateProjectInput = { name: string };

export type RenameProjectInput = { name: string };

/** A new colour and/or icon for a Project; `null` clears one. */
export type StyleProjectInput = {
  color?: PaletteColor | null;
  icon?: ProjectIcon | null;
};

/**
 * A Project by its id, its name (ignoring case and surrounding spaces) or
 * both, when they name the same Project.
 */
export type ProjectRef = { projectId?: number; projectName?: string };

export type Tickets = ReturnType<typeof createTickets>;

const projectColumns = {
  id: projects.id,
  name: projects.name,
  color: projects.color,
  icon: projects.icon,
  archived: projects.archived,
  createdAt: projects.createdAt,
};

export type Ticket = {
  number: number;
  title: string;
  /** Markdown; empty when the Ticket has none. */
  description: string;
  status: Status;
  /** Fixed at creation: a normal Ticket, or an Epic grouping children. */
  type: TicketType;
  /** An Epic's colour from the palette; always `null` for a normal Ticket. */
  color: PaletteColor | null;
  /** The Epic this Ticket is a child of, or `null` when it has none. */
  epic: EpicLink | null;
  /**
   * An Epic's children, archived ones included, by Ticket number; always
   * empty for a normal Ticket.
   */
  children: EpicChild[];
  /** The Ticket this one was split from (ADR 0015), or `null`. */
  origin: OriginLink | null;
  /** The Tickets split from this one, archived ones included, by number. */
  splitOff: SplitOffTicket[];
  /**
   * The Cycle whose Board it shows on (ADR 0013): the Prepared or Active one
   * it is planned into, else for a Done Ticket the most recently archived
   * one that kept it, else `null` for the Backlog.
   */
  cycle: CycleLink | null;
  projectId: number;
  position: number;
  archived: boolean;
  /** Trimmed, lower-cased and sorted; empty when the Ticket has none. */
  labels: string[];
  /**
   * URLs or keys pointing to the same work elsewhere, trimmed, in the order
   * they were added; empty when the Ticket has none.
   */
  externalReferences: string[];
  /** Files added to the Ticket (ADR 0018), in the order added, without content. */
  attachments: Attachment[];
  /** The numbers of the Ticket's Blockers, sorted, resolved ones included. */
  blockedBy: number[];
  /** Whether any Blocker is unresolved: neither Done nor archived. */
  blocked: boolean;
  /** The Agent run holding this Ticket's claim, or `null` when unclaimed. */
  claim: TicketClaim | null;
  /** In order; empty when the Ticket has none (ADR 0007). */
  acceptanceCriteria: AcceptanceCriterion[];
  createdAt: Date;
  updatedAt: Date;
};

/** The Epic a child Ticket belongs to. */
export type EpicLink = Pick<Ticket, 'number' | 'title'> & {
  color: PaletteColor;
};

/**
 * Epic `epic` as its children link to it. Every Epic has a colour; grey
 * only stands in should one ever lack it.
 */
export function epicLinkOf({
  number,
  title,
  color,
}: Pick<Ticket, 'number' | 'title' | 'color'>): EpicLink {
  return { number, title, color: color ?? 'grey' };
}

/** A child Ticket as its Epic lists it. */
export type EpicChild = Pick<
  Ticket,
  'number' | 'title' | 'status' | 'archived' | 'blockedBy' | 'blocked'
>;

export type AcceptanceCriterion = {
  id: number;
  /** One line, trimmed and never empty. */
  text: string;
  checked: boolean;
};

export type TicketClaim = {
  agentRunId: string;
  agentName: string | null;
};

export type ClaimTicketInput = {
  agentRunId: string;
  agentName?: string;
};

export type CreateTicketInput = {
  projectId: number;
  title: string;
  description?: string;
  /** Defaults to Todo. */
  status?: Status;
  /** Defaults to none. */
  labels?: string[];
  /** In order; defaults to none. */
  externalReferences?: string[];
  /** In order; defaults to none. Each starts unchecked unless `checked`. */
  acceptanceCriteria?: NewAcceptanceCriterion[];
  /** A Cycle of the same Project to plan it into; defaults to none. */
  cycleId?: number;
  /** Fixed once created. Defaults to a normal Ticket. */
  type?: TicketType;
  /**
   * An Epic's colour. Defaults to the colour fewest live Epics in the
   * Project use; a normal Ticket has none.
   */
  color?: PaletteColor;
  /** An Epic of the same Project to create it under; defaults to none. */
  epicNumber?: number;
  /** The Ticket it was split from, in any Project; defaults to none. */
  originNumber?: number;
};

export type NewAcceptanceCriterion = Pick<AcceptanceCriterion, 'text'> & {
  /** Defaults to false. */
  checked?: boolean;
};

/** Normal Tickets to create in one Project, all or none. */
export type CreateTicketBatchInput = {
  projectId: number;
  /** An Epic of the same Project to create them all under. */
  epicNumber?: number;
  /** The Ticket they were all split from, in any Project. */
  originNumber?: number;
  /** A Cycle of the same Project to plan them all into. */
  cycleId?: number;
  /** In order, from 1 to `maxBatchSize` of them. */
  tickets: BatchTicketInput[];
};

/** One Ticket of a batch: the fields of `CreateTicketInput` that apply. */
export type BatchTicketInput = Pick<
  CreateTicketInput,
  | 'title'
  | 'description'
  | 'status'
  | 'labels'
  | 'externalReferences'
  | 'acceptanceCriteria'
> & {
  /**
   * The positions, from 0, of the earlier Tickets in the batch that block
   * this one. Defaults to none.
   */
  blockedByPositions?: number[];
};

/** Any subset of a Ticket's editable fields; missing ones stay as they are. */
export type UpdateTicketInput = {
  title?: string;
  description?: string;
  status?: Status;
  projectId?: number;
  /** An Epic's new colour; a normal Ticket has none. */
  color?: PaletteColor;
  /** The Ticket it was split from, in any Project, or `null` for none. */
  originNumber?: number | null;
  /** Labels to add, after `removeLabels` are removed. */
  addLabels?: string[];
  /** Labels to remove, ignoring case and ones the Ticket does not have. */
  removeLabels?: string[];
  /** External references to add, after `removeExternalReferences`. */
  addExternalReferences?: string[];
  /** External references to remove; ones the Ticket does not have are ignored. */
  removeExternalReferences?: string[];
  /**
   * The Ticket's whole list of acceptance criteria, in order. Ones left out
   * are removed.
   */
  acceptanceCriteria?: AcceptanceCriterionInput[];
};

/**
 * A criterion in a replacement list: one of the Ticket's by `id`, or a new
 * one without. A kept criterion keeps its checked state when `checked` is
 * left out, unless its text changes, which unchecks it.
 */
export type AcceptanceCriterionInput = NewAcceptanceCriterion & {
  id?: number;
};

/** A new checked state for one of a Ticket's acceptance criteria. */
export type AcceptanceCriterionCheckedInput = Pick<
  AcceptanceCriterion,
  'id' | 'checked'
>;

/** The same Status and label change for each of `ticketNumbers`. */
export type UpdateTicketsInput = Pick<
  UpdateTicketInput,
  'status' | 'color' | 'addLabels' | 'removeLabels'
> & {
  /** Explicit Ticket numbers, each once, at most `maxBatchSize`. */
  ticketNumbers: number[];
};

/** How `archiveTicket` and `archiveTickets` treat an Epic's children. */
export type ArchiveTicketOptions = {
  /**
   * Archive an Epic's children that are not archived along with it,
   * instead of refusing the Epic while they are; restoring the Epic brings
   * them back. Defaults to false. Only the User does this: no MCP tool
   * passes it.
   */
  withChildren?: boolean;
};

/** How `deleteTicket` treats an Epic's children. */
export type DeleteTicketOptions = {
  /** Delete the children too, instead of detaching them. Defaults to false. */
  withChildren?: boolean;
};

/** Which Tickets a batch update changed and which it did not, and why. */
export type UpdateTicketsResult = {
  /** The changed Tickets, in the order given. */
  updated: Ticket[];
  /** The Tickets left unchanged, in the order given. */
  failed: BatchFailure[];
};

export type ReorderTicketsInput = {
  projectId: number;
  status: Status;
  ticketNumbers: number[];
  /**
   * Reorder only the lane as a Cycle's tab shows it, or with `null`, as the
   * Backlog shows it; see `ListTicketsFilter.cycleId`. Defaults to the whole
   * Project's lane.
   */
  cycleId?: number | null;
};

export type MoveTicketsInput = {
  projectId: number;
  /** The Tickets to move, each once, at most `maxBatchSize`, in the order they land in. */
  ticketNumbers: number[];
  status: Status;
  /**
   * The Ticket in the `status` lane they land just before, or `null` for the
   * end of the lane.
   */
  before: number | null;
};

export type ListTicketsFilter = {
  projectId?: number;
  /** Only Tickets in this Status, or in any of these Statuses. */
  status?: Status | readonly Status[];
  /** Only Tickets that have every one of these labels, ignoring case. */
  labels?: string[];
  /**
   * Also list archived Tickets, and Tickets of archived Projects, which are
   * left out by default unless `projectId` names their Project.
   */
  includeArchived?: boolean;
  /**
   * Only Tickets with an unresolved Blocker when true, or only Tickets with
   * none when false: ready to start, by their Blockers.
   */
  blocked?: boolean;
  /** Only Tickets that are claimed when true, or unclaimed when false. */
  claimed?: boolean;
  /**
   * Only the Tickets planned into this Cycle, or with `null`, only those in
   * no Prepared or Active Cycle: the Backlog, Done ones included.
   */
  cycleId?: number | null;
  /** Only the Tickets split from this Ticket: whose Origin it is. */
  originNumber?: number;
  /** Only normal Tickets, or only Epics. */
  type?: TicketType;
};

export const defaultPageSize = 50;

export const maxPageSize = 200;

/** `projectName` names the Project in place of, or as well as, `projectId`. */
export type FindTicketsInput = ListTicketsFilter &
  ProjectRef & {
    /**
     * Only Tickets whose title or description contains this, trimmed and
     * ignoring (ASCII) case.
     */
    query?: string;
    /**
     * Only Tickets with at least one of these External references, each
     * trimmed and matched exactly.
     */
    externalReferences?: string[];
    /** At most this many Tickets, from 1 to `maxPageSize`; `defaultPageSize` if left out. */
    limit?: number;
    /** List the Tickets after this Ticket number: a previous page's `nextCursor`. */
    cursor?: number;
    /** How much of each Ticket to list; defaults to `summary`. */
    detail?: TicketDetail;
    /** The order to list them in; defaults to `created`. */
    sort?: TicketSort;
  };

/**
 * The orders `findTickets` lists Tickets in: oldest-created first, or Board
 * order, lane by lane in Status order. Board order needs one Project.
 */
export const ticketSorts = ['created', 'position'] as const;

export type TicketSort = (typeof ticketSorts)[number];

/**
 * How much of each Ticket `findTickets` lists: a short `TicketSummary`, or
 * the whole Ticket.
 */
export const ticketDetails = ['summary', 'full'] as const;

export type TicketDetail = (typeof ticketDetails)[number];

/**
 * A Ticket as `findTickets` lists it by default: its number, title, Status,
 * labels and whether it is blocked, plus its Project unless the search was
 * for one Project.
 */
export type TicketSummary = Pick<
  Ticket,
  'number' | 'title' | 'status' | 'labels' | 'blocked'
> &
  Partial<Pick<Ticket, 'projectId'>>;

/** `ticket` as a `TicketSummary`, without its Project. */
export function ticketSummary({
  number,
  title,
  status,
  labels,
  blocked,
}: Pick<
  Ticket,
  'number' | 'title' | 'status' | 'labels' | 'blocked'
>): TicketSummary {
  return { number, title, status, labels, blocked };
}

/** One page of `findTickets`. */
export type TicketPage = {
  /** Whole Tickets when `detail` is `full`. */
  tickets: TicketSummary[] | Ticket[];
  /** The `cursor` for the next page, or `null` on the last page. */
  nextCursor: number | null;
  /** How many Tickets match the filters, over all pages. */
  total: number;
};

/** Who wrote a Comment: the UI writes `user`, MCP writes `agent`. */
export type CommentAuthor = Actor;

export type Comment = {
  id: number;
  ticketNumber: number;
  author: CommentAuthor;
  /** Markdown, trimmed and never empty. */
  body: string;
  createdAt: Date;
  /** When the comment was last edited, or `null` if it never was. */
  editedAt: Date | null;
};

/** A blocking relationship: `blocker` must be resolved before `blocked` is ready. */
export type BlockerInput = { blocker: number; blocked: number };

/** A Ticket on the other side of a blocking relationship. */
export type RelatedTicket = Pick<
  Ticket,
  'number' | 'title' | 'status' | 'projectId' | 'archived'
> & {
  /** Whether it is Done or archived, so it no longer blocks anything. */
  resolved: boolean;
};

/** A Ticket's blocking relationships, each list by Ticket number. */
export type Blockers = {
  /** The Ticket's Blockers. */
  blockedBy: RelatedTicket[];
  /** The Tickets it is a Blocker of. */
  blocks: RelatedTicket[];
};

export type AddCommentInput = { body: string; author: CommentAuthor };

export type EditCommentInput = {
  body: string;
  /** Who is editing; an Agent may only edit an Agent's comment. */
  by: CommentAuthor;
};

export type RemoveCommentInput = Pick<EditCommentInput, 'by'>;

export type RemoveAttachmentInput = {
  /** Who is removing; an Agent may only remove an Agent's Attachment. */
  by: Actor;
};

export const maxDescriptionLength = 50_000;

function checkDescription(description: string): string | undefined {
  if (description.length > maxDescriptionLength) {
    return `Keep the description to ${maxDescriptionLength.toLocaleString('en-US')} characters or fewer.`;
  }
  return undefined;
}

export const maxCommentLength = 50_000;

/** A comment body trimmed, or a `ValidationError` if it is empty or too long. */
function checkedCommentBody(rawBody: string): string {
  const body = rawBody.trim();
  throwFieldErrors({
    body:
      body === ''
        ? 'Enter a comment.'
        : body.length > maxCommentLength
          ? `Keep the comment to ${maxCommentLength.toLocaleString('en-US')} characters or fewer.`
          : undefined,
  });
  return body;
}

function checkedAgentRunId(rawAgentRunId: string): string {
  const agentRunId = rawAgentRunId.trim();
  throwFieldErrors({
    agentRunId:
      agentRunId === ''
        ? 'Enter an Agent run id to claim a Ticket.'
        : undefined,
  });
  return agentRunId;
}

function checkStatus(status: string): string | undefined {
  return isStatus(status) ? undefined : statusRule;
}

export const maxLabelLength = 50;

/** Labels as they are stored: trimmed, lower-cased and each once. */
function normalizeLabels(labels: readonly string[]): string[] {
  return [...new Set(labels.map((label) => label.trim().toLowerCase()))];
}

/** Why one of the normalized `labels` breaks the rules, if any does. */
function checkLabels(labels: readonly string[]): string | undefined {
  for (const label of labels) {
    if (label === '') {
      return 'Enter a label.';
    }
    if (/[\r\n]/.test(label)) {
      return 'Keep each label to one line.';
    }
    if (label.length > maxLabelLength) {
      return `Keep each label to ${maxLabelLength} characters or fewer.`;
    }
  }
  return undefined;
}

export const maxAcceptanceCriterionLength = 500;

export const maxAcceptanceCriteria = 100;

/** Why one of the trimmed criterion `texts` breaks the rules, if any does. */
function checkAcceptanceCriteria(texts: readonly string[]): string | undefined {
  if (texts.length > maxAcceptanceCriteria) {
    return `Keep to ${maxAcceptanceCriteria} acceptance criteria or fewer.`;
  }
  for (const text of texts) {
    if (text === '') {
      return 'Enter text for each acceptance criterion.';
    }
    if (/[\r\n]/.test(text)) {
      return 'Keep each acceptance criterion to one line.';
    }
    if (text.length > maxAcceptanceCriterionLength) {
      return `Keep each acceptance criterion to ${maxAcceptanceCriterionLength} characters or fewer.`;
    }
  }
  return undefined;
}

/**
 * The cleaned-up fields of a new Ticket, or a `ValidationError` with a
 * reason for every field that breaks the rules.
 */
function checkNewTicket(input: Omit<CreateTicketInput, 'projectId'>) {
  const title = input.title.trim();
  const description = input.description ?? '';
  const status = input.status ?? 'Todo';
  const type = input.type ?? 'Ticket';
  const labels = normalizeLabels(input.labels ?? []);
  const externalReferences = normalizeExternalReferences(
    input.externalReferences ?? [],
  );
  const acceptanceCriteria = (input.acceptanceCriteria ?? []).map(
    ({ text, checked }) => ({ text: text.trim(), checked: checked ?? false }),
  );

  throwFieldErrors({
    title: checkTitle(title),
    description: checkDescription(description),
    status:
      checkStatus(status) ??
      (type === 'Epic' && status !== 'Todo'
        ? "An Epic's Status follows its child Tickets. Leave the Status out."
        : undefined),
    type: isTicketType(type) ? undefined : 'Choose a type: Ticket or Epic.',
    color:
      input.color === undefined
        ? undefined
        : !isPaletteColor(input.color)
          ? paletteRule
          : type === 'Epic'
            ? undefined
            : 'Only an Epic has a colour. Leave the colour out.',
    labels: checkLabels(labels),
    externalReferences: checkNewExternalReferences(externalReferences),
    acceptanceCriteria: checkAcceptanceCriteria(
      acceptanceCriteria.map(({ text }) => text),
    ),
  });
  return {
    values: { title, description, status, type, color: input.color },
    labels,
    externalReferences,
    acceptanceCriteria,
  };
}

type CheckedNewTicket = ReturnType<typeof checkNewTicket>;

/**
 * The checked fields and Blocker positions of the batch's Ticket at
 * `position`, or a `ValidationError` naming it by position: each field is
 * keyed `tickets[2].title`, and each reason starts with the position.
 */
function checkBatchTicket(
  { blockedByPositions = [], ...input }: BatchTicketInput,
  position: number,
): { ticket: CheckedNewTicket; blockedByPositions: number[] } {
  const reasons: Record<string, string | undefined> = {};
  const reasonAt = (field: string, reason: string | undefined) => {
    reasons[`tickets[${position}].${field}`] =
      reason === undefined
        ? undefined
        : `Ticket at position ${position}: ${reason}`;
  };
  let ticket: CheckedNewTicket | undefined;
  try {
    ticket = checkNewTicket(input);
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    for (const [field, reason] of Object.entries(error.fieldErrors)) {
      reasonAt(field, reason);
    }
  }
  reasonAt(
    'blockedByPositions',
    checkBlockedByPositions(blockedByPositions, position),
  );
  throwFieldErrors(reasons);
  // Without a ValidationError, `checkNewTicket` returned.
  return { ticket: ticket as CheckedNewTicket, blockedByPositions };
}

/** Why a batch Ticket's Blocker positions break the rules, if they do. */
function checkBlockedByPositions(
  positions: readonly number[],
  position: number,
): string | undefined {
  if (positions.length === 0) {
    return undefined;
  }
  if (position === 0) {
    return 'blockedByPositions can only name earlier positions, and it is first.';
  }
  if (
    positions.some(
      (blocker) =>
        !Number.isInteger(blocker) || blocker < 0 || blocker >= position,
    )
  ) {
    return `blockedByPositions can only name earlier positions, from 0 to ${position - 1}.`;
  }
  if (new Set(positions).size !== positions.length) {
    return 'name each position in blockedByPositions once.';
  }
  return undefined;
}

/**
 * Inserts a checked new Ticket at the end of its Status lane, with its
 * labels and acceptance criteria and its `created` Activity entry by
 * `actor`, and returns its number. Run it in a transaction.
 */
function insertTicket(
  db: DatabaseConnection,
  actor: Actor,
  { values, labels, externalReferences, acceptanceCriteria }: CheckedNewTicket,
  row: {
    projectId: number;
    epicNumber: number | null;
    originNumber: number | null;
    createdAt: Date;
  },
): number {
  const { number } = db
    .insert(tickets)
    .values({
      ...values,
      color:
        values.type === 'Epic'
          ? (values.color ?? leastUsedColor(db, row.projectId))
          : null,
      ...row,
      position: nextPosition(db, row.projectId, values.status),
      updatedAt: row.createdAt,
    })
    .returning({ number: tickets.number })
    .get();
  insertLabels(db, number, labels);
  insertExternalReferences(db, number, externalReferences);
  insertAcceptanceCriteria(db, number, acceptanceCriteria);
  recordActivity(db, number, actor, [{ type: 'created' }]);
  return number;
}

/**
 * The palette colour fewest live Epics in Project `projectId` use, the
 * earliest in the palette on a tie, for a new Epic.
 */
function leastUsedColor(
  db: DatabaseConnection,
  projectId: number,
): PaletteColor {
  const uses = new Map(
    db
      .select({ color: tickets.color, uses: count() })
      .from(tickets)
      .where(
        and(
          eq(tickets.projectId, projectId),
          eq(tickets.type, 'Epic'),
          eq(tickets.archived, false),
          isNotNull(tickets.color),
        ),
      )
      .groupBy(tickets.color)
      .all()
      .map(({ color, uses }) => [color, uses]),
  );
  return paletteColors.reduce((least, color) =>
    (uses.get(color) ?? 0) < (uses.get(least) ?? 0) ? color : least,
  );
}

/** The fields of a Ticket row an update may set. */
type TicketValues = Pick<
  UpdateTicketInput,
  'title' | 'description' | 'status' | 'projectId' | 'color' | 'originNumber'
>;

/**
 * A checked Ticket update: the row fields given, normalized labels and
 * External references, and the trimmed acceptance criteria, if given.
 */
type TicketChanges = {
  values: TicketValues;
  addLabels: string[];
  removeLabels: string[];
  addExternalReferences: string[];
  removeExternalReferences: string[];
  acceptanceCriteria?: AcceptanceCriterionInput[];
};

/**
 * The cleaned-up fields of a Ticket update, holding only the fields given,
 * or a `ValidationError` by the same rules as creating a Ticket. A label or
 * External reference named both to add and to remove is refused.
 */
function checkTicketChanges(input: UpdateTicketInput): TicketChanges {
  const title = input.title?.trim();
  const { description, status, projectId, color, originNumber } = input;
  const addLabels = normalizeLabels(input.addLabels ?? []);
  const removeLabels = normalizeLabels(input.removeLabels ?? []);
  const inBoth = addLabels.filter((label) => removeLabels.includes(label));
  const addExternalReferences = normalizeExternalReferences(
    input.addExternalReferences ?? [],
  );
  const removeExternalReferences = normalizeExternalReferences(
    input.removeExternalReferences ?? [],
  );
  const referencesInBoth = addExternalReferences.filter((reference) =>
    removeExternalReferences.includes(reference),
  );
  const acceptanceCriteria = input.acceptanceCriteria?.map((criterion) => ({
    ...criterion,
    text: criterion.text.trim(),
  }));

  throwFieldErrors({
    title: title === undefined ? undefined : checkTitle(title),
    description:
      description === undefined ? undefined : checkDescription(description),
    status: status === undefined ? undefined : checkStatus(status),
    color:
      color === undefined || isPaletteColor(color) ? undefined : paletteRule,
    addLabels: checkLabels(addLabels),
    removeLabels: checkLabels(removeLabels),
    labels:
      inBoth.length === 0
        ? undefined
        : `Name each label in addLabels or removeLabels, not both: ${inBoth.join(', ')}.`,
    addExternalReferences: checkExternalReferences(addExternalReferences),
    removeExternalReferences: checkExternalReferences(removeExternalReferences),
    externalReferences:
      referencesInBoth.length === 0
        ? undefined
        : `Name each External reference in addExternalReferences or removeExternalReferences, not both: ${referencesInBoth.join(', ')}.`,
    acceptanceCriteria:
      acceptanceCriteria === undefined
        ? undefined
        : (checkAcceptanceCriteria(
            acceptanceCriteria.map(({ text }) => text),
          ) ?? checkCriterionIds(acceptanceCriteria)),
  });
  const values = Object.fromEntries(
    Object.entries({
      title,
      description,
      status,
      projectId,
      color,
      originNumber,
    }).filter(([, value]) => value !== undefined),
  ) as TicketValues;
  return {
    values,
    addLabels,
    removeLabels,
    addExternalReferences,
    removeExternalReferences,
    acceptanceCriteria,
  };
}

/** The ids of the `criteria` that have one, in order. */
function givenIds(criteria: readonly { id?: number }[]): number[] {
  return criteria.flatMap(({ id }) => (id === undefined ? [] : [id]));
}

/** Why Ticket `number` has no acceptance criterion `id`. */
function noSuchCriterion(number: number, id: number | undefined) {
  return `Ticket T${number} has no acceptance criterion ${id}.`;
}

/** Why the ids in a list of criteria break the rules, if they do. */
function checkCriterionIds(criteria: readonly { id?: number }[]) {
  const ids = givenIds(criteria);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  return duplicate === undefined
    ? undefined
    : `Give each acceptance criterion once: ${duplicate} is given twice.`;
}

/** Why `limit` is not a valid page size, or `undefined` when it is fine. */
function checkLimit(limit: number): string | undefined {
  if (!Number.isInteger(limit) || limit < 1 || limit > maxPageSize) {
    return `Choose a limit from 1 to ${maxPageSize}.`;
  }
  return undefined;
}

/** Why a trimmed search `query` breaks the rules, if it does. */
function checkQuery(query: string): string | undefined {
  return query === ''
    ? 'Enter text to search for, or leave the query out.'
    : undefined;
}

const ticketColumns = {
  number: tickets.number,
  title: tickets.title,
  description: tickets.description,
  status: tickets.status,
  type: tickets.type,
  color: tickets.color,
  epicNumber: tickets.epicNumber,
  originNumber: tickets.originNumber,
  projectId: tickets.projectId,
  claimAgentRunId: tickets.claimAgentRunId,
  claimAgentName: tickets.claimAgentName,
  position: tickets.position,
  archived: tickets.archived,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
};

/** The columns `findTickets` turns into a `TicketSummary`. */
const summaryColumns = {
  number: tickets.number,
  title: tickets.title,
  status: tickets.status,
  projectId: tickets.projectId,
};

const relatedTicketColumns = {
  number: tickets.number,
  title: tickets.title,
  status: tickets.status,
  projectId: tickets.projectId,
  archived: tickets.archived,
};

const commentColumns = {
  id: ticketComments.id,
  ticketNumber: ticketComments.ticketNumber,
  author: ticketComments.author,
  body: ticketComments.body,
  createdAt: ticketComments.createdAt,
  editedAt: ticketComments.editedAt,
};

/**
 * The Tickets module: the only code that reads or writes Projects and
 * Tickets (ADR 0004). It validates input, persists to `db`, and announces
 * every change on `changes`. Errors it throws on purpose are `TicketsError`s
 * whose messages can be shown to the User or an Agent as-is.
 *
 * Without a `changes` channel it gets a private one; the app passes
 * `appChangeChannel()` so every caller shares the same announcements.
 *
 * Every change it makes to a Ticket is recorded as Activity by `actor`:
 * Server Actions pass `user` and the MCP route `agent` (ADR 0009).
 */
export function createTickets(
  db: DatabaseConnection,
  actor: Actor,
  changes: ChangeChannel = createChangeChannel(),
) {
  return {
    ...createCycles(db, changes, (numbers) =>
      archiveStep(numbers, { withChildren: true }),
    ),
    ...createReferenceTemplates(db, changes),
    ...createStats(db),

    /** All Projects, oldest first. */
    listProjects(): Project[] {
      return db
        .select(projectColumns)
        .from(projects)
        .orderBy(asc(projects.id))
        .all();
    },

    getProject(id: number): Project {
      const project = db
        .select(projectColumns)
        .from(projects)
        .where(eq(projects.id, id))
        .get();
      if (!project) {
        throw new NotFoundError(`There is no Project with id ${id}.`);
      }
      return project;
    },

    /**
     * The id of the Project `ref` names. An unknown name is refused with the
     * names of the existing Projects, so a stale one is caught at once.
     */
    resolveProjectId(ref: ProjectRef): number {
      const projectId = resolvedProjectId(db, ref);
      if (projectId === undefined) {
        throw new ValidationError({
          projectId: 'Choose a Project by projectId or projectName.',
        });
      }
      return projectId;
    },

    /** Creates a Project with a trimmed name, unique ignoring case. */
    createProject(input: CreateProjectInput): Project {
      const { name, nameKey } = availableProjectName(db, input.name);
      const project = db
        .insert(projects)
        .values({ name, nameKey, createdAt: new Date() })
        .returning(projectColumns)
        .get();
      changes.publish({ type: 'project', id: project.id });
      return project;
    },

    /**
     * Renames a Project by the same rules as creating one. Changing only the
     * casing of its own name is allowed.
     */
    renameProject(id: number, input: RenameProjectInput): Project {
      checkProjectWritable(db, id);
      const { name, nameKey } = availableProjectName(db, input.name, id);
      const project = db
        .update(projects)
        .set({ name, nameKey })
        .where(eq(projects.id, id))
        .returning(projectColumns)
        .get();
      if (!project) {
        throw new NotFoundError(`There is no Project with id ${id}.`);
      }
      changes.publish({ type: 'project', id });
      return project;
    },

    /**
     * Sets a Project's colour and/or icon from the fixed sets, or clears one
     * with `null`; fields left out stay as they are.
     */
    styleProject(id: number, input: StyleProjectInput): Project {
      checkProjectWritable(db, id);
      const { color, icon } = input;
      throwFieldErrors({
        color:
          color === undefined || color === null || isPaletteColor(color)
            ? undefined
            : paletteRule,
        icon:
          icon === undefined || icon === null || isProjectIcon(icon)
            ? undefined
            : projectIconRule,
      });
      const values = {
        ...(color === undefined ? {} : { color }),
        ...(icon === undefined ? {} : { icon }),
      };
      const project =
        Object.keys(values).length === 0
          ? db
              .select(projectColumns)
              .from(projects)
              .where(eq(projects.id, id))
              .get()
          : db
              .update(projects)
              .set(values)
              .where(eq(projects.id, id))
              .returning(projectColumns)
              .get();
      if (!project) {
        throw new NotFoundError(`There is no Project with id ${id}.`);
      }
      changes.publish({ type: 'project', id });
      return project;
    },

    /**
     * Archives Project `id`: it and its Tickets leave the normal views and
     * become read-only, but nothing is lost and its name stays reserved.
     * Its Tickets are not changed. Archiving it again changes nothing.
     */
    archiveProject(id: number): Project {
      return setProjectArchived(id, true);
    },

    /** Brings archived Project `id` back, its Tickets exactly as they were. */
    restoreProject(id: number): Project {
      return setProjectArchived(id, false);
    },

    /** Calls `listener` after every change; returns an unsubscribe. */
    subscribe: changes.subscribe,

    /**
     * Tickets matching `filter`, oldest-created first, leaving out archived
     * ones unless `includeArchived` is set.
     */
    listTickets(filter: ListTicketsFilter = {}): Ticket[] {
      const rows = db
        .select(ticketColumns)
        .from(tickets)
        .where(matchingTickets(db, filter))
        .orderBy(...oldestCreatedFirst)
        .all();
      return withRelations(db, rows);
    },

    /**
     * A page of Tickets matching `input`, oldest-created first, by the
     * filters of `listTickets`.
     */
    findTickets(input: FindTicketsInput = {}): TicketPage {
      const filter = { ...input, projectId: resolvedProjectId(db, input) };
      const limit = input.limit ?? defaultPageSize;
      const query = input.query?.trim();
      const references =
        input.externalReferences === undefined
          ? undefined
          : normalizeExternalReferences(input.externalReferences);
      const cursor =
        input.cursor === undefined
          ? undefined
          : db
              .select(orderColumns)
              .from(tickets)
              .where(eq(tickets.number, input.cursor))
              .get();
      const order = input.sort === 'position' ? boardOrder : oldestCreatedOrder;
      throwFieldErrors({
        limit: checkLimit(limit),
        status:
          input.status === undefined
            ? undefined
            : checkStatusFilter(input.status),
        query: query === undefined ? undefined : checkQuery(query),
        externalReferences:
          references === undefined
            ? undefined
            : checkExternalReferencesFilter(references),
        sort:
          input.sort === 'position' && filter.projectId === undefined
            ? 'Sorting by position needs a Project, since Board order exists only within one: give projectId or projectName.'
            : undefined,
        cursor:
          input.cursor !== undefined && !cursor
            ? `There is no Ticket T${input.cursor} to continue after.`
            : undefined,
      });
      const matching = and(
        matchingTickets(db, filter),
        query === undefined ? undefined : titleOrDescriptionContains(query),
        references === undefined
          ? undefined
          : withAnyExternalReference(db, references),
      );
      const numbers = db
        .select({ number: tickets.number })
        .from(tickets)
        .where(
          and(matching, cursor === undefined ? undefined : order.after(cursor)),
        )
        .orderBy(...order.by)
        .limit(limit + 1)
        .all()
        .map(({ number }) => number);
      const page = numbers.slice(0, limit);
      const inPage = inArray(tickets.number, page);
      return {
        tickets:
          input.detail === 'full'
            ? withRelations(
                db,
                inOrder(
                  page,
                  db.select(ticketColumns).from(tickets).where(inPage).all(),
                ),
              )
            : summaries(
                db,
                inOrder(
                  page,
                  db.select(summaryColumns).from(tickets).where(inPage).all(),
                ),
                filter.projectId === undefined,
              ),
        nextCursor: numbers.length > limit ? page[page.length - 1] : null,
        total:
          db.select({ total: count() }).from(tickets).where(matching).get()
            ?.total ?? 0,
      };
    },

    /** Every label on any Ticket, archived ones included, sorted. */
    listLabels(): string[] {
      return db
        .selectDistinct({ label: ticketLabels.label })
        .from(ticketLabels)
        .orderBy(asc(ticketLabels.label))
        .all()
        .map(({ label }) => label);
    },

    getTicket(number: number): Ticket {
      return getTicket(number);
    },

    /**
     * Claims Ticket `number` for one Agent run. Repeating a claim by that
     * run is idempotent; another run cannot replace the existing claim.
     */
    claimTicket(number: number, input: ClaimTicketInput): Ticket {
      const agentRunId = checkedAgentRunId(input.agentRunId);
      const agentName = input.agentName?.trim() || null;

      const changed = db.transaction(() => {
        checkTicketWritable(db, number);
        checkEpicClaimable(db, number, agentRunId);
        const claimed = db
          .update(tickets)
          .set({
            claimAgentRunId: agentRunId,
            claimAgentName: agentName,
            updatedAt: new Date(),
          })
          .where(
            and(eq(tickets.number, number), isNull(tickets.claimAgentRunId)),
          )
          .returning({ number: tickets.number })
          .get();
        if (claimed) {
          recordActivity(
            db,
            number,
            actor,
            claimChanges('claimTaken', {
              claimAgentRunId: agentRunId,
              claimAgentName: agentName,
            }),
          );
          return true;
        }

        const existing = db
          .select({
            claimAgentRunId: tickets.claimAgentRunId,
            claimAgentName: tickets.claimAgentName,
          })
          .from(tickets)
          .where(eq(tickets.number, number))
          .get();
        if (!existing) {
          throw new NotFoundError(`There is no Ticket T${number}.`);
        }
        if (existing.claimAgentRunId === agentRunId) {
          return false;
        }

        const owner = claimOwner(
          existing.claimAgentRunId,
          existing.claimAgentName,
        );
        throw new NotAllowedError(
          `Ticket T${number} is already claimed by ${owner}.`,
        );
      });

      if (changed) {
        changes.publish({ type: 'ticket', number });
      }
      return getTicket(number);
    },

    /** Releases Ticket `number` when `agentRunId` is its current claimant. */
    releaseTicketClaim(
      number: number,
      input: Pick<ClaimTicketInput, 'agentRunId'>,
    ): Ticket {
      const agentRunId = checkedAgentRunId(input.agentRunId);
      const changed = db.transaction(() => {
        checkTicketWritable(db, number);
        const claim = db
          .select({
            claimAgentRunId: tickets.claimAgentRunId,
            claimAgentName: tickets.claimAgentName,
          })
          .from(tickets)
          .where(
            and(
              eq(tickets.number, number),
              eq(tickets.claimAgentRunId, agentRunId),
            ),
          )
          .get();
        const released = db
          .update(tickets)
          .set({
            claimAgentRunId: null,
            claimAgentName: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tickets.number, number),
              eq(tickets.claimAgentRunId, agentRunId),
            ),
          )
          .returning({ number: tickets.number })
          .get();
        if (released) {
          if (claim) {
            recordActivity(
              db,
              number,
              actor,
              claimChanges('claimReleased', claim),
            );
          }
          return true;
        }

        const existing = db
          .select({
            claimAgentRunId: tickets.claimAgentRunId,
            claimAgentName: tickets.claimAgentName,
          })
          .from(tickets)
          .where(eq(tickets.number, number))
          .get();
        if (!existing) {
          throw new NotFoundError(`There is no Ticket T${number}.`);
        }
        if (existing.claimAgentRunId === null) {
          return false;
        }

        const owner = claimOwner(
          existing.claimAgentRunId,
          existing.claimAgentName,
        );
        throw new NotAllowedError(
          `Ticket T${number} is claimed by ${owner}; only that Agent run can release it.`,
        );
      });

      if (changed) {
        changes.publish({ type: 'ticket', number });
      }
      return getTicket(number);
    },

    /** Clears any claim on Ticket `number` for the User. */
    clearTicketClaim(number: number): Ticket {
      checkTicketWritable(db, number);
      const cleared = db.transaction(() => {
        const claim = db
          .select({
            claimAgentRunId: tickets.claimAgentRunId,
            claimAgentName: tickets.claimAgentName,
          })
          .from(tickets)
          .where(eq(tickets.number, number))
          .get();
        if (!claim || claim.claimAgentRunId === null) {
          return false;
        }
        db.update(tickets)
          .set({
            claimAgentRunId: null,
            claimAgentName: null,
            updatedAt: new Date(),
          })
          .where(eq(tickets.number, number))
          .run();
        recordActivity(db, number, actor, claimChanges('claimCleared', claim));
        return true;
      });
      if (cleared) {
        changes.publish({ type: 'ticket', number });
      }
      return getTicket(number);
    },

    createTicket(input: CreateTicketInput): Ticket {
      const checked = checkNewTicket(input);
      const { values } = checked;
      checkProjectWritable(db, input.projectId);
      const project = { id: input.projectId };

      // better-sqlite3 runs every statement on this one connection, so
      // statements on `db` inside the callback are part of the transaction.
      const number = db.transaction(() => {
        if (input.epicNumber !== undefined) {
          checkEpicChild(db, input.epicNumber, {
            type: values.type,
            projectId: project.id,
          });
        }
        if (input.originNumber !== undefined) {
          checkOrigin(db, input.originNumber);
        }
        const number = insertTicket(db, actor, checked, {
          projectId: project.id,
          epicNumber: input.epicNumber ?? null,
          originNumber: input.originNumber ?? null,
          createdAt: new Date(),
        });
        if (input.cycleId !== undefined) {
          planNewTicket(db, { cycleId: input.cycleId, number }, project.id);
        }
        if (input.originNumber !== undefined) {
          touchTicket(db, input.originNumber);
        }
        syncEpicStatus(db, input.epicNumber ?? null);
        return number;
      });
      // A child changes its Epic's children, and maybe its Status; a split-off
      // Ticket changes its Origin's.
      publishWith(number, input.epicNumber ?? null, input.originNumber ?? null);
      return getTicket(number);
    },

    /**
     * Creates every Ticket in `input.tickets` in one Project, in order, by
     * the rules for creating one, with the Blockers each names by position
     * among the earlier ones, under an Epic when `epicNumber` is given, and
     * planned into a Cycle when `cycleId` is.
     * All or nothing: a refusal names the offending Ticket by position and
     * creates none. The new Tickets are announced once.
     */
    createTicketBatch(input: CreateTicketBatchInput): Ticket[] {
      throwFieldErrors({
        tickets:
          input.tickets.length === 0
            ? 'Give at least one Ticket to create.'
            : input.tickets.length > maxBatchSize
              ? `Create at most ${maxBatchSize} Tickets at a time.`
              : undefined,
      });
      const checked = input.tickets.map(checkBatchTicket);
      checkProjectWritable(db, input.projectId);
      const project = { id: input.projectId };
      const epicNumber = input.epicNumber ?? null;
      const originNumber = input.originNumber ?? null;

      const numbers = db.transaction(() => {
        if (epicNumber !== null) {
          checkEpicChild(db, epicNumber, {
            type: 'Ticket',
            projectId: project.id,
          });
        }
        if (originNumber !== null) {
          checkOrigin(db, originNumber);
        }
        const createdAt = new Date();
        const created: number[] = [];
        for (const { ticket, blockedByPositions } of checked) {
          const number = insertTicket(db, actor, ticket, {
            projectId: project.id,
            epicNumber,
            originNumber,
            createdAt,
          });
          if (blockedByPositions.length > 0) {
            db.insert(ticketBlockers)
              .values(
                blockedByPositions.map((position) => ({
                  blockerNumber: created[position],
                  blockedNumber: number,
                })),
              )
              .run();
          }
          if (input.cycleId !== undefined) {
            planNewTicket(db, { cycleId: input.cycleId, number }, project.id);
          }
          created.push(number);
        }
        if (originNumber !== null) {
          touchTicket(db, originNumber);
        }
        syncEpicStatus(db, epicNumber);
        return created;
      });
      changes.publish({
        type: 'tickets',
        numbers: [
          ...numbers,
          ...(epicNumber === null ? [] : [epicNumber]),
          ...(originNumber === null ? [] : [originNumber]),
        ],
      });
      return numbers.map(getTicket);
    },

    /**
     * Changes the given fields of Ticket `number` by the rules for creating
     * one, and bumps its updated time even when no fields are given. Any
     * Status may follow any other.
     */
    updateTicket(number: number, input: UpdateTicketInput): Ticket {
      const checked = checkTicketChanges(input);
      checkTicketWritable(db, number);
      if (checked.values.projectId !== undefined) {
        checkProjectWritable(db, checked.values.projectId);
      }

      const { leftCycles, changedEpic, changedOrigins } = applyTicketChanges(
        number,
        checked,
      );
      publishWith(number, changedEpic, ...changedOrigins);
      for (const id of leftCycles) {
        changes.publish({ type: 'cycle', id });
      }
      return getTicket(number);
    },

    /**
     * Applies the same Status and label change to each Ticket in
     * `ticketNumbers`, by the rules of `updateTicket`. Each Ticket's change is
     * atomic, but the batch is not: a Ticket that cannot be changed is
     * reported in `failed` and the others are still changed. An invalid batch
     * or change is refused as a whole. The changed Tickets are announced once.
     */
    updateTickets(input: UpdateTicketsInput): UpdateTicketsResult {
      const { ticketNumbers, status, color, addLabels, removeLabels } = input;
      const checked = checkTicketChanges({
        status,
        color,
        addLabels,
        removeLabels,
      });
      throwFieldErrors({
        ticketNumbers: checkBatchNumbers(ticketNumbers),
        change:
          checked.values.status === undefined &&
          checked.values.color === undefined &&
          checked.addLabels.length === 0 &&
          checked.removeLabels.length === 0
            ? 'Give a Status, color, addLabels or removeLabels to change.'
            : undefined,
      });

      const changed: number[] = [];
      const changedEpics = new Set<number>();
      const failed: BatchFailure[] = [];
      try {
        for (const number of ticketNumbers) {
          try {
            const { changedEpic } = applyTicketChanges(number, checked);
            changed.push(number);
            if (changedEpic !== null) {
              changedEpics.add(changedEpic);
            }
          } catch (error) {
            if (!(error instanceof TicketsError)) {
              throw error;
            }
            failed.push({ number, error: error.message });
          }
        }
      } finally {
        if (changed.length > 0) {
          changes.publish({
            type: 'tickets',
            numbers: [
              ...changed,
              ...[...changedEpics].filter((epic) => !changed.includes(epic)),
            ],
          });
        }
      }
      return { updated: changed.map(getTicket), failed };
    },

    /**
     * Adds `labels` to Ticket `number`, trimmed and lower-cased; ones it
     * already has are kept once. Bumps its updated time.
     */
    addLabels(number: number, labels: string[]): Ticket {
      const added = checkedLabels(labels);
      db.transaction(() => {
        checkTicketWritable(db, number);
        touchTicket(db, number);
        const before = labelsOf(db, number);
        insertLabels(db, number, added);
        recordActivity(db, number, actor, labelChanges(before, { added }));
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Removes `labels` from Ticket `number`, ignoring case and ones it does
     * not have. Bumps its updated time.
     */
    removeLabels(number: number, labels: string[]): Ticket {
      const removed = checkedLabels(labels);
      db.transaction(() => {
        checkTicketWritable(db, number);
        touchTicket(db, number);
        const before = labelsOf(db, number);
        deleteLabels(db, number, removed);
        recordActivity(db, number, actor, labelChanges(before, { removed }));
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Adds `references` to Ticket `number` after the ones it has, trimmed;
     * ones it already has are kept once, where they were. Refused past
     * `maxExternalReferences`. Bumps its updated time.
     */
    addExternalReferences(number: number, references: string[]): Ticket {
      const added = checkedExternalReferences(references);
      db.transaction(() => {
        checkTicketWritable(db, number);
        touchTicket(db, number);
        const before = externalReferencesOf(db, number);
        insertExternalReferences(db, number, added);
        checkExternalReferenceCount(db, number);
        recordActivity(
          db,
          number,
          actor,
          externalReferenceChanges(before, { added }),
        );
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Removes `references` from Ticket `number`, trimmed and matched
     * exactly; ones it does not have are ignored. Bumps its updated time.
     */
    removeExternalReferences(number: number, references: string[]): Ticket {
      const removed = checkedExternalReferences(references);
      db.transaction(() => {
        checkTicketWritable(db, number);
        touchTicket(db, number);
        const before = externalReferencesOf(db, number);
        deleteExternalReferences(db, number, removed);
        recordActivity(
          db,
          number,
          actor,
          externalReferenceChanges(before, { removed }),
        );
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Checks or unchecks each given acceptance criterion of Ticket `number`,
     * leaving its other criteria and their order alone, and bumps its updated
     * time. The Status does not change (ADR 0007).
     */
    setAcceptanceCriteriaChecked(
      number: number,
      criteria: AcceptanceCriterionCheckedInput[],
    ): Ticket {
      throwFieldErrors({
        acceptanceCriteria:
          criteria.length === 0
            ? 'Choose at least one acceptance criterion.'
            : checkCriterionIds(criteria),
      });
      db.transaction(() => {
        checkTicketWritable(db, number);
        touchTicket(db, number);
        const activity: ActivityChange[] = [];
        for (const { id, checked } of criteria) {
          const criterion = db
            .select({
              text: ticketAcceptanceCriteria.text,
              checked: ticketAcceptanceCriteria.checked,
            })
            .from(ticketAcceptanceCriteria)
            .where(
              and(
                eq(ticketAcceptanceCriteria.id, id),
                eq(ticketAcceptanceCriteria.ticketNumber, number),
              ),
            )
            .get();
          throwFieldErrors({
            acceptanceCriteria: criterion
              ? undefined
              : noSuchCriterion(number, id),
          });
          if (criterion?.checked === checked) {
            continue;
          }
          db.update(ticketAcceptanceCriteria)
            .set({ checked })
            .where(eq(ticketAcceptanceCriteria.id, id))
            .run();
          activity.push({
            type: checked ? 'criterionChecked' : 'criterionUnchecked',
            text: criterion?.text ?? '',
          });
        }
        recordActivity(db, number, actor, activity);
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Makes Ticket `blocker` a Blocker of Ticket `blocked`, which bumps the
     * blocked Ticket's updated time. Adding one it already has changes
     * nothing else. Either Ticket may be in any Project. A Ticket blocking
     * itself, or a Blocker that would close a cycle, is refused. Returns the
     * blocked Ticket.
     */
    addBlocker({ blocker, blocked }: BlockerInput): Ticket {
      throwFieldErrors({
        blocker:
          blocker === blocked ? 'A Ticket cannot block itself.' : undefined,
      });
      db.transaction(() => {
        getTicket(blocker);
        checkTicketWritable(db, blocked);
        checkNotEpicAndChild(db, { blocker, blocked });
        const cycle = blockingPath(db, blocked, blocker);
        throwFieldErrors({
          blocker: cycle
            ? `T${blocker} cannot block T${blocked}, because T${blocked} already blocks T${blocker}: ${cycle.map((number) => `T${number}`).join(' → ')}.`
            : undefined,
        });
        touchTicket(db, blocked);
        const added = db
          .insert(ticketBlockers)
          .values({ blockerNumber: blocker, blockedNumber: blocked })
          .onConflictDoNothing()
          .returning({ blocked: ticketBlockers.blockedNumber })
          .get();
        if (added) {
          recordBlocker(db, actor, { blocker, blocked }, 'Added');
        }
      });
      changes.publish({ type: 'tickets', numbers: [blocker, blocked] });
      return getTicket(blocked);
    },

    /**
     * Stops Ticket `blocker` blocking Ticket `blocked`, ignoring a Blocker it
     * does not have, and bumps the blocked Ticket's updated time. Both
     * Tickets must exist. Returns the blocked Ticket.
     */
    removeBlocker({ blocker, blocked }: BlockerInput): Ticket {
      db.transaction(() => {
        getTicket(blocker);
        checkTicketWritable(db, blocked);
        touchTicket(db, blocked);
        const removed = db
          .delete(ticketBlockers)
          .where(
            and(
              eq(ticketBlockers.blockerNumber, blocker),
              eq(ticketBlockers.blockedNumber, blocked),
            ),
          )
          .returning({ blocked: ticketBlockers.blockedNumber })
          .get();
        if (removed) {
          recordBlocker(db, actor, { blocker, blocked }, 'Removed');
        }
      });
      changes.publish({ type: 'tickets', numbers: [blocker, blocked] });
      return getTicket(blocked);
    },

    /**
     * Makes normal Ticket `child` a child of Epic `epic` in the same Project
     * (ADR 0011), and bumps both updated times. Attaching it again changes
     * nothing; a Ticket in another Epic must be detached first. Returns the
     * child.
     */
    attachToEpic(input: EpicChildInput): Ticket {
      return joinEpic(input, { move: false });
    },

    /**
     * `attachToEpic`, but a Ticket in another Epic leaves it for `epic`, and
     * that Epic's Status follows too. Returns the child.
     */
    moveToEpic(input: EpicChildInput): Ticket {
      return joinEpic(input, { move: true });
    },

    /**
     * `moveToEpic` for each of `children`, all or nothing: if any cannot
     * join `epic`, none does. Their Statuses and positions stay as they are.
     * The change is announced once, or not at all when every Ticket was in
     * `epic` already.
     */
    moveTicketsToEpic(input: EpicChildrenInput): void {
      const { epic, children } = input;
      throwFieldErrors({ children: checkBatchNumbers(children) });

      const joined = db.transaction(() =>
        children.flatMap((child) => {
          const changed = joinEpicStep({ epic, child }, { move: true });
          return changed ? [{ child, ...changed }] : [];
        }),
      );
      if (joined.length === 0) {
        return;
      }
      const left = joined.flatMap(({ previous }) =>
        previous === null ? [] : [previous],
      );
      changes.publish({
        type: 'tickets',
        numbers: [
          ...new Set([...left, epic, ...joined.map(({ child }) => child)]),
        ],
      });
    },

    /**
     * Takes Ticket `number` out of its Epic, if it has one, and bumps both
     * updated times. Returns the Ticket.
     */
    detachFromEpic(number: number): Ticket {
      const epic = db.transaction(() => {
        checkTicketWritable(db, number);
        const ticket = db
          .select({ epicNumber: tickets.epicNumber })
          .from(tickets)
          .where(eq(tickets.number, number))
          .get();
        if (!ticket) {
          throw new NotFoundError(`There is no Ticket T${number}.`);
        }
        if (ticket.epicNumber === null) {
          return null;
        }
        db.update(tickets)
          .set({
            epicNumber: null,
            archivedWithEpic: false,
            updatedAt: new Date(),
          })
          .where(eq(tickets.number, number))
          .run();
        touchTicket(db, ticket.epicNumber);
        syncEpicStatus(db, ticket.epicNumber);
        return ticket.epicNumber;
      });
      if (epic !== null) {
        changes.publish({ type: 'tickets', numbers: [epic, number] });
      }
      return getTicket(number);
    },

    /**
     * The Tickets that block Ticket `number` and the Tickets it blocks, each
     * by number, archived ones included.
     */
    listBlockers(number: number): Blockers {
      getTicket(number);
      const related = (direction: keyof Blockers) => {
        const [side, other] =
          direction === 'blockedBy'
            ? [ticketBlockers.blockedNumber, ticketBlockers.blockerNumber]
            : [ticketBlockers.blockerNumber, ticketBlockers.blockedNumber];
        return db
          .select({
            ...relatedTicketColumns,
            resolved: sql`${resolvedTicket}`.mapWith(Boolean),
          })
          .from(ticketBlockers)
          .innerJoin(tickets, eq(tickets.number, other))
          .where(eq(side, number))
          .orderBy(asc(tickets.number))
          .all();
      };
      return { blockedBy: related('blockedBy'), blocks: related('blocks') };
    },

    /**
     * Sets the order of the active Tickets in a Project's Status lane, or in
     * the part of it a Cycle or the Backlog shows. Archived Tickets, and
     * Tickets outside that part, keep their slots. The complete lane must be
     * supplied so stale Board data cannot silently lose a Ticket.
     */
    reorderTickets(input: ReorderTicketsInput): void {
      const { projectId, status, ticketNumbers, cycleId } = input;
      if (!isStatus(status)) {
        throw new ValidationError({ status: statusRule });
      }
      if (
        ticketNumbers.some(
          (number) => !Number.isSafeInteger(number) || number < 1,
        ) ||
        new Set(ticketNumbers).size !== ticketNumbers.length
      ) {
        throw new ValidationError({
          ticketNumbers: 'Choose each Ticket in the lane exactly once.',
        });
      }

      checkProjectWritable(db, projectId);

      const lane = db
        .select({
          number: tickets.number,
          archived: tickets.archived,
          position: tickets.position,
        })
        .from(tickets)
        .where(
          and(eq(tickets.projectId, projectId), eq(tickets.status, status)),
        )
        .orderBy(
          asc(tickets.position),
          asc(tickets.createdAt),
          asc(tickets.number),
        )
        .all();
      const members =
        cycleId === undefined
          ? undefined
          : new Set(
              (cycleId === null ? outOfBacklog(db) : cycleMembers(db, cycleId))
                .all()
                .map(({ number }) => number),
            );
      const movable = ({ number, archived }: (typeof lane)[number]) =>
        !archived &&
        (members === undefined || members.has(number) === (cycleId !== null));
      const activeNumbers = lane.filter(movable).map((ticket) => ticket.number);
      if (
        activeNumbers.length !== ticketNumbers.length ||
        activeNumbers.some((number) => !ticketNumbers.includes(number))
      ) {
        throw new ValidationError({
          ticketNumbers: 'Refresh the Board and try reordering again.',
        });
      }

      const reordered = [...ticketNumbers];
      let activeIndex = 0;
      const orderedLane = lane.map((ticket) =>
        movable(ticket) ? reordered[activeIndex++] : ticket.number,
      );
      if (orderedLane.every((number, index) => number === lane[index].number)) {
        return;
      }

      db.transaction((transaction) => {
        orderedLane.forEach((number, position) => {
          transaction
            .update(tickets)
            .set({ position })
            .where(eq(tickets.number, number))
            .run();
        });
      });
      for (const number of orderedLane) {
        changes.publish({ type: 'ticket', number });
      }
    },

    /**
     * Moves active normal Tickets of Project `projectId` into its `status`
     * lane, next to each other in the order given, just before Ticket
     * `before` or at the end of the lane. The other Tickets in the lane keep
     * their order. All or nothing: if any Ticket cannot move, none does.
     * Moving to Done releases a Claim, and a child's move updates its Epic's
     * Status, as `updateTicket` does. The change is announced once.
     */
    moveTickets(input: MoveTicketsInput): void {
      const { projectId, ticketNumbers, status, before } = input;
      throwFieldErrors({
        ticketNumbers: checkBatchNumbers(ticketNumbers),
        status: isStatus(status) ? undefined : statusRule,
      });

      const changedEpics = new Set<number>();
      db.transaction(() => {
        checkProjectWritable(db, projectId);
        const moving = ticketNumbers.map((number) => {
          const ticket = db
            .select({
              projectId: tickets.projectId,
              status: tickets.status,
              type: tickets.type,
              archived: tickets.archived,
              epicNumber: tickets.epicNumber,
              claimAgentRunId: tickets.claimAgentRunId,
              claimAgentName: tickets.claimAgentName,
            })
            .from(tickets)
            .where(eq(tickets.number, number))
            .get();
          if (!ticket) {
            throw new NotFoundError(`There is no Ticket T${number}.`);
          }
          if (ticket.projectId !== projectId) {
            throw new ValidationError({
              ticketNumbers: `Ticket T${number} is not in this Project.`,
            });
          }
          if (ticket.archived) {
            throw new ValidationError({
              ticketNumbers: `Ticket T${number} is archived. Restore it before moving it.`,
            });
          }
          if (ticket.type === 'Epic') {
            throw new ValidationError({
              ticketNumbers: epicStatusRule(number),
            });
          }
          return { number, ...ticket };
        });

        const rest = db
          .select({ number: tickets.number })
          .from(tickets)
          .where(
            and(eq(tickets.projectId, projectId), eq(tickets.status, status)),
          )
          .orderBy(
            asc(tickets.position),
            asc(tickets.createdAt),
            asc(tickets.number),
          )
          .all()
          .map(({ number }) => number)
          .filter((number) => !ticketNumbers.includes(number));
        const insertAt = before === null ? rest.length : rest.indexOf(before);
        if (insertAt < 0) {
          throw new ValidationError({
            before: 'Refresh the Board and try moving the Tickets again.',
          });
        }
        rest.splice(insertAt, 0, ...ticketNumbers);

        const now = new Date();
        rest.forEach((number, position) => {
          const moved = moving.find((ticket) => ticket.number === number);
          db.update(tickets)
            .set({
              position,
              ...(moved && moved.status !== status
                ? {
                    status,
                    updatedAt: now,
                    ...(status === 'Done'
                      ? { claimAgentRunId: null, claimAgentName: null }
                      : {}),
                  }
                : {}),
            })
            .where(eq(tickets.number, number))
            .run();
        });
        for (const ticket of moving) {
          if (ticket.status !== status) {
            recordActivity(db, ticket.number, actor, [
              { type: 'status', from: ticket.status, to: status },
              ...(status === 'Done'
                ? claimChanges('claimReleased', ticket)
                : []),
            ]);
          }
          if (
            ticket.status !== status &&
            syncEpicStatus(db, ticket.epicNumber) &&
            ticket.epicNumber !== null
          ) {
            changedEpics.add(ticket.epicNumber);
          }
        }
      });
      changes.publish({
        type: 'tickets',
        numbers: [
          ...ticketNumbers,
          ...[...changedEpics].filter((epic) => !ticketNumbers.includes(epic)),
        ],
      });
    },

    /** The comments on Ticket `number`, oldest first. */
    listComments(number: number): Comment[] {
      getTicket(number);
      return db
        .select(commentColumns)
        .from(ticketComments)
        .where(eq(ticketComments.ticketNumber, number))
        .orderBy(asc(ticketComments.id))
        .all();
    },

    /**
     * Ticket `number`'s Activity, oldest first, whether or not it is
     * archived.
     */
    listActivity(number: number): ActivityEntry[] {
      getTicket(number);
      return activityOf(db, number);
    },

    /** Adds a Markdown comment by `author` to Ticket `number`. */
    addComment(number: number, input: AddCommentInput): Comment {
      const body = checkedCommentBody(input.body);
      getTicket(number);
      checkTicketWritable(db, number);
      const comment = db
        .insert(ticketComments)
        .values({
          ticketNumber: number,
          author: input.author,
          body,
          createdAt: new Date(),
        })
        .returning(commentColumns)
        .get();
      changes.publish({ type: 'ticket', number });
      return comment;
    },

    /**
     * Replaces comment `id`'s body by the rules for adding one and sets its
     * edited time; the author and created time stay.
     */
    editComment(id: number, input: EditCommentInput): Comment {
      const body = checkedCommentBody(input.body);
      const { ticketNumber } = editableComment(id, input.by);
      checkTicketWritable(db, ticketNumber);
      const comment = db
        .update(ticketComments)
        .set({ body, editedAt: new Date() })
        .where(eq(ticketComments.id, id))
        .returning(commentColumns)
        .get();
      changes.publish({ type: 'ticket', number: ticketNumber });
      return comment;
    },

    /**
     * Deletes comment `id` for good (ADR 0006), by the same rule for who
     * may as editing it.
     */
    removeComment(id: number, { by }: RemoveCommentInput): void {
      const { ticketNumber } = editableComment(id, by);
      checkTicketWritable(db, ticketNumber);
      db.delete(ticketComments).where(eq(ticketComments.id, id)).run();
      changes.publish({ type: 'ticket', number: ticketNumber });
    },

    /**
     * Adds a file to Ticket `number` (ADR 0018) and returns its metadata. The
     * name is trimmed; the media type comes from the input, else the name's
     * extension. Recorded as Activity in the same transaction.
     */
    addAttachment(number: number, input: AddAttachmentInput): Attachment {
      const { name, mediaType } = checkedAttachment(input);
      const attachment = db.transaction(() => {
        checkTicketWritable(db, number);
        touchTicket(db, number);
        checkAttachmentCount(db, number);
        const added = db
          .insert(ticketAttachments)
          .values({
            ticketNumber: number,
            name,
            mediaType,
            size: input.content.byteLength,
            author: input.author,
            content: Buffer.from(input.content),
            createdAt: new Date(),
          })
          .returning(attachmentColumns)
          .get();
        recordActivity(db, number, actor, [{ type: 'attachmentAdded', name }]);
        return added;
      });
      changes.publish({ type: 'ticket', number });
      return attachment;
    },

    /** Attachment `id` with its metadata and content. */
    getAttachment(id: number): StoredAttachment {
      const attachment = db
        .select({ ...attachmentColumns, content: ticketAttachments.content })
        .from(ticketAttachments)
        .where(eq(ticketAttachments.id, id))
        .get();
      if (!attachment) {
        throw new NotFoundError(`There is no Attachment ${id}.`);
      }
      return attachment;
    },

    /**
     * Deletes Attachment `id` for good (ADR 0018), by the Comment rule: the
     * User may remove any, an Agent only one an Agent added. Recorded as
     * Activity naming the file, in the same transaction.
     */
    removeAttachment(id: number, { by }: RemoveAttachmentInput): void {
      const attachment = db
        .select({
          ticketNumber: ticketAttachments.ticketNumber,
          name: ticketAttachments.name,
          author: ticketAttachments.author,
        })
        .from(ticketAttachments)
        .where(eq(ticketAttachments.id, id))
        .get();
      if (!attachment) {
        throw new NotFoundError(`There is no Attachment ${id}.`);
      }
      if (by === 'agent' && attachment.author !== 'agent') {
        throw new NotAllowedError(
          `Attachment ${id} was added by the User. Agents can only remove Attachments added by an Agent.`,
        );
      }
      db.transaction(() => {
        checkTicketWritable(db, attachment.ticketNumber);
        touchTicket(db, attachment.ticketNumber);
        db.delete(ticketAttachments).where(eq(ticketAttachments.id, id)).run();
        recordActivity(db, attachment.ticketNumber, actor, [
          { type: 'attachmentRemoved', name: attachment.name },
        ]);
      });
      changes.publish({ type: 'ticket', number: attachment.ticketNumber });
    },

    /**
     * Archives Ticket `number`: it leaves the normal views but keeps
     * everything, so restoring brings it back (ADR 0003). An Epic is refused
     * while any child is not archived, unless `withChildren` archives those
     * children with it, whatever their Status or Claims, all or nothing.
     */
    archiveTicket(number: number, options: ArchiveTicketOptions = {}): Ticket {
      const affected = db.transaction(() => archiveStep([number], options));
      publishWith(number, ...affected);
      return getTicket(number);
    },

    /**
     * `archiveTicket` for each of `ticketNumbers`, all or nothing: if any
     * cannot be archived, none is. An Epic is archived after its children
     * in the list, whatever their order. The change is announced once, with
     * the children archived with an Epic and the Epics whose Status changed.
     */
    archiveTickets(
      ticketNumbers: number[],
      options: ArchiveTicketOptions = {},
    ): void {
      throwFieldErrors({ ticketNumbers: checkBatchNumbers(ticketNumbers) });

      const affected = db.transaction(() =>
        archiveStep(ticketNumbers, options),
      );
      changes.publish({ type: 'tickets', numbers: affected });
    },

    /**
     * Brings archived Ticket `number` back exactly as it was. An Epic brings
     * back the children archived with it, but not ones archived before it
     * or detached since.
     */
    restoreTicket(number: number): Ticket {
      const affected = db.transaction(() => {
        const changedEpic = setArchivedStep(number, false);
        const children = db
          .select({ number: tickets.number })
          .from(tickets)
          .where(
            and(
              eq(tickets.epicNumber, number),
              eq(tickets.archived, true),
              eq(tickets.archivedWithEpic, true),
            ),
          )
          .orderBy(asc(tickets.number))
          .all()
          .map((child) => child.number);
        const changedEpics = children.map((child) =>
          setArchivedStep(child, false),
        );
        return [...children, changedEpic, ...changedEpics];
      });
      publishWith(number, ...affected);
      return getTicket(number);
    },

    /**
     * Destroys Ticket `number` for good (ADR 0012), whatever its Status,
     * archived or claimed; its number is never used again. Its labels,
     * External references, Activity, Comments, acceptance criteria and Blockers on both sides go
     * with it, and it leaves every Cycle, Archived ones included. The Tickets it
     * blocked and its Epic are bumped, and the Epic's Status is derived
     * again. The Tickets split from it lose their Origin and stay. An Epic's
     * children, archived ones included, are detached and
     * kept, or with `withChildren` deleted by the same rules, all in one
     * transaction. Only the User deletes: no MCP tool calls this.
     */
    deleteTicket(
      number: number,
      { withChildren = false }: DeleteTicketOptions = {},
    ): void {
      const { children, unblocked, epic, leftCycles, unlinked } =
        db.transaction(() => {
          checkTicketWritable(db, number);
          const { epic, children } = getTicket(number);
          const childNumbers = children.map((child) => child.number);
          if (!withChildren) {
            db.update(tickets)
              .set({
                epicNumber: null,
                archivedWithEpic: false,
                updatedAt: new Date(),
              })
              .where(eq(tickets.epicNumber, number))
              .run();
          }
          const deleted = withChildren ? [...childNumbers, number] : [number];
          const removals = deleted.map((doomed) => removeTicket(db, doomed));
          const unblocked = [
            ...new Set(removals.flatMap((removal) => removal.unblocked)),
          ].filter((blocked) => !deleted.includes(blocked));
          for (const blocked of unblocked) {
            touchTicket(db, blocked);
          }
          for (const { origin } of removals) {
            if (origin != null && !deleted.includes(origin)) {
              touchTicket(db, origin);
            }
          }
          if (epic !== null) {
            touchTicket(db, epic.number);
            syncEpicStatus(db, epic.number);
          }
          return {
            children: childNumbers,
            unblocked,
            epic,
            leftCycles: [
              ...new Set(removals.flatMap((removal) => removal.leftCycles)),
            ],
            // Split-off Tickets that stay, and Origins that lose one.
            unlinked: removals
              .flatMap(({ unlinked, origin }) => [
                ...unlinked,
                ...(origin == null ? [] : [origin]),
              ])
              .filter((other) => !deleted.includes(other)),
          };
        });
      changes.publish({
        type: 'tickets',
        numbers: [
          ...new Set([
            number,
            ...children,
            ...unblocked,
            ...(epic === null ? [] : [epic.number]),
            ...unlinked,
          ]),
        ],
      });
      for (const id of leftCycles) {
        changes.publish({ type: 'cycle', id });
      }
    },
  };

  /**
   * Announces Ticket `number`'s change, together with that of each of the
   * `related` Tickets given, such as its Epic or Origin.
   */
  function publishWith(number: number, ...related: (number | null)[]) {
    const others = [
      ...new Set(related.filter((other) => other !== null && other !== number)),
    ] as number[];
    changes.publish(
      others.length === 0
        ? { type: 'ticket', number }
        : { type: 'tickets', numbers: [number, ...others] },
    );
  }

  /**
   * The change of `joinEpic`, without its transaction or announcement: run
   * it in the transaction that makes the change. Returns `null` when `child`
   * was in `epic` already, and otherwise the Epic it left, if any.
   */
  function joinEpicStep(
    { epic, child }: EpicChildInput,
    { move }: { move: boolean },
  ): { previous: number | null } | null {
    checkTicketWritable(db, child);
    const ticket = db
      .select({
        type: tickets.type,
        projectId: tickets.projectId,
        epicNumber: tickets.epicNumber,
      })
      .from(tickets)
      .where(eq(tickets.number, child))
      .get();
    if (!ticket) {
      throw new NotFoundError(`There is no Ticket T${child}.`);
    }
    const previous = ticket.epicNumber;
    checkEpicChild(db, epic, {
      number: child,
      ...ticket,
      epicNumber: move ? null : previous,
    });
    if (previous === epic) {
      return null;
    }
    checkNoBlockerBetween(db, { epic, child });
    db.update(tickets)
      .set({ epicNumber: epic, archivedWithEpic: false, updatedAt: new Date() })
      .where(eq(tickets.number, child))
      .run();
    touchTicket(db, epic);
    syncEpicStatus(db, epic);
    if (previous !== null) {
      touchTicket(db, previous);
      syncEpicStatus(db, previous);
    }
    return { previous };
  }

  /**
   * Makes `child` a child of `epic`, by the rules of `attachToEpic`; with
   * `move`, a child of another Epic leaves that one first.
   */
  function joinEpic(
    { epic, child }: EpicChildInput,
    { move }: { move: boolean },
  ): Ticket {
    const changed = db.transaction(() =>
      joinEpicStep({ epic, child }, { move }),
    );
    if (changed) {
      changes.publish({
        type: 'tickets',
        numbers: [
          ...(changed.previous === null ? [] : [changed.previous]),
          epic,
          child,
        ],
      });
    }
    return getTicket(child);
  }

  function getTicket(number: number): Ticket {
    const ticket = db
      .select(ticketColumns)
      .from(tickets)
      .where(eq(tickets.number, number))
      .get();
    if (!ticket) {
      throw new NotFoundError(`There is no Ticket T${number}.`);
    }
    return withRelations(db, [ticket])[0];
  }

  /**
   * Comment `id`, if `by` may edit or remove it: the User may change any
   * comment, an Agent only an Agent's.
   */
  function editableComment(id: number, by: CommentAuthor) {
    const comment = db
      .select({
        ticketNumber: ticketComments.ticketNumber,
        author: ticketComments.author,
      })
      .from(ticketComments)
      .where(eq(ticketComments.id, id))
      .get();
    if (!comment) {
      throw new NotFoundError(`There is no comment ${id}.`);
    }
    if (by === 'agent' && comment.author !== 'agent') {
      throw new NotAllowedError(
        `Comment ${id} was written by the User. Agents can only edit or remove comments written by an Agent.`,
      );
    }
    return comment;
  }

  /**
   * Writes checked `changes` to Ticket `number` in one transaction, without
   * announcing them: removed labels and External references go before added
   * ones, a Ticket that
   * changes Project or Status goes to the end of its new lane, and one that
   * changes Project leaves its Cycle unless that is Archived. A child's
   * Status change updates its Epic's. Returns the ids of the Cycles it left,
   * its Epic's number if that Epic's Status changed, and its old and new
   * Origin if the Origin changed.
   */
  function applyTicketChanges(
    number: number,
    {
      values,
      addLabels,
      removeLabels,
      addExternalReferences,
      removeExternalReferences,
      acceptanceCriteria,
    }: TicketChanges,
  ): {
    leftCycles: number[];
    changedEpic: number | null;
    changedOrigins: (number | null)[];
  } {
    return db.transaction(() => {
      checkTicketWritable(db, number);
      const existing = db
        .select(ticketColumns)
        .from(tickets)
        .where(eq(tickets.number, number))
        .get();
      if (!existing) {
        throw new NotFoundError(`There is no Ticket T${number}.`);
      }
      const projectId = values.projectId ?? existing.projectId;
      const status = values.status ?? existing.status;
      const moved =
        projectId !== existing.projectId || status !== existing.status;
      if (existing.type === 'Epic' && status !== existing.status) {
        throw new ValidationError({
          status: epicStatusRule(number),
        });
      }
      if (values.color !== undefined && existing.type !== 'Epic') {
        throw new ValidationError({
          color: `Ticket T${number} is not an Epic. Only an Epic has a colour.`,
        });
      }
      if (projectId !== existing.projectId) {
        checkUngrouped(db, existing);
      }
      if (values.originNumber != null) {
        checkOrigin(db, values.originNumber, number);
      }
      const changedOrigins =
        values.originNumber === undefined ||
        values.originNumber === existing.originNumber
          ? []
          : [existing.originNumber, values.originNumber];
      for (const origin of changedOrigins) {
        if (origin !== null) {
          touchTicket(db, origin);
        }
      }
      const labelsBefore = labelsOf(db, number);
      const referencesBefore = externalReferencesOf(db, number);
      const criteriaBefore =
        acceptanceCriteria === undefined
          ? undefined
          : criteriaFingerprint(db, number);
      db.update(tickets)
        .set({
          ...values,
          ...(values.status === 'Done'
            ? { claimAgentRunId: null, claimAgentName: null }
            : {}),
          ...(moved
            ? {
                position: nextPosition(db, projectId, status, number),
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(tickets.number, number))
        .run();
      const leftCycles =
        projectId === existing.projectId ? [] : leaveOpenCycles(db, number);
      deleteLabels(db, number, removeLabels);
      insertLabels(db, number, addLabels);
      deleteExternalReferences(db, number, removeExternalReferences);
      insertExternalReferences(db, number, addExternalReferences);
      checkExternalReferenceCount(db, number);
      if (acceptanceCriteria !== undefined) {
        replaceAcceptanceCriteria(db, number, acceptanceCriteria);
      }
      recordActivity(db, number, actor, [
        ...rowChanges(db, existing, values),
        ...labelChanges(labelsBefore, {
          added: addLabels,
          removed: removeLabels,
        }),
        ...externalReferenceChanges(referencesBefore, {
          added: addExternalReferences,
          removed: removeExternalReferences,
        }),
        ...(criteriaBefore !== undefined &&
        criteriaFingerprint(db, number) !== criteriaBefore
          ? [{ type: 'criteriaEdited' } as const]
          : []),
      ]);
      const changedEpic =
        status !== existing.status && syncEpicStatus(db, existing.epicNumber)
          ? existing.epicNumber
          : null;
      return { leftCycles, changedEpic, changedOrigins };
    });
  }

  /** Sets Project `id`'s archived flag, announcing it only when it changed. */
  function setProjectArchived(id: number, archived: boolean): Project {
    const changed = db
      .update(projects)
      .set({ archived })
      .where(and(eq(projects.id, id), ne(projects.archived, archived)))
      .returning({ id: projects.id })
      .get();
    const project = db
      .select(projectColumns)
      .from(projects)
      .where(eq(projects.id, id))
      .get();
    if (!project) {
      throw new NotFoundError(`There is no Project with id ${id}.`);
    }
    if (changed) {
      changes.publish({ type: 'project', id });
    }
    return project;
  }

  /**
   * The change of `archiveTickets`, without its transaction or
   * announcement: archives `numbers`, their Epics last, and with
   * `withChildren` the Epics' other children that are not archived. Children
   * archived in the same step as their Epic are marked so that restoring it
   * brings them back. Returns every Ticket archived and the Epics whose
   * Status changed, without repeats.
   */
  function archiveStep(
    numbers: number[],
    { withChildren = false }: ArchiveTicketOptions,
  ): number[] {
    const epicNumbers = new Set(
      db
        .select({ number: tickets.number })
        .from(tickets)
        .where(and(inArray(tickets.number, numbers), eq(tickets.type, 'Epic')))
        .all()
        .map((epic) => epic.number),
    );
    // Every child of these Epics archived now is archived with its Epic.
    const archivedWithEpic = new Set(
      epicNumbers.size === 0
        ? []
        : db
            .select({ number: tickets.number })
            .from(tickets)
            .where(
              and(
                inArray(tickets.epicNumber, [...epicNumbers]),
                eq(tickets.archived, false),
              ),
            )
            .orderBy(asc(tickets.number))
            .all()
            .map((child) => child.number),
    );
    const unlistedChildren = withChildren
      ? [...archivedWithEpic].filter((child) => !numbers.includes(child))
      : [];
    const childrenFirst = [
      ...numbers.filter((number) => !epicNumbers.has(number)),
      ...unlistedChildren,
      ...numbers.filter((number) => epicNumbers.has(number)),
    ];
    const changedEpics = childrenFirst.flatMap((number) => {
      const changedEpic = setArchivedStep(
        number,
        true,
        archivedWithEpic.has(number),
      );
      return changedEpic === null ? [] : [changedEpic];
    });
    return [...new Set([...numbers, ...unlistedChildren, ...changedEpics])];
  }

  /**
   * Sets only Ticket `number`'s archived flag (and updated time), marking it
   * as archived with its Epic when `withEpic`, and records the Activity:
   * run it in the transaction that makes the change. A child's Epic leaves
   * out archived children, so its Status may change: returns that Epic if
   * it did.
   */
  function setArchivedStep(
    number: number,
    archived: boolean,
    withEpic = false,
  ): number | null {
    checkTicketWritable(db, number);
    if (archived) {
      checkChildrenArchived(db, number);
    } else {
      checkEpicNotArchived(db, number);
    }
    const before = db
      .select({ archived: tickets.archived })
      .from(tickets)
      .where(eq(tickets.number, number))
      .get();
    const ticket = db
      .update(tickets)
      .set({
        archived,
        updatedAt: new Date(),
        ...(before?.archived === archived
          ? {}
          : { archivedWithEpic: archived && withEpic }),
      })
      .where(eq(tickets.number, number))
      .returning({ epicNumber: tickets.epicNumber })
      .get();
    if (!ticket) {
      throw new NotFoundError(`There is no Ticket T${number}.`);
    }
    if (before?.archived !== archived) {
      recordActivity(db, number, actor, [
        { type: archived ? 'archived' : 'restored' },
      ]);
    }
    return syncEpicStatus(db, ticket.epicNumber) ? ticket.epicNumber : null;
  }
}

/** The condition for Tickets matching `filter`, as `listTickets` documents. */
function matchingTickets(db: DatabaseConnection, filter: ListTicketsFilter) {
  const labels = normalizeLabels(filter.labels ?? []);
  return and(
    filter.projectId === undefined
      ? undefined
      : eq(tickets.projectId, filter.projectId),
    filter.status === undefined
      ? undefined
      : inArray(tickets.status, statusList(filter.status)),
    filter.includeArchived ? undefined : eq(tickets.archived, false),
    filter.includeArchived || filter.projectId !== undefined
      ? undefined
      : notInArray(
          tickets.projectId,
          db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.archived, true)),
        ),
    labels.length === 0
      ? undefined
      : inArray(
          tickets.number,
          db
            .select({ number: ticketLabels.ticketNumber })
            .from(ticketLabels)
            .where(inArray(ticketLabels.label, labels))
            .groupBy(ticketLabels.ticketNumber)
            .having(eq(count(), labels.length)),
        ),
    filter.blocked === undefined
      ? undefined
      : (filter.blocked ? inArray : notInArray)(
          tickets.number,
          db
            .select({ number: ticketBlockers.blockedNumber })
            .from(ticketBlockers)
            .innerJoin(
              tickets,
              eq(tickets.number, ticketBlockers.blockerNumber),
            )
            .where(not(resolvedTicket)),
        ),
    filter.claimed === undefined
      ? undefined
      : filter.claimed
        ? or(
            isNotNull(tickets.claimAgentRunId),
            inArray(tickets.epicNumber, claimedEpics(db)),
          )
        : and(
            isNull(tickets.claimAgentRunId),
            or(
              isNull(tickets.epicNumber),
              notInArray(tickets.epicNumber, claimedEpics(db)),
            ),
          ),
    filter.originNumber === undefined
      ? undefined
      : eq(tickets.originNumber, filter.originNumber),
    filter.type === undefined ? undefined : eq(tickets.type, filter.type),
    filter.cycleId === undefined
      ? undefined
      : (filter.cycleId === null ? notInArray : inArray)(
          tickets.number,
          filter.cycleId === null
            ? outOfBacklog(db)
            : cycleMembers(db, filter.cycleId),
        ),
  );
}

/** `status` as a list: one Status, or the Statuses given. */
function statusList(status: Status | readonly Status[]): Status[] {
  return typeof status === 'string' ? [status] : [...status];
}

/** Why the Statuses to filter on break the rules, if they do. */
function checkStatusFilter(status: Status | readonly Status[]) {
  const list = statusList(status);
  if (list.length === 0) {
    return 'Choose at least one Status, or leave status out.';
  }
  return list.every(isStatus) ? undefined : statusRule;
}

/** Tickets in the order `listTickets` and `findTickets` list them. */
const oldestCreatedFirst = [asc(tickets.createdAt), asc(tickets.number)];

/** The columns a Ticket is ordered by, in every order of `findTickets`. */
const orderColumns = {
  number: tickets.number,
  createdAt: tickets.createdAt,
  status: tickets.status,
  position: tickets.position,
};

type OrderKeys = { [Key in keyof typeof orderColumns]: Ticket[Key] };

/**
 * An order of `findTickets`: the `by` clauses, and the condition for the
 * Tickets listed after a cursor Ticket in that order.
 */
type TicketOrder = {
  by: SQL[];
  after: (cursor: OrderKeys) => SQL | undefined;
};

/** `oldestCreatedFirst`, as an order of `findTickets`. */
const oldestCreatedOrder: TicketOrder = {
  by: oldestCreatedFirst,
  after: (cursor) =>
    listedAfter([
      [tickets.createdAt, cursor.createdAt],
      [tickets.number, cursor.number],
    ]),
};

/** A Ticket's lane on the Board, counted from 0 in Status order. */
const lane = sql<number>`case ${tickets.status} ${sql.join(
  statuses.map((status, index) => sql`when ${status} then ${index}`),
  sql` `,
)} end`;

/**
 * Board order: lanes in Status order, each by position, ties by creation
 * time then number, as the Board orders them.
 */
const boardOrder: TicketOrder = {
  by: [asc(lane), asc(tickets.position), ...oldestCreatedFirst],
  after: (cursor) =>
    listedAfter([
      [lane, statuses.indexOf(cursor.status)],
      [tickets.position, cursor.position],
      [tickets.createdAt, cursor.createdAt],
      [tickets.number, cursor.number],
    ]),
};

/**
 * The condition for rows after `keys` in ascending order of their columns:
 * greater in the first key, or equal in it and after the rest.
 */
function listedAfter(
  keys: [SQLWrapper | AnyColumn, unknown][],
): SQL | undefined {
  const [[column, value], ...rest] = keys;
  return rest.length === 0
    ? gt(column, value)
    : or(gt(column, value), and(eq(column, value), listedAfter(rest)));
}

/**
 * The condition for Tickets whose title or description contains `query`,
 * ignoring (ASCII) case. `%`, `_` and the escape character match literally.
 */
function titleOrDescriptionContains(query: string) {
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  return or(
    sql`${tickets.title} like ${pattern} escape '\\'`,
    sql`${tickets.description} like ${pattern} escape '\\'`,
  );
}

/** Normalized `labels` for adding or removing, at least one, or a `ValidationError`. */
function checkedLabels(labels: readonly string[]): string[] {
  const normalized = normalizeLabels(labels);
  throwFieldErrors({
    labels:
      normalized.length === 0 ? 'Enter a label.' : checkLabels(normalized),
  });
  return normalized;
}

/**
 * Deletes Ticket `number`'s row with everything attached to it: labels,
 * External references, Activity, Comments, acceptance criteria, Blockers on both sides and Cycle
 * membership. The Tickets split from it lose their Origin and are bumped.
 * Run it in the deleting transaction. Returns the Tickets it blocked, the
 * Cycles it left, the Tickets split from it and its own Origin: the caller
 * announces them all, and bumps the ones it blocked and its Origin.
 */
function removeTicket(db: DatabaseConnection, number: number) {
  db.delete(ticketLabels).where(eq(ticketLabels.ticketNumber, number)).run();
  deleteExternalReferences(db, number);
  deleteActivity(db, number);
  db.delete(ticketComments)
    .where(eq(ticketComments.ticketNumber, number))
    .run();
  deleteAttachments(db, number);
  db.delete(ticketAcceptanceCriteria)
    .where(eq(ticketAcceptanceCriteria.ticketNumber, number))
    .run();
  db.delete(ticketBlockers)
    .where(eq(ticketBlockers.blockedNumber, number))
    .run();
  const unblocked = db
    .delete(ticketBlockers)
    .where(eq(ticketBlockers.blockerNumber, number))
    .returning({ number: ticketBlockers.blockedNumber })
    .all()
    .map(({ number: blocked }) => blocked);
  const leftCycles = leaveAllCycles(db, number);
  const unlinked = db
    .update(tickets)
    .set({ originNumber: null, updatedAt: new Date() })
    .where(eq(tickets.originNumber, number))
    .returning({ number: tickets.number })
    .all()
    .map((split) => split.number);
  const removed = db
    .delete(tickets)
    .where(eq(tickets.number, number))
    .returning({ originNumber: tickets.originNumber })
    .get();
  return { unblocked, leftCycles, unlinked, origin: removed?.originNumber };
}

/**
 * The Activity changes of setting `values` on Ticket row `existing`: only
 * the fields that really change, each old → new, and the Claim that moving
 * to Done releases.
 */
function rowChanges(
  db: DatabaseConnection,
  existing: Pick<
    Ticket,
    'status' | 'projectId' | 'title' | 'description' | 'color'
  > &
    ClaimColumns & { originNumber: number | null },
  { status, projectId, title, description, color, originNumber }: TicketValues,
): ActivityChange[] {
  const changes: ActivityChange[] = [];
  if (status !== undefined && status !== existing.status) {
    changes.push({ type: 'status', from: existing.status, to: status });
  }
  if (status === 'Done') {
    changes.push(...claimChanges('claimReleased', existing));
  }
  if (projectId !== undefined && projectId !== existing.projectId) {
    changes.push({
      type: 'project',
      from: activityProject(db, existing.projectId),
      to: activityProject(db, projectId),
    });
  }
  if (title !== undefined && title !== existing.title) {
    changes.push({ type: 'title', from: existing.title, to: title });
  }
  if (description !== undefined && description !== existing.description) {
    changes.push({ type: 'description' });
  }
  if (color !== undefined && color !== existing.color) {
    changes.push({ type: 'color', from: existing.color, to: color });
  }
  if (originNumber !== undefined && originNumber !== existing.originNumber) {
    changes.push({
      type: 'origin',
      from: existing.originNumber,
      to: originNumber,
    });
  }
  return changes;
}

/** A Ticket row's Claim columns: both `null` when it is unclaimed. */
type ClaimColumns = {
  claimAgentRunId: string | null;
  claimAgentName: string | null;
};

/**
 * A Claim change of `type` for the Claim a Ticket row holds, or none when it
 * holds none.
 */
function claimChanges(
  type: 'claimTaken' | 'claimReleased' | 'claimCleared',
  { claimAgentRunId, claimAgentName }: ClaimColumns,
): ActivityChange[] {
  return claimAgentRunId === null
    ? []
    : [{ type, agentRunId: claimAgentRunId, agentName: claimAgentName }];
}

/**
 * The Activity changes of removing `removed` labels and adding `added` ones
 * to a Ticket that had `before`: only the ones that really change.
 */
function labelChanges(
  before: readonly string[],
  { added = [], removed = [] }: { added?: string[]; removed?: string[] },
): ActivityChange[] {
  return [
    ...removed
      .filter((label) => before.includes(label))
      .map((label) => ({ type: 'labelRemoved' as const, label })),
    ...added
      .filter((label) => !before.includes(label))
      .map((label) => ({ type: 'labelAdded' as const, label })),
  ];
}

/**
 * Records a Blocker added or removed between `blocker` and `blocked` on both
 * Tickets, by `actor`. Run it in the transaction that makes the change.
 */
function recordBlocker(
  db: DatabaseConnection,
  actor: Actor,
  { blocker, blocked }: BlockerInput,
  change: 'Added' | 'Removed',
) {
  recordActivity(db, blocked, actor, [
    { type: `blockedBy${change}`, number: blocker },
  ]);
  recordActivity(db, blocker, actor, [
    { type: `blocks${change}`, number: blocked },
  ]);
}

/** Project `id` as an Activity entry names it. */
function activityProject(db: DatabaseConnection, id: number) {
  const project = db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, id))
    .get();
  if (!project) {
    throw new NotFoundError(`There is no Project with id ${id}.`);
  }
  return project;
}

/** Ticket `number`'s labels. */
function labelsOf(db: DatabaseConnection, number: number): string[] {
  return db
    .select({ label: ticketLabels.label })
    .from(ticketLabels)
    .where(eq(ticketLabels.ticketNumber, number))
    .all()
    .map(({ label }) => label);
}

/**
 * Ticket `number`'s acceptance criteria in order with their checked state,
 * as one string, so a replaced list can be compared with the one before.
 */
function criteriaFingerprint(db: DatabaseConnection, number: number): string {
  return JSON.stringify(
    withAcceptanceCriteria(db, [{ number }])[0].acceptanceCriteria.map(
      ({ text, checked }) => [text, checked],
    ),
  );
}

/** Bumps Ticket `number`'s updated time, or says it does not exist. */
function touchTicket(db: DatabaseConnection, number: number) {
  const ticket = db
    .update(tickets)
    .set({ updatedAt: new Date() })
    .where(eq(tickets.number, number))
    .returning({ number: tickets.number })
    .get();
  if (!ticket) {
    throw new NotFoundError(`There is no Ticket T${number}.`);
  }
}

function insertLabels(
  db: DatabaseConnection,
  number: number,
  labels: readonly string[],
) {
  if (labels.length === 0) {
    return;
  }
  db.insert(ticketLabels)
    .values(labels.map((label) => ({ ticketNumber: number, label })))
    .onConflictDoNothing()
    .run();
}

function deleteLabels(
  db: DatabaseConnection,
  number: number,
  labels: readonly string[],
) {
  if (labels.length === 0) {
    return;
  }
  db.delete(ticketLabels)
    .where(
      and(
        eq(ticketLabels.ticketNumber, number),
        inArray(ticketLabels.label, labels),
      ),
    )
    .run();
}

/** `rows` with each Ticket's sorted labels, in one query. */
function withLabels<Row extends { number: number }>(
  db: DatabaseConnection,
  rows: Row[],
): (Row & { labels: string[] })[] {
  const labelsByNumber = new Map<number, string[]>(
    rows.map((row) => [row.number, []]),
  );
  if (rows.length > 0) {
    const labelRows = db
      .select({ number: ticketLabels.ticketNumber, label: ticketLabels.label })
      .from(ticketLabels)
      .where(inArray(ticketLabels.ticketNumber, [...labelsByNumber.keys()]))
      .orderBy(asc(ticketLabels.label))
      .all();
    for (const { number, label } of labelRows) {
      labelsByNumber.get(number)?.push(label);
    }
  }
  return rows.map((row) => ({
    ...row,
    labels: labelsByNumber.get(row.number) ?? [],
  }));
}

/** Inserts `criteria` as new Ticket `number`'s, in order from position 0. */
function insertAcceptanceCriteria(
  db: DatabaseConnection,
  number: number,
  criteria: readonly Omit<AcceptanceCriterion, 'id'>[],
) {
  if (criteria.length === 0) {
    return;
  }
  db.insert(ticketAcceptanceCriteria)
    .values(
      criteria.map(({ text, checked }, position) => ({
        ticketNumber: number,
        text,
        checked,
        position,
      })),
    )
    .run();
}

/**
 * Makes `criteria` Ticket `number`'s whole list of acceptance criteria, in
 * order, by the rules of `AcceptanceCriterionInput`. An id that is not one
 * of the Ticket's criteria is refused, so run it in a transaction.
 */
function replaceAcceptanceCriteria(
  db: DatabaseConnection,
  number: number,
  criteria: readonly AcceptanceCriterionInput[],
) {
  const existing = new Map(
    db
      .select({
        id: ticketAcceptanceCriteria.id,
        text: ticketAcceptanceCriteria.text,
        checked: ticketAcceptanceCriteria.checked,
      })
      .from(ticketAcceptanceCriteria)
      .where(eq(ticketAcceptanceCriteria.ticketNumber, number))
      .all()
      .map((criterion) => [criterion.id, criterion]),
  );
  const unknown = criteria.find(
    ({ id }) => id !== undefined && !existing.has(id),
  );
  throwFieldErrors({
    acceptanceCriteria: unknown
      ? noSuchCriterion(number, unknown.id)
      : undefined,
  });

  const keptIds = givenIds(criteria);
  db.delete(ticketAcceptanceCriteria)
    .where(
      and(
        eq(ticketAcceptanceCriteria.ticketNumber, number),
        notInArray(ticketAcceptanceCriteria.id, keptIds),
      ),
    )
    .run();
  criteria.forEach(({ id, text, checked }, position) => {
    const kept = id === undefined ? undefined : existing.get(id);
    if (kept === undefined) {
      db.insert(ticketAcceptanceCriteria)
        .values({
          ticketNumber: number,
          text,
          checked: checked ?? false,
          position,
        })
        .run();
      return;
    }
    db.update(ticketAcceptanceCriteria)
      .set({
        text,
        checked: checked ?? (text === kept.text && kept.checked),
        position,
      })
      .where(eq(ticketAcceptanceCriteria.id, kept.id))
      .run();
  });
}

/** `rows` with each Ticket's acceptance criteria in order, in one query. */
function withAcceptanceCriteria<Row extends { number: number }>(
  db: DatabaseConnection,
  rows: Row[],
): (Row & Pick<Ticket, 'acceptanceCriteria'>)[] {
  const criteriaByNumber = new Map<number, AcceptanceCriterion[]>(
    rows.map((row) => [row.number, []]),
  );
  if (rows.length > 0) {
    const criterionRows = db
      .select({
        number: ticketAcceptanceCriteria.ticketNumber,
        id: ticketAcceptanceCriteria.id,
        text: ticketAcceptanceCriteria.text,
        checked: ticketAcceptanceCriteria.checked,
      })
      .from(ticketAcceptanceCriteria)
      .where(
        inArray(ticketAcceptanceCriteria.ticketNumber, [
          ...criteriaByNumber.keys(),
        ]),
      )
      .orderBy(
        asc(ticketAcceptanceCriteria.position),
        asc(ticketAcceptanceCriteria.id),
      )
      .all();
    for (const { number, ...criterion } of criterionRows) {
      criteriaByNumber.get(number)?.push(criterion);
    }
  }
  return rows.map((row) => ({
    ...row,
    acceptanceCriteria: criteriaByNumber.get(row.number) ?? [],
  }));
}

/**
 * The shortest chain of Tickets from `from` to `to` in which each blocks the
 * next, both ends included, or `undefined` when `from` does not block `to`.
 */
function blockingPath(
  db: DatabaseConnection,
  from: number,
  to: number,
): number[] | undefined {
  // Each Ticket reached, mapped to the Ticket it was reached from.
  const reachedFrom = new Map<number, number | null>([[from, null]]);
  let frontier = [from];
  while (frontier.length > 0 && !reachedFrom.has(to)) {
    const edges = db
      .select({
        blocker: ticketBlockers.blockerNumber,
        blocked: ticketBlockers.blockedNumber,
      })
      .from(ticketBlockers)
      .where(inArray(ticketBlockers.blockerNumber, frontier))
      .orderBy(asc(ticketBlockers.blockedNumber))
      .all();
    frontier = [];
    for (const { blocker, blocked } of edges) {
      if (!reachedFrom.has(blocked)) {
        reachedFrom.set(blocked, blocker);
        frontier.push(blocked);
      }
    }
  }
  if (!reachedFrom.has(to)) {
    return undefined;
  }
  const path = [to];
  for (let at = reachedFrom.get(to); at != null; at = reachedFrom.get(at)) {
    path.unshift(at);
  }
  return path;
}

/** The condition for a Blocker Ticket that is resolved: Done or archived. */
const resolvedTicket = sql`(${eq(tickets.status, 'Done')} or ${eq(tickets.archived, true)})`;

/**
 * `rows` with each Ticket's Blockers by number, sorted, and whether any of
 * them is unresolved, in one query.
 */
function withBlockers<Row extends { number: number }>(
  db: DatabaseConnection,
  rows: Row[],
): (Row & Pick<Ticket, 'blockedBy' | 'blocked'>)[] {
  const blockersByNumber = new Map<
    number,
    Pick<Ticket, 'blockedBy' | 'blocked'>
  >(rows.map((row) => [row.number, { blockedBy: [], blocked: false }]));
  if (rows.length > 0) {
    const blockerRows = db
      .select({
        blocked: ticketBlockers.blockedNumber,
        blocker: ticketBlockers.blockerNumber,
        resolved: sql<number>`${resolvedTicket}`,
      })
      .from(ticketBlockers)
      .innerJoin(tickets, eq(tickets.number, ticketBlockers.blockerNumber))
      .where(
        inArray(ticketBlockers.blockedNumber, [...blockersByNumber.keys()]),
      )
      .orderBy(asc(ticketBlockers.blockerNumber))
      .all();
    for (const { blocked, blocker, resolved } of blockerRows) {
      const entry = blockersByNumber.get(blocked);
      if (entry) {
        entry.blockedBy.push(blocker);
        entry.blocked ||= !resolved;
      }
    }
  }
  return rows.map((row) => ({
    ...row,
    // Every row was seeded above.
    ...(blockersByNumber.get(row.number) as Pick<
      Ticket,
      'blockedBy' | 'blocked'
    >),
  }));
}

/** `rows` in the order of their Ticket `numbers`. */
function inOrder<Row extends { number: number }>(
  numbers: readonly number[],
  rows: Row[],
): Row[] {
  const order = new Map(numbers.map((number, index) => [number, index]));
  return rows.sort(
    (left, right) =>
      (order.get(left.number) ?? 0) - (order.get(right.number) ?? 0),
  );
}

/**
 * `rows` as `TicketSummary`s, in one query each for labels and Blockers;
 * with their Project only when `withProject`.
 */
function summaries(
  db: DatabaseConnection,
  rows: Pick<Ticket, 'number' | 'title' | 'status' | 'projectId'>[],
  withProject: boolean,
): TicketSummary[] {
  return withBlockers(db, withLabels(db, rows)).map((row) => ({
    ...ticketSummary(row),
    ...(withProject ? { projectId: row.projectId } : {}),
  }));
}

/** The columns `withClaimAndLinks` turns into a Ticket's claim and Epic. */
type RelationColumns = {
  claimAgentRunId: string | null;
  claimAgentName: string | null;
  epicNumber: number | null;
  originNumber: number | null;
};

/**
 * `rows` with each Ticket's claim, Epic, labels, Blockers, External
 * references, acceptance criteria, children, Origin, split-off Tickets and
 * Cycle.
 */
function withRelations<
  Row extends { number: number; status: Status; projectId: number },
>(db: DatabaseConnection, rows: (Row & RelationColumns)[]) {
  return withCycles(
    db,
    withOrigins(
      db,
      withChildren(
        db,
        withAcceptanceCriteria(
          db,
          withAttachments(
            db,
            withExternalReferences(db, withClaimAndLinks(db, rows)),
          ),
        ),
      ),
    ),
  );
}

/** `rows` with each Ticket's claim, Epic, labels and Blockers. */
function withClaimAndLinks<Row extends { number: number }>(
  db: DatabaseConnection,
  rows: (Row & RelationColumns)[],
) {
  const withClaims = rows.map(
    ({ claimAgentRunId, claimAgentName, ...row }) => ({
      ...row,
      claim:
        claimAgentRunId === null
          ? null
          : { agentRunId: claimAgentRunId, agentName: claimAgentName },
    }),
  );
  return withBlockers(db, withLabels(db, withEpics(db, withClaims)));
}

/** `rows` with each Ticket's Epic by number and title, in one query. */
function withEpics<Row extends { epicNumber: number | null }>(
  db: DatabaseConnection,
  rows: Row[],
): (Omit<Row, 'epicNumber'> & Pick<Ticket, 'epic'>)[] {
  const epicNumbers = [
    ...new Set(rows.flatMap(({ epicNumber }) => epicNumber ?? [])),
  ];
  const epics = new Map(
    epicNumbers.length === 0
      ? []
      : db
          .select({
            number: tickets.number,
            title: tickets.title,
            color: tickets.color,
          })
          .from(tickets)
          .where(inArray(tickets.number, epicNumbers))
          .all()
          .map((epic) => [epic.number, epicLinkOf(epic)]),
  );
  return rows.map(({ epicNumber, ...row }) => ({
    ...row,
    epic: epicNumber === null ? null : (epics.get(epicNumber) ?? null),
  }));
}

/**
 * `rows` with each Epic's children and their Blockers, by Ticket number; a
 * normal Ticket's are empty.
 */
function withChildren<Row extends { number: number }>(
  db: DatabaseConnection,
  rows: Row[],
): (Row & Pick<Ticket, 'children'>)[] {
  const childrenByNumber = new Map<number, EpicChild[]>(
    rows.map((row) => [row.number, []]),
  );
  if (rows.length > 0) {
    const childRows = db
      .select({
        epicNumber: tickets.epicNumber,
        number: tickets.number,
        title: tickets.title,
        status: tickets.status,
        archived: tickets.archived,
      })
      .from(tickets)
      .where(inArray(tickets.epicNumber, [...childrenByNumber.keys()]))
      .orderBy(asc(tickets.number))
      .all();
    for (const { epicNumber, ...child } of withBlockers(db, childRows)) {
      if (epicNumber !== null) {
        childrenByNumber.get(epicNumber)?.push(child);
      }
    }
  }
  return rows.map((row) => ({
    ...row,
    children: childrenByNumber.get(row.number) ?? [],
  }));
}

/**
 * The id of the Project `ref` names, or `undefined` when it names none.
 * Throws when the name is unknown or names another Project than the id.
 */
function resolvedProjectId(
  db: DatabaseConnection,
  { projectId, projectName }: ProjectRef,
): number | undefined {
  if (projectName === undefined) {
    return projectId;
  }
  const name = projectName.trim();
  const named = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.nameKey, name.toLowerCase()))
    .get();
  if (!named) {
    const names = db
      .select({ name: projects.name })
      .from(projects)
      .orderBy(asc(projects.name))
      .all()
      .map(({ name }) => `"${name}"`);
    throw new NotFoundError(
      names.length === 0
        ? `There is no Project named "${name}", and there are no Projects yet.`
        : `There is no Project named "${name}". The Projects are: ${names.join(', ')}.`,
    );
  }
  if (projectId !== undefined && projectId !== named.id) {
    const project = db
      .select(projectColumns)
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
    if (!project) {
      throw new NotFoundError(`There is no Project with id ${projectId}.`);
    }
    throw new ValidationError({
      projectName: `Project ${projectId} is "${project.name}", not "${name}". Give projectId or projectName, or both for the same Project.`,
    });
  }
  return named.id;
}

/**
 * Trims `rawName` and checks it is non-empty and not used by another Project
 * (ignoring case). `exceptId` is the Project being renamed, which may keep
 * its own name.
 */
function availableProjectName(
  db: DatabaseConnection,
  rawName: string,
  exceptId?: number,
) {
  const name = rawName.trim();
  if (name === '') {
    throw new ValidationError({ name: 'Enter a Project name.' });
  }

  const nameKey = name.toLowerCase();
  const taken = db
    .select({ name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.nameKey, nameKey),
        exceptId === undefined ? undefined : ne(projects.id, exceptId),
      ),
    )
    .get();
  if (taken) {
    throw new NameTakenError(taken.name);
  }
  return { name, nameKey };
}
