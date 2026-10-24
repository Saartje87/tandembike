import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  not,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import {
  type commentAuthors,
  projects,
  ticketAcceptanceCriteria,
  ticketBlockers,
  ticketComments,
  ticketLabels,
  tickets,
} from '../db/schema';
import { type ChangeChannel, createChangeChannel } from './changes';
import {
  createCycles,
  cycleMembers,
  leaveOpenCycles,
  planNewTicket,
} from './cycles';
import {
  NameTakenError,
  NotAllowedError,
  NotFoundError,
  TicketsError,
  ValidationError,
} from './errors';
import { checkTitle, throwFieldErrors } from './rules';
import { isStatus, type Status, statusRule } from './status';

export type Project = {
  id: number;
  name: string;
  createdAt: Date;
};

export type CreateProjectInput = { name: string };

export type RenameProjectInput = { name: string };

export type Tickets = ReturnType<typeof createTickets>;

const projectColumns = {
  id: projects.id,
  name: projects.name,
  createdAt: projects.createdAt,
};

export type Ticket = {
  number: number;
  title: string;
  /** Markdown; empty when the Ticket has none. */
  description: string;
  status: Status;
  projectId: number;
  position: number;
  archived: boolean;
  /** Trimmed, lower-cased and sorted; empty when the Ticket has none. */
  labels: string[];
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
  /** In order; defaults to none. Each starts unchecked unless `checked`. */
  acceptanceCriteria?: NewAcceptanceCriterion[];
  /** A Cycle of the same Project to plan it into; defaults to none. */
  cycleId?: number;
};

export type NewAcceptanceCriterion = Pick<AcceptanceCriterion, 'text'> & {
  /** Defaults to false. */
  checked?: boolean;
};

