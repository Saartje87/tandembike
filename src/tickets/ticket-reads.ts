import {
  type AnyColumn,
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  not,
  notInArray,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { DatabaseConnection } from '../db/connection';
import { projects, ticketBlockers, ticketLabels, tickets } from '../db/schema';
import { cycleMembers, outOfBacklog } from './cycles';
import { claimedEpics } from './epics';
import {
  checkExternalReferencesFilter,
  normalizeExternalReferences,
  withAnyExternalReference,
} from './external-references';
import { resolvedProjectId } from './projects';
import { throwFieldErrors } from './rules';
import { isStatus, type Status, statuses, statusRule } from './status';
import {
  blockedTicket,
  resolvedBlocker,
  type TicketRowContext,
  ticketColumns,
} from './ticket-row-context';
import { normalizeLabels } from './ticket-rules';
import type {
  FindTicketsInput,
  ListedTicketSummary,
  ListTicketsFilter,
  Ticket,
  TicketPage,
  TicketSummary,
} from './tickets';

export const defaultPageSize = 50;

export const maxPageSize = 200;

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

/** The columns `findTickets` turns into a `TicketSummary`. */
const summaryColumns = {
  number: tickets.number,
  title: tickets.title,
  status: tickets.status,
  type: tickets.type,
  projectId: tickets.projectId,
  epicNumber: tickets.epicNumber,
  updatedAt: tickets.updatedAt,
};

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
            .innerJoin(
              blockedTicket,
              eq(blockedTicket.number, ticketBlockers.blockedNumber),
            )
            .where(not(resolvedBlocker)),
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
    filter.epicNumber === undefined
      ? undefined
      : eq(tickets.epicNumber, filter.epicNumber),
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

const changedSinceRule =
  'Give changedSince as an ISO 8601 timestamp with a time zone, such as 2026-11-07T23:05:00Z.';

/**
 * An ISO 8601 date-time with a time zone (`Z` or an offset), as a Date, or
 * `null` when `text` is not one or names no real moment, such as 30 February.
 */
export function parseTimestamp(text: string): Date | null {
  const trimmed = text.trim();
  const match =
    /^\d{4}-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.exec(
      trimmed,
    );
  const time = Date.parse(trimmed);
  if (!match || Number.isNaN(time)) {
    return null;
  }
  // Date.parse rolls 30 February over to 2 March; refuse it instead.
  const day = new Date(trimmed.slice(0, 10));
  return day.getUTCMonth() + 1 === Number(match[1]) &&
    day.getUTCDate() === Number(match[2])
    ? new Date(time)
    : null;
}

/** The children an Epic is checked against for `changedSince`. */
const changedChildren = alias(tickets, 'changed_children');

/**
 * Tickets created or changed at or after `since`, and Epics with a child
 * that was. Attaching and detaching a child bump its Epic's updated time.
 */
function changedAtOrAfter(db: DatabaseConnection, since: Date) {
  return or(
    gte(tickets.updatedAt, since),
    inArray(
      tickets.number,
      db
        .select({ number: changedChildren.epicNumber })
        .from(changedChildren)
        .where(
          and(
            isNotNull(changedChildren.epicNumber),
            gte(changedChildren.updatedAt, since),
          ),
        ),
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
 * `rows` as `ListedTicketSummary`s, in one query each for labels and Blockers;
 * with their Project only when `withProject`.
 */
function summaries(
  { withBlockers, withLabels }: TicketRowContext,
  rows: (Pick<
    Ticket,
    'number' | 'title' | 'status' | 'type' | 'projectId' | 'updatedAt'
  > & {
    epicNumber: number | null;
  })[],
  withProject: boolean,
): ListedTicketSummary[] {
  return withBlockers(withLabels(rows)).map((row) => ({
    ...ticketSummary(row),
    type: row.type,
    epicNumber: row.epicNumber,
    updatedAt: row.updatedAt,
    ...(withProject ? { projectId: row.projectId } : {}),
  }));
}

/**
 * The read and find area of the Tickets module: one Ticket, the Tickets
 * matching a filter, a page of them, and the labels in use.
 */
export function createTicketReads(ctx: TicketRowContext) {
  const { db, getTicket, withRelations } = ctx;
  return {
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
      return withRelations(rows);
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
      const changedSince =
        input.changedSince === undefined
          ? undefined
          : parseTimestamp(input.changedSince);
      throwFieldErrors({
        changedSince: changedSince === null ? changedSinceRule : undefined,
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
        changedSince == null ? undefined : changedAtOrAfter(db, changedSince),
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
                inOrder(
                  page,
                  db.select(ticketColumns).from(tickets).where(inPage).all(),
                ),
              )
            : summaries(
                ctx,
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

    /**
     * Every label on any Ticket, archived ones included, sorted; with
     * `projectId`, only those on that Project's Tickets.
     */
    listLabels({ projectId }: { projectId?: number } = {}): string[] {
      return db
        .selectDistinct({ label: ticketLabels.label })
        .from(ticketLabels)
        .innerJoin(tickets, eq(tickets.number, ticketLabels.ticketNumber))
        .where(
          projectId === undefined
            ? undefined
            : eq(tickets.projectId, projectId),
        )
        .orderBy(asc(ticketLabels.label))
        .all()
        .map(({ label }) => label);
    },

    getTicket,
  };
}
