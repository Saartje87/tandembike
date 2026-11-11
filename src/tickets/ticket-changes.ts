import { and, asc, eq, sql } from 'drizzle-orm';

import {
  ticketAcceptanceCriteria,
  ticketBlockers,
  tickets,
} from '../db/schema';
import type { ActivityChange } from './activity-change';
import type { MoveToCycleInput, MoveToCycleResult } from './cycles';
import type { EpicChildInput } from './epics';
import { type BatchFailure, TicketsError } from './errors';
import {
  checkExternalReferenceCount,
  checkedExternalReferences,
  deleteExternalReferences,
  externalReferenceChanges,
  externalReferencesOf,
  insertExternalReferences,
} from './external-references';
import { checkBatchNumbers, throwFieldErrors } from './rules';
import {
  blockedTicket,
  labelChanges,
  resolvedBlocker,
  resolvedTicket,
  type TicketRowContext,
} from './ticket-row-context';
import {
  checkCriterionIds,
  checkLabels,
  checkTicketChanges,
  normalizeLabels,
  noSuchCriterion,
} from './ticket-rules';
import type {
  AcceptanceCriterionCheckedInput,
  BlockerInput,
  Blockers,
  ReorderAnchor,
  Ticket,
  TicketChange,
  UpdatedTicket,
  UpdateTicketInput,
  UpdateTicketsInput,
  UpdateTicketsResult,
} from './tickets';

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
 * Records a Blocker added or removed between `blocker` and `blocked` on both
 * Tickets, by `actor`. Run it in the transaction that makes the change.
 */
function recordBlocker(
  { recordActivity }: TicketRowContext,
  { blocker, blocked }: BlockerInput,
  change: 'Added' | 'Removed',
) {
  recordActivity(blocked, [{ type: `blockedBy${change}`, number: blocker }]);
  recordActivity(blocker, [{ type: `blocks${change}`, number: blocked }]);
}

const relatedTicketColumns = {
  number: tickets.number,
  title: tickets.title,
  status: tickets.status,
  projectId: tickets.projectId,
  archived: tickets.archived,
};

/** The functions of other areas the change area builds on. */
export type TicketChangeDeps = {
  restoreTicket: (number: number) => Ticket;
  archiveTicket: (number: number) => Ticket;
  moveToEpic: (input: EpicChildInput) => Ticket;
  detachFromEpic: (number: number) => Ticket;
  moveTicketsToCycle: (input: MoveToCycleInput) => MoveToCycleResult;
  reorderTicket: (number: number, anchor: ReorderAnchor) => void;
};

/**
 * The change area of the Tickets module: `updateTicket`, which applies
 * every kind of change in one transaction, and the single-purpose changes:
 * a batch of Statuses and labels, labels, External references, acceptance
 * criteria checks and Blockers.
 */