/** Any subset of a Ticket's editable fields; missing ones stay as they are. */
export type UpdateTicketInput = {
  title?: string;
  description?: string;
  status?: Status;
  projectId?: number;
  /** Labels to add, after `removeLabels` are removed. */
  addLabels?: string[];
  /** Labels to remove, ignoring case and ones the Ticket does not have. */
  removeLabels?: string[];
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
  'status' | 'addLabels' | 'removeLabels'
> & {
  /** Explicit Ticket numbers, each once, at most `maxBatchSize`. */
  ticketNumbers: number[];
};

/** Which Tickets a batch update changed and which it did not, and why. */
export type UpdateTicketsResult = {
  /** The changed Tickets, in the order given. */
  updated: Ticket[];
  /** The Tickets left unchanged, in the order given. */
  failed: { number: number; error: string }[];
};

export const maxBatchSize = 50;

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

export type ListTicketsFilter = {
  projectId?: number;
  status?: Status;
  /** Only Tickets that have every one of these labels, ignoring case. */
  labels?: string[];
  /** Also list archived Tickets, which are left out by default. */
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
};

export const defaultPageSize = 50;

export const maxPageSize = 200;

export type FindTicketsInput = ListTicketsFilter & {
  /**
   * Only Tickets whose title or description contains this, trimmed and
   * ignoring (ASCII) case.
   */
  query?: string;
  /** At most this many Tickets, from 1 to `maxPageSize`; `defaultPageSize` if left out. */
  limit?: number;
  /** List the Tickets after this Ticket number: a previous page's `nextCursor`. */
  cursor?: number;
  /** List whole Tickets rather than `TicketSummary`s. Defaults to false. */
  includeDescription?: boolean;
};

/**
 * A Ticket as `findTickets` lists it: without its description, position or
 * acceptance criteria.
 */
export type TicketSummary = Omit<
  Ticket,
  'description' | 'position' | 'acceptanceCriteria'
>;

/** One page of `findTickets`. */
export type TicketPage = {
  /** Whole Tickets when `includeDescription` is set. */
  tickets: TicketSummary[] | Ticket[];
  /** The `cursor` for the next page, or `null` on the last page. */
  nextCursor: number | null;
};

/** Who wrote a Comment: the UI writes `user`, MCP writes `agent`. */
export type CommentAuthor = (typeof commentAuthors)[number];

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

function claimOwner(agentRunId: string | null, agentName: string | null) {
  if (agentRunId === null) {
    throw new Error('A claimed Ticket must have an Agent run id.');
  }
  return agentName === null
    ? `Agent run ${agentRunId}`
    : `${agentName} (${agentRunId})`;
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
function checkNewTicket(input: CreateTicketInput) {
  const title = input.title.trim();
  const description = input.description ?? '';
  const status = input.status ?? 'Todo';
  const labels = normalizeLabels(input.labels ?? []);
  const acceptanceCriteria = (input.acceptanceCriteria ?? []).map(
    ({ text, checked }) => ({ text: text.trim(), checked: checked ?? false }),
  );

  throwFieldErrors({
    title: checkTitle(title),
    description: checkDescription(description),
    status: checkStatus(status),
    labels: checkLabels(labels),
    acceptanceCriteria: checkAcceptanceCriteria(
      acceptanceCriteria.map(({ text }) => text),
    ),
  });
  return { values: { title, description, status }, labels, acceptanceCriteria };
}

/** The fields of a Ticket row an update may set. */
type TicketValues = Pick<
  UpdateTicketInput,
  'title' | 'description' | 'status' | 'projectId'
>;

/**
 * A checked Ticket update: the row fields given, normalized labels and the
 * trimmed acceptance criteria, if given.
 */
type TicketChanges = {
  values: TicketValues;
  addLabels: string[];
  removeLabels: string[];
  acceptanceCriteria?: AcceptanceCriterionInput[];
};

/**
 * The cleaned-up fields of a Ticket update, holding only the fields given,
 * or a `ValidationError` by the same rules as creating a Ticket. A label
 * named both to add and to remove is refused.
 */
function checkTicketChanges(input: UpdateTicketInput): TicketChanges {
  const title = input.title?.trim();
  const { description, status, projectId } = input;
  const addLabels = normalizeLabels(input.addLabels ?? []);
  const removeLabels = normalizeLabels(input.removeLabels ?? []);
  const inBoth = addLabels.filter((label) => removeLabels.includes(label));
  const acceptanceCriteria = input.acceptanceCriteria?.map((criterion) => ({
    ...criterion,
    text: criterion.text.trim(),
  }));

  throwFieldErrors({
    title: title === undefined ? undefined : checkTitle(title),
    description:
      description === undefined ? undefined : checkDescription(description),
    status: status === undefined ? undefined : checkStatus(status),
    addLabels: checkLabels(addLabels),
    removeLabels: checkLabels(removeLabels),
    labels:
      inBoth.length === 0
        ? undefined
        : `Name each label in addLabels or removeLabels, not both: ${inBoth.join(', ')}.`,
    acceptanceCriteria:
      acceptanceCriteria === undefined
        ? undefined
        : (checkAcceptanceCriteria(
            acceptanceCriteria.map(({ text }) => text),
          ) ?? checkCriterionIds(acceptanceCriteria)),
  });
  const values = Object.fromEntries(
    Object.entries({ title, description, status, projectId }).filter(
      ([, value]) => value !== undefined,
    ),
  ) as TicketValues;
  return { values, addLabels, removeLabels, acceptanceCriteria };
}

/** The ids of the `criteria` that have one, in order. */
function givenIds(criteria: readonly { id?: number }[]): number[] {
  return criteria.flatMap(({ id }) => (id === undefined ? [] : [id]));
}

/** Why Ticket `number` has no acceptance criterion `id`. */
function noSuchCriterion(number: number, id: number | undefined) {
  return `Ticket #${number} has no acceptance criterion ${id}.`;
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

/** Why `ticketNumbers` is not a valid batch, if it is not. */
function checkBatchNumbers(ticketNumbers: readonly number[]) {
  if (ticketNumbers.length === 0) {
    return 'Choose at least one Ticket.';
  }
  if (ticketNumbers.length > maxBatchSize) {
    return `Choose at most ${maxBatchSize} Tickets at a time.`;
  }
  const duplicate = ticketNumbers.find(
    (number, index) => ticketNumbers.indexOf(number) !== index,
  );
  if (duplicate !== undefined) {
    return `Choose each Ticket once: #${duplicate} is given twice.`;
  }
  return undefined;
}

const ticketColumns = {
  number: tickets.number,
  title: tickets.title,
  description: tickets.description,
  status: tickets.status,
  projectId: tickets.projectId,
  claimAgentRunId: tickets.claimAgentRunId,
  claimAgentName: tickets.claimAgentName,
  position: tickets.position,
  archived: tickets.archived,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
};

const { description: _, position: __, ...summaryColumns } = ticketColumns;

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
 */
export function createTickets(
  db: DatabaseConnection,
  changes: ChangeChannel = createChangeChannel(),
) {
  return {
    ...createCycles(db, changes),

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
      const limit = input.limit ?? defaultPageSize;
      const query = input.query?.trim();
      const cursor =
        input.cursor === undefined
          ? undefined
          : db
              .select({ number: tickets.number, createdAt: tickets.createdAt })
              .from(tickets)
              .where(eq(tickets.number, input.cursor))
              .get();
      throwFieldErrors({
        limit: checkLimit(limit),
        query: query === undefined ? undefined : checkQuery(query),
        cursor:
          input.cursor !== undefined && !cursor
            ? `There is no Ticket #${input.cursor} to continue after.`
            : undefined,
      });
      const rows = db
        .select(input.includeDescription ? ticketColumns : summaryColumns)
        .from(tickets)
        .where(
          and(
            matchingTickets(db, input),
            query === undefined ? undefined : titleOrDescriptionContains(query),
            cursor === undefined ? undefined : orderedAfter(cursor),
          ),
        )
        .orderBy(...oldestCreatedFirst)
        .limit(limit + 1)
        .all();
      const page = rows.slice(0, limit);
      return {
        tickets: input.includeDescription
          ? withRelations(db, page)
          : withSummaryRelations(db, page),
        nextCursor: rows.length > limit ? page[page.length - 1].number : null,
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
          throw new NotFoundError(`There is no Ticket #${number}.`);
        }
        if (existing.claimAgentRunId === agentRunId) {
          return false;
        }

        const owner = claimOwner(
          existing.claimAgentRunId,
          existing.claimAgentName,
        );
        throw new NotAllowedError(
          `Ticket #${number} is already claimed by ${owner}.`,
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
          throw new NotFoundError(`There is no Ticket #${number}.`);
        }
        if (existing.claimAgentRunId === null) {
          return false;
        }

        const owner = claimOwner(
          existing.claimAgentRunId,
          existing.claimAgentName,
        );
        throw new NotAllowedError(
          `Ticket #${number} is claimed by ${owner}; only that Agent run can release it.`,
        );
      });

      if (changed) {
        changes.publish({ type: 'ticket', number });
      }
      return getTicket(number);
    },

    /** Clears any claim on Ticket `number` for the User. */
    clearTicketClaim(number: number): Ticket {
      const cleared = db
        .update(tickets)
        .set({
          claimAgentRunId: null,
          claimAgentName: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(tickets.number, number), isNotNull(tickets.claimAgentRunId)),
        )
        .returning({ number: tickets.number })
        .get();
      if (cleared) {
        changes.publish({ type: 'ticket', number });
      }
      return getTicket(number);
    },

    createTicket(input: CreateTicketInput): Ticket {
      const { values, labels, acceptanceCriteria } = checkNewTicket(input);
      const project = db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get();
      if (!project) {
        throw new NotFoundError(
          `There is no Project with id ${input.projectId}.`,
        );
      }

      const now = new Date();
      // better-sqlite3 runs every statement on this one connection, so
      // statements on `db` inside the callback are part of the transaction.
      const number = db.transaction(() => {
        const { number } = db
          .insert(tickets)
          .values({
            ...values,
            projectId: project.id,
            position: nextPosition(db, project.id, values.status),
            createdAt: now,
            updatedAt: now,
          })
          .returning({ number: tickets.number })
          .get();
        insertLabels(db, number, labels);
        insertAcceptanceCriteria(db, number, acceptanceCriteria);
        if (input.cycleId !== undefined) {
          planNewTicket(db, { cycleId: input.cycleId, number }, project.id);
        }
        return number;
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Changes the given fields of Ticket `number` by the rules for creating
     * one, and bumps its updated time even when no fields are given. Any
     * Status may follow any other.
     */
    updateTicket(number: number, input: UpdateTicketInput): Ticket {
      const checked = checkTicketChanges(input);
      if (checked.values.projectId !== undefined) {
        const project = db
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, checked.values.projectId))
          .get();
        if (!project) {
          throw new NotFoundError(
            `There is no Project with id ${checked.values.projectId}.`,
          );
        }
      }

      applyTicketChanges(number, checked);
      changes.publish({ type: 'ticket', number });
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
      const { ticketNumbers, status, addLabels, removeLabels } = input;
      const checked = checkTicketChanges({ status, addLabels, removeLabels });
      throwFieldErrors({
        ticketNumbers: checkBatchNumbers(ticketNumbers),
        change:
          checked.values.status === undefined &&
          checked.addLabels.length === 0 &&
          checked.removeLabels.length === 0
            ? 'Give a Status, addLabels or removeLabels to change.'
            : undefined,
      });

      const changed: number[] = [];
      const failed: UpdateTicketsResult['failed'] = [];
      try {
        for (const number of ticketNumbers) {
          try {
            applyTicketChanges(number, checked);
            changed.push(number);
          } catch (error) {
            if (!(error instanceof TicketsError)) {
              throw error;
            }
            failed.push({ number, error: error.message });
          }
        }
      } finally {
        if (changed.length > 0) {
          changes.publish({ type: 'tickets', numbers: changed });
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
        touchTicket(db, number);
        insertLabels(db, number, added);
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
        touchTicket(db, number);
        deleteLabels(db, number, removed);
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
        touchTicket(db, number);
        for (const { id, checked } of criteria) {
          const criterion = db
            .update(ticketAcceptanceCriteria)
            .set({ checked })
            .where(
              and(
                eq(ticketAcceptanceCriteria.id, id),
                eq(ticketAcceptanceCriteria.ticketNumber, number),
              ),
            )
            .returning({ id: ticketAcceptanceCriteria.id })
            .get();
          throwFieldErrors({
            acceptanceCriteria: criterion
              ? undefined
              : noSuchCriterion(number, id),
          });
        }
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
        const cycle = blockingPath(db, blocked, blocker);
        throwFieldErrors({
          blocker: cycle
            ? `#${blocker} cannot block #${blocked}, because #${blocked} already blocks #${blocker}: ${cycle.map((number) => `#${number}`).join(' → ')}.`
            : undefined,
        });
        touchTicket(db, blocked);
        db.insert(ticketBlockers)
          .values({ blockerNumber: blocker, blockedNumber: blocked })
          .onConflictDoNothing()
          .run();
      });
      changes.publish({ type: 'tickets', numbers: [blocker, blocked] });
      return getTicket(blocked);
    },

    /**
     * Stops Ticket `blocker` blocking Ticket `blocked`, ignoring a Blocker it
     * does not have, and bumps the blocked Ticket's updated time. Returns the
     * blocked Ticket.
     */
    removeBlocker({ blocker, blocked }: BlockerInput): Ticket {
      db.transaction(() => {
        touchTicket(db, blocked);
        db.delete(ticketBlockers)
          .where(
            and(
              eq(ticketBlockers.blockerNumber, blocker),
              eq(ticketBlockers.blockedNumber, blocked),
            ),
          )
          .run();
      });
      changes.publish({ type: 'tickets', numbers: [blocker, blocked] });
      return getTicket(blocked);
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

      const project = db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get();
      if (!project) {
        throw new NotFoundError(`There is no Project with id ${projectId}.`);
      }

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
              cycleMembers(db, cycleId)
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

    /** Adds a Markdown comment by `author` to Ticket `number`. */
    addComment(number: number, input: AddCommentInput): Comment {
      const body = checkedCommentBody(input.body);
      getTicket(number);
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
      db.delete(ticketComments).where(eq(ticketComments.id, id)).run();
      changes.publish({ type: 'ticket', number: ticketNumber });
    },

    /**
     * Archives Ticket `number`: it leaves the normal views but keeps
     * everything, so restoring brings it back. There is no delete (ADR 0003).
     */
    archiveTicket(number: number): Ticket {
      return setArchived(number, true);
    },

    /** Brings archived Ticket `number` back exactly as it was. */
    restoreTicket(number: number): Ticket {
      return setArchived(number, false);
    },
  };

  function getTicket(number: number): Ticket {
    const ticket = db
      .select(ticketColumns)
      .from(tickets)
      .where(eq(tickets.number, number))
      .get();
    if (!ticket) {
      throw new NotFoundError(`There is no Ticket #${number}.`);
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
   * announcing them: removed labels go before added ones, a Ticket that
   * changes Project or Status goes to the end of its new lane, and one that
   * changes Project leaves its Cycle unless that is Archived.
   */
  function applyTicketChanges(
    number: number,
    { values, addLabels, removeLabels, acceptanceCriteria }: TicketChanges,
  ) {
    db.transaction(() => {
      const existing = db
        .select(ticketColumns)
        .from(tickets)
        .where(eq(tickets.number, number))
        .get();
      if (!existing) {
        throw new NotFoundError(`There is no Ticket #${number}.`);
      }
      const projectId = values.projectId ?? existing.projectId;
      const status = values.status ?? existing.status;
      const moved =
        projectId !== existing.projectId || status !== existing.status;
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
      if (projectId !== existing.projectId) {
        leaveOpenCycles(db, number);
      }
      deleteLabels(db, number, removeLabels);
      insertLabels(db, number, addLabels);
      if (acceptanceCriteria !== undefined) {
        replaceAcceptanceCriteria(db, number, acceptanceCriteria);
      }
    });
  }

  /** Sets only the archived flag (and updated time), and announces it. */
  function setArchived(number: number, archived: boolean): Ticket {
    const ticket = db
      .update(tickets)
      .set({ archived, updatedAt: new Date() })
      .where(eq(tickets.number, number))
      .returning({ number: tickets.number })
      .get();
    if (!ticket) {
      throw new NotFoundError(`There is no Ticket #${number}.`);
    }
    changes.publish({ type: 'ticket', number });
    return getTicket(number);
  }
}

/** The condition for Tickets matching `filter`, as `listTickets` documents. */
function matchingTickets(db: DatabaseConnection, filter: ListTicketsFilter) {
  const labels = normalizeLabels(filter.labels ?? []);
  return and(
    filter.projectId === undefined
      ? undefined
      : eq(tickets.projectId, filter.projectId),
    filter.status === undefined ? undefined : eq(tickets.status, filter.status),
    filter.includeArchived ? undefined : eq(tickets.archived, false),
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
        ? isNotNull(tickets.claimAgentRunId)
        : isNull(tickets.claimAgentRunId),
    filter.cycleId === undefined
      ? undefined
      : (filter.cycleId === null ? notInArray : inArray)(
          tickets.number,
          cycleMembers(db, filter.cycleId),
        ),
  );
}

/** Tickets in the order `listTickets` and `findTickets` list them. */
const oldestCreatedFirst = [asc(tickets.createdAt), asc(tickets.number)];

/** The condition for Tickets listed after Ticket `cursor`, by `oldestCreatedFirst`. */
function orderedAfter(cursor: Pick<Ticket, 'number' | 'createdAt'>) {
  return or(
    gt(tickets.createdAt, cursor.createdAt),
    and(
      eq(tickets.createdAt, cursor.createdAt),
      gt(tickets.number, cursor.number),
    ),
  );
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

/** Bumps Ticket `number`'s updated time, or says it does not exist. */
function touchTicket(db: DatabaseConnection, number: number) {
  const ticket = db
    .update(tickets)
    .set({ updatedAt: new Date() })
    .where(eq(tickets.number, number))
    .returning({ number: tickets.number })
    .get();
  if (!ticket) {
    throw new NotFoundError(`There is no Ticket #${number}.`);
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

/** `rows` with each Ticket's claim, labels, Blockers and acceptance criteria. */
function withRelations<Row extends { number: number }>(
  db: DatabaseConnection,
  rows: (Row & {
    claimAgentRunId: string | null;
    claimAgentName: string | null;
  })[],
) {
  return withAcceptanceCriteria(db, withSummaryRelations(db, rows));
}

/** `rows` with each Ticket's claim, labels and Blockers, as summaries list them. */
function withSummaryRelations<Row extends { number: number }>(
  db: DatabaseConnection,
  rows: (Row & {
    claimAgentRunId: string | null;
    claimAgentName: string | null;
  })[],
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
  return withBlockers(db, withLabels(db, withClaims));
}

function nextPosition(
  db: DatabaseConnection,
  projectId: number,
  status: Status,
  exceptNumber?: number,
): number {
  const result = db
    .select({ position: max(tickets.position) })
    .from(tickets)
    .where(
      and(
        eq(tickets.projectId, projectId),
        eq(tickets.status, status),
        exceptNumber === undefined
          ? undefined
          : ne(tickets.number, exceptNumber),
      ),
    )
    .get();
  return (result?.position ?? -1) + 1;
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
