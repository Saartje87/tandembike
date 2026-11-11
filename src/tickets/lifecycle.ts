import { and, asc, eq, inArray } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import {
  ticketAcceptanceCriteria,
  ticketBlockers,
  ticketComments,
  ticketLabels,
  tickets,
  triageProposals,
} from '../db/schema';
import { type AutoMerge, autoMergesSince, deleteActivity } from './activity';
import { deleteAttachments } from './attachments';
import { leaveAllCycles } from './cycles';
import { checkChildrenArchived, checkEpicNotArchived } from './epics';
import {
  NotFoundError,
  UncheckedCriteriaError,
  type UncheckedCriterion,
} from './errors';
import { isPullRequestReference } from './external-reference-display';
import { deleteExternalReferences } from './external-references';
import {
  checkBatchNumbers,
  maxOverrideLength,
  throwFieldErrors,
} from './rules';
import type { TicketRowContext } from './ticket-row-context';
import { checkTicketChanges } from './ticket-rules';
import type {
  ArchiveTicketOptions,
  CompleteTicketOptions,
  DeleteTicketOptions,
  Ticket,
} from './tickets';
import { triageStateLabels } from './triage-labels';

/** An override reason trimmed, or a `ValidationError` if blank or too long. */
function checkedOverride(rawOverride: string): string {
  const override = rawOverride.trim();
  throwFieldErrors({
    override:
      override === ''
        ? 'Give a reason for finishing with unchecked acceptance criteria.'
        : override.length > maxOverrideLength
          ? `Keep the override reason to ${maxOverrideLength.toLocaleString('en-US')} characters or fewer.`
          : undefined,
  });
  return override;
}