export function createTicketChanges(
  ctx: TicketRowContext,
  deps: TicketChangeDeps,
) {
  const {
    db,
    changes,
    getTicket,
    publishWith,
    applyTicketChanges,
    checkBlocker,
    recordActivity,
    touchTicket,
    checkTicketWritable,
    checkProjectWritable,
    labelsOf,
    insertLabels,
    deleteLabels,
  } = ctx;

  /**
   * The core-fields step of `updateTicket`: changes the given fields of
   * Ticket `number` by the rules for creating one, and bumps its updated
   * time even when no fields are given.
   */
  function updateFields(number: number, input: UpdateTicketInput) {
    const checked = checkTicketChanges(input);
    checkTicketWritable(number);
    if (checked.values.projectId !== undefined) {
      checkProjectWritable(checked.values.projectId);
    }

    const { leftCycles, changedEpic, changedOrigins } = applyTicketChanges(
      number,
      checked,
    );
    publishWith(number, changedEpic, ...changedOrigins);
    for (const id of leftCycles) {
      changes.publish({ type: 'cycle', id });
    }
  }

  /**
   * Makes Ticket `blocker` a Blocker of Ticket `blocked`, which bumps the
   * blocked Ticket's updated time. Adding one it already has changes
   * nothing else. Either Ticket may be in any Project. A Ticket blocking
   * itself, or a Blocker that would close a cycle, is refused. Returns the
   * blocked Ticket.
   */
  function addBlocker({ blocker, blocked }: BlockerInput): Ticket {
    throwFieldErrors({
      blocker:
        blocker === blocked ? 'A Ticket cannot block itself.' : undefined,
    });
    db.transaction(() => {
      checkTicketWritable(blocked);
      checkBlocker({ blocker, blocked });
      touchTicket(blocked);
      const added = db
        .insert(ticketBlockers)
        .values({ blockerNumber: blocker, blockedNumber: blocked })
        .onConflictDoNothing()
        .returning({ blocked: ticketBlockers.blockedNumber })
        .get();
      if (added) {
        recordBlocker(ctx, { blocker, blocked }, 'Added');
      }
    });
    changes.publish({ type: 'tickets', numbers: [blocker, blocked] });
    return getTicket(blocked);
  }

  /**
   * Stops Ticket `blocker` blocking Ticket `blocked`, ignoring a Blocker it
   * does not have, and bumps the blocked Ticket's updated time. Both
   * Tickets must exist. Returns the blocked Ticket.
   */
  function removeBlocker({ blocker, blocked }: BlockerInput): Ticket {
    db.transaction(() => {
      getTicket(blocker);
      checkTicketWritable(blocked);
      touchTicket(blocked);
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
        recordBlocker(ctx, { blocker, blocked }, 'Removed');
      }
    });
    changes.publish({ type: 'tickets', numbers: [blocker, blocked] });
    return getTicket(blocked);
  }

  return {
    /**
     * Changes Ticket `number` fully, in one transaction: a restore first
     * (`archived: false`), so the rest applies to the restored Ticket, then
     * the core fields, Epic, Blockers, Cycle, Board position and archive
     * (`archived: true`), in that order. Each step is refused with the
     * message of the single-purpose function it applies, records Activity
     * and announces as that function does, and a refusal leaves the Ticket
     * unchanged. The core fields follow the rules for creating a Ticket and
     * bump its updated time even when nothing is given; any Status may follow
     * any other. With `withChildren`, `childrenMoved` names the children
     * whose Cycle changed with it.
     */
    updateTicket(number: number, change: TicketChange): UpdatedTicket {
      const {
        epicNumber,
        addBlockers = [],
        removeBlockers = [],
        cycleId,
        withChildren,
        archived,
        before,
        after,
        ...fields
      } = change;
      return db.transaction(() => {
        if (withChildren && cycleId === undefined) {
          throw new TicketsError(
            "withChildren takes an Epic's children along to a Cycle, so give cycleId with it.",
          );
        }
        if (before !== undefined && after !== undefined) {
          throw new TicketsError(
            'Give either before or after: a Ticket lands next to one Ticket.',
          );
        }
        const hasFields = Object.values(fields).some(
          (value) => value !== undefined,
        );
        const hasSteps =
          epicNumber !== undefined ||
          addBlockers.length > 0 ||
          removeBlockers.length > 0 ||
          cycleId !== undefined ||
          before !== undefined ||
          after !== undefined ||
          archived !== undefined;
        // An archived Ticket is read-only, so restore it before the rest.
        if (archived === false) {
          deps.restoreTicket(number);
        }
        // With nothing to change, the fields step bumps the Ticket.
        if (hasFields || !hasSteps) {
          updateFields(number, fields);
        }
        if (epicNumber === null) {
          deps.detachFromEpic(number);
        } else if (epicNumber !== undefined) {
          deps.moveToEpic({ epic: epicNumber, child: number });
        }
        for (const blocker of addBlockers) {
          addBlocker({ blocker, blocked: number });
        }
        for (const blocker of removeBlockers) {
          removeBlocker({ blocker, blocked: number });
        }
        let childrenMoved: number[] | undefined;
        if (cycleId !== undefined) {
          const moved = deps.moveTicketsToCycle({
            cycleId,
            ticketNumbers: [number],
            withChildren,
          });
          if (moved.failed.length > 0) {
            const [{ error, refusal }] = moved.failed;
            throw new TicketsError(error, refusal);
          }
          childrenMoved = moved.children;
        }
        if (before !== undefined) {
          deps.reorderTicket(number, { before });
        } else if (after !== undefined) {
          deps.reorderTicket(number, { after });
        }
        if (archived === true) {
          deps.archiveTicket(number);
        }
        const ticket = getTicket(number);
        return childrenMoved ? { ...ticket, childrenMoved } : ticket;
      });
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
        checkTicketWritable(number);
        touchTicket(number);
        const before = labelsOf(number);
        insertLabels(number, added);
        recordActivity(number, labelChanges(before, { added }));
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
        checkTicketWritable(number);
        touchTicket(number);
        const before = labelsOf(number);
        deleteLabels(number, removed);
        recordActivity(number, labelChanges(before, { removed }));
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
        checkTicketWritable(number);
        touchTicket(number);
        const before = externalReferencesOf(db, number);
        insertExternalReferences(db, number, added);
        checkExternalReferenceCount(db, number);
        recordActivity(number, externalReferenceChanges(before, { added }));
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
        checkTicketWritable(number);
        touchTicket(number);
        const before = externalReferencesOf(db, number);
        deleteExternalReferences(db, number, removed);
        recordActivity(number, externalReferenceChanges(before, { removed }));
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
        checkTicketWritable(number);
        touchTicket(number);
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
        recordActivity(number, activity);
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    addBlocker,

    removeBlocker,

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
        // A Blocker is resolved by the Blocker rule; a Ticket it blocks,
        // when it is Done or archived itself.
        return db
          .select({
            ...relatedTicketColumns,
            resolved: sql`${
              direction === 'blockedBy' ? resolvedBlocker : resolvedTicket
            }`.mapWith(Boolean),
          })
          .from(ticketBlockers)
          .innerJoin(tickets, eq(tickets.number, other))
          .innerJoin(
            blockedTicket,
            eq(blockedTicket.number, ticketBlockers.blockedNumber),
          )
          .where(eq(side, number))
          .orderBy(asc(tickets.number))
          .all();
      };
      return { blockedBy: related('blockedBy'), blocks: related('blocks') };
    },
  };
}
