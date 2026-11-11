import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { DatabaseConnection } from '../db/connection';
import {
  projects,
  ticketAcceptanceCriteria,
  ticketBlockers,
  ticketLabels,
  tickets,
} from '../db/schema';
import { type Actor, recordActivity } from './activity';
import type { ActivityChange } from './activity-change';
import {
  checkProjectWritable,
  checkTicketProjectWritable,
  checkTicketWritable,
} from './archived-projects';
import { withAttachments } from './attachments';
import { resolvedBlockerSql } from './blocker-sql';
import type { ChangeChannel } from './changes';
import { leaveOpenCycles, withCycles } from './cycles';
import { epicLinkOf } from './epic-link';
import {
  checkNotEpicAndChild,
  checkUngrouped,
  epicStatusRule,
  syncEpicStatus,
} from './epics';
import { NotFoundError, ValidationError } from './errors';
import {
  checkExternalReferenceCount,
  deleteExternalReferences,
  externalReferenceChanges,
  externalReferencesOf,
  insertExternalReferences,
  withExternalReferences,
} from './external-references';
import { checkOrigin, withOrigins } from './origins';
import { nextPosition } from './positions';
import { throwFieldErrors } from './rules';
import type { Status } from './status';
import {
  givenIds,
  noSuchCriterion,
  type TicketChanges,
  type TicketValues,
} from './ticket-rules';
import type {
  AcceptanceCriterion,
  AcceptanceCriterionInput,
  BlockerInput,
  EpicChild,
  Ticket,
} from './tickets';

/**
 * The ticket-row context: what every area of the Tickets module shares. It
 * holds the database, the actor whose changes are recorded as Activity, the
 * change channel, the transaction, and the row primitives: the row-change
 * pipeline, announcing, Activity recording, the writability checks and
 * hydration, with `getTicket`. `createTickets` builds it once and passes it
 * to each area; nothing outside the Tickets module uses it.
 */
export type TicketRowContext = ReturnType<typeof createTicketRowContext>;