/** The comment an override posts: the reason and the criteria it skipped. */
function overrideComment(
  override: string,
  unchecked: UncheckedCriterion[],
): string {
  return [
    'Finished with unchecked acceptance criteria:',
    '',
    ...unchecked.map(({ number, text }) => `- T${number}: ${text}`),
    '',
    `Reason: ${override}`,
  ].join('\n');
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
  db.delete(triageProposals)
    .where(eq(triageProposals.ticketNumber, number))
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
 * The lifecycle area of the Tickets module: Back to Todo, completing by
 * the completion rule, the auto-merges it records, archiving, restoring
 * and deleting, with the Epic-children sequence they share.
 */
export function createLifecycle(ctx: TicketRowContext) {
  const {
    db,
    actor,
    changes,
    getTicket,
    publishWith,
    applyTicketChanges,
    recordActivity,
    touchTicket,
    syncEpicStatus,
    checkTicketWritable,
    checkTicketProjectWritable,
  } = ctx;

  /**
   * The Epic sequence Merged and Back to Todo share: the Epic's Claim is
   * released first, recorded on the Epic with `epicChange` (no change by
   * default), before the children's changes would clear it silently; then
   * `change` is applied to each of `selected`, all in one transaction. The
   * Epic and the changed children are announced once. `before` runs first in
   * the same transaction.
   */
  function changeEpicChildren(
    epic: number,
    selected: { number: number }[],
    change: ReturnType<typeof checkTicketChanges>,
    epicChange = checkTicketChanges({}),
    before: () => void = () => {},
  ): Ticket {
    db.transaction(() => {
      before();
      applyTicketChanges(epic, epicChange, { releaseClaim: true });
      for (const child of selected) {
        applyTicketChanges(child.number, change);
      }
    });
    changes.publish({
      type: 'tickets',
      numbers: [epic, ...selected.map((child) => child.number)],
    });
    return getTicket(epic);
  }

  /**
   * The PR an Agent completing Ticket `number` now merged by Auto-merge
   * (ADR 0043): its latest PR reference, when the actor is an Agent and its
   * Claim was taken with `auto`; otherwise `null`. Approve merge finishes a
   * handed-off Ticket, which has no Claim, and Merged is the User's.
   */
  function autoMergedPullRequest(number: number): string | null {
    if (actor !== 'agent') {
      return null;
    }
    const row = db
      .select({
        claimAgentRunId: tickets.claimAgentRunId,
        claimMerge: tickets.claimMerge,
      })
      .from(tickets)
      .where(eq(tickets.number, number))
      .get();
    if (row?.claimAgentRunId == null || row.claimMerge !== 'auto') {
      return null;
    }
    return (
      getTicket(number).externalReferences.findLast(isPullRequestReference) ??
      null
    );
  }

  /**
   * Ticket `number`'s unchecked criteria and its unarchived children's. A
   * Ticket already Done is past the rule, so finishing it again is a no-op
   * check, as `finish_work` is idempotent.
   */
  function uncheckedCriteriaOf(number: number): UncheckedCriterion[] {
    const { acceptanceCriteria, children, status } = getTicket(number);
    const own =
      status === 'Done'
        ? []
        : acceptanceCriteria
            .filter(({ checked }) => !checked)
            .map(({ text }) => ({ number, text }));
    return [
      ...own,
      ...children
        .filter((child) => !child.archived && child.status !== 'Done')
        .flatMap((child) =>
          getTicket(child.number)
            .acceptanceCriteria.filter(({ checked }) => !checked)
            .map(({ text }) => ({ number: child.number, text })),
        ),
    ];
  }

  /** Adds a comment by the module's actor; run it in a transaction. */
  function insertComment(number: number, body: string) {
    db.insert(ticketComments)
      .values({
        ticketNumber: number,
        author: actor,
        body,
        createdAt: new Date(),
      })
      .run();
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
    checkTicketProjectWritable(number);
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
      recordActivity(number, [{ type: archived ? 'archived' : 'restored' }]);
    }
    return syncEpicStatus(ticket.epicNumber) ? ticket.epicNumber : null;
  }

  return {
    /**
     * Back to Todo, the User's action on a parked Ticket (ADR 0024): Status
     * becomes Todo at the end of the Todo order and any Claim is released,
     * with its labels kept, as one Activity entry. An archived Ticket or one
     * in an archived Project is refused. It checks nothing outside the module,
     * such as GitHub or Conversations. For an Epic, its Claim is released
     * first and every unarchived In progress child becomes Todo the same way,
     * all or nothing; Done and archived children stay, and the Epic's Status
     * follows. The Epic and its changed children are announced once.
     */
    backToTodo(number: number): Ticket {
      const todo = checkTicketChanges({ status: 'Todo' });
      const { type, children } = getTicket(number);
      checkTicketWritable(number);
      if (type === 'Epic') {
        return changeEpicChildren(
          number,
          children.filter(
            (child) => !child.archived && child.status === 'In progress',
          ),
          todo,
        );
      }

      const { changedEpic } = applyTicketChanges(number, todo, {
        releaseClaim: true,
      });
      publishWith(number, changedEpic);
      return getTicket(number);
    },

    /**
     * The completion rule (docs/agents/issue-tracker.md), the one place that
     * applies it: Ticket `number` becomes Done, loses its triage state label
     * (never `wontfix` or a category label), and its Claim is released, with
     * one Activity entry. For an Epic, every unarchived child is completed
     * the same way, all or nothing, and the Epic loses its own state label;
     * its Status follows its children.
     */
    completeTicket(
      number: number,
      options: CompleteTicketOptions = {},
    ): Ticket {
      const override =
        options.override === undefined
          ? undefined
          : checkedOverride(options.override);
      const stateLabels = { removeLabels: [...triageStateLabels] };
      const done = checkTicketChanges({ status: 'Done', ...stateLabels });
      const { type, children } = getTicket(number);
      checkTicketWritable(number);
      const unchecked = uncheckedCriteriaOf(number);
      if (unchecked.length > 0 && override === undefined) {
        throw new UncheckedCriteriaError(unchecked);
      }
      const pullRequest = autoMergedPullRequest(number);
      const recordOverride = () => {
        if (unchecked.length > 0 && override !== undefined) {
          insertComment(number, overrideComment(override, unchecked));
        }
        if (pullRequest !== null) {
          recordActivity(number, [{ type: 'autoMerged', pullRequest }]);
        }
      };

      if (type === 'Epic') {
        return changeEpicChildren(
          number,
          children.filter((child) => !child.archived),
          done,
          checkTicketChanges(stateLabels),
          recordOverride,
        );
      }
      const { changedEpic } = db.transaction(() => {
        recordOverride();
        return applyTicketChanges(number, done);
      });
      publishWith(number, changedEpic);
      return getTicket(number);
    },

    /**
     * The auto-merges recorded at or after `since`, oldest first, for the
     * Notices module's `auto_merged` kind (ADR 0043).
     */
    autoMergesSince(since: Date): AutoMerge[] {
      return autoMergesSince(db, since);
    },

    /**
     * The acceptance criteria the completion rule would refuse Ticket
     * `number` for: its own unchecked ones and, for an Epic, those of every
     * unarchived child, each with its Ticket. Empty when it may complete.
     */
    uncheckedCriteria(number: number): UncheckedCriterion[] {
      getTicket(number);
      return uncheckedCriteriaOf(number);
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
          checkTicketProjectWritable(number);
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
            touchTicket(blocked);
          }
          for (const { origin } of removals) {
            if (origin != null && !deleted.includes(origin)) {
              touchTicket(origin);
            }
          }
          if (epic !== null) {
            touchTicket(epic.number);
            syncEpicStatus(epic.number);
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
}