/** Builds the ticket-row context over `db`, acting as `actor`. */
export function createTicketRowContext(
  db: DatabaseConnection,
  actor: Actor,
  changes: ChangeChannel,
) {
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
    { releaseClaim = false }: { releaseClaim?: boolean } = {},
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
          ...(values.status === 'Done' || releaseClaim
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
        ...(releaseClaim && values.status !== 'Done'
          ? claimChanges('claimReleased', existing)
          : []),
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

  /**
   * Throws unless Ticket `blocker` may block Ticket `blocked`: it exists, it
   * is not `blocked` itself, they are not an Epic and its own child, and it
   * would not close a cycle of Blockers.
   */
  function checkBlocker({ blocker, blocked }: BlockerInput) {
    throwFieldErrors({
      blocker:
        blocker === blocked ? 'A Ticket cannot block itself.' : undefined,
    });
    getTicket(blocker);
    checkNotEpicAndChild(db, { blocker, blocked });
    const cycle = blockingPath(db, blocked, blocker);
    throwFieldErrors({
      blocker: cycle
        ? `T${blocker} cannot block T${blocked}, because T${blocked} already blocks T${blocker}: ${cycle.map((number) => `T${number}`).join(' → ')}.`
        : undefined,
    });
  }

  return {
    db,
    actor,
    changes,
    /**
     * Runs `run` all or nothing: the module's functions nest in it, and a
     * thrown refusal undoes every write made inside.
     */
    transaction: <T>(run: () => T): T => db.transaction(run),
    getTicket,
    publishWith,
    applyTicketChanges,
    checkBlocker,
    /** Records `entries` on Ticket `number`'s Activity, by the actor. */
    recordActivity: (number: number, entries: ActivityChange[]) =>
      recordActivity(db, number, actor, entries),
    touchTicket: (number: number) => touchTicket(db, number),
    syncEpicStatus: (epicNumber: number | null) =>
      syncEpicStatus(db, epicNumber),
    checkTicketWritable: (number: number) => checkTicketWritable(db, number),
    checkTicketProjectWritable: (number: number) =>
      checkTicketProjectWritable(db, number),
    checkProjectWritable: (id: number) => checkProjectWritable(db, id),
    labelsOf: (number: number) => labelsOf(db, number),
    insertLabels: (number: number, labels: readonly string[]) =>
      insertLabels(db, number, labels),
    deleteLabels: (number: number, labels: readonly string[]) =>
      deleteLabels(db, number, labels),
    insertAcceptanceCriteria: (
      number: number,
      criteria: readonly Omit<AcceptanceCriterion, 'id'>[],
    ) => insertAcceptanceCriteria(db, number, criteria),
    withLabels: <Row extends { number: number }>(rows: Row[]) =>
      withLabels(db, rows),
    withBlockers: <Row extends { number: number }>(rows: Row[]) =>
      withBlockers(db, rows),
    withRelations: <
      Row extends { number: number; status: Status; projectId: number },
    >(
      rows: (Row & RelationColumns)[],
    ) => withRelations(db, rows),
  };
}

/** The columns a Ticket row is read with, before its relations. */
export const ticketColumns = {
  number: tickets.number,
  title: tickets.title,
  description: tickets.description,
  status: tickets.status,
  type: tickets.type,
  color: tickets.color,
  epicNumber: tickets.epicNumber,
  originNumber: tickets.originNumber,
  filedByRun: tickets.filedByRun,
  projectId: tickets.projectId,
  claimAgentRunId: tickets.claimAgentRunId,
  claimAgentName: tickets.claimAgentName,
  position: tickets.position,
  archived: tickets.archived,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
};

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

/** The Claim a Ticket's claim columns hold, or `null` without one. */
function claimOf({ claimAgentRunId, claimAgentName }: ClaimColumns) {
  return claimAgentRunId === null
    ? null
    : { agentRunId: claimAgentRunId, agentName: claimAgentName };
}

/**
 * A Claim change of `type` for the Claim a Ticket row holds, or none when it
 * holds none.
 */
export function claimChanges(
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
export function labelChanges(
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

/** The condition for a Ticket that is Done or archived. */
export const resolvedTicket = sql`(${eq(tickets.status, 'Done')} or ${eq(tickets.archived, true)})`;

/** The blocked Ticket of a `ticketBlockers` row, beside its Blocker's row. */
export const blockedTicket = alias(tickets, 'blocked_ticket');

/**
 * Whether the `tickets` row, as the Blocker of `blockedTicket`, is resolved:
 * the one Blocker rule (T828).
 */
export const resolvedBlocker = resolvedBlockerSql(
  tickets,
  blockedTicket.epicNumber,
);

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
        resolved: sql<number>`${resolvedBlocker}`,
      })
      .from(ticketBlockers)
      .innerJoin(tickets, eq(tickets.number, ticketBlockers.blockerNumber))
      .innerJoin(
        blockedTicket,
        eq(blockedTicket.number, ticketBlockers.blockedNumber),
      )
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
      claim: claimOf({ claimAgentRunId, claimAgentName }),
    }),
  );
  return withBlockers(db, withLabels(db, withEpics(db, withClaims)));
}

/**
 * `rows` with each Ticket's Epic: its number, title and colour, and the
 * Claim and PR reference its children fall back to (T1143).
 */
function withEpics<Row extends { epicNumber: number | null }>(
  db: DatabaseConnection,
  rows: Row[],
): (Omit<Row, 'epicNumber'> & Pick<Ticket, 'epic'>)[] {
  const epicNumbers = [
    ...new Set(rows.flatMap(({ epicNumber }) => epicNumber ?? [])),
  ];
  const epicRows =
    epicNumbers.length === 0
      ? []
      : db
          .select({
            number: tickets.number,
            title: tickets.title,
            color: tickets.color,
            claimAgentRunId: tickets.claimAgentRunId,
            claimAgentName: tickets.claimAgentName,
          })
          .from(tickets)
          .where(inArray(tickets.number, epicNumbers))
          .all();
  const epics = new Map(
    withExternalReferences(db, epicRows).map(
      ({ claimAgentRunId, claimAgentName, ...epic }) => [
        epic.number,
        epicLinkOf({
          ...epic,
          claim: claimOf({ claimAgentRunId, claimAgentName }),
        }),
      ],
    ),
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
        uncheckedCriteria: sql<number>`(
          select count(*) from ${ticketAcceptanceCriteria}
          where ${ticketAcceptanceCriteria.ticketNumber} = ${tickets.number}
            and ${ticketAcceptanceCriteria.checked} = 0
        )`,
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
