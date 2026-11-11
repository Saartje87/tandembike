import { and, eq, isNull } from 'drizzle-orm';

import { projects, tickets } from '../db/schema';
import { claimOwner } from './claim-owner';
import { checkEpicClaimable } from './epics';
import { NotAllowedError, NotFoundError } from './errors';
import { type MergeMode, mergeModeOf } from './merge-mode';
import { throwFieldErrors } from './rules';
import { claimChanges, type TicketRowContext } from './ticket-row-context';
import type { ClaimTicketInput, Ticket } from './tickets';

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

/**
 * The Claims area of the Tickets module: claiming a Ticket for an Agent
 * run, releasing and clearing the Claim, and the merge mode it was taken
 * with (ADR 0043).
 */
export function createClaims(ctx: TicketRowContext) {
  const {
    db,
    changes,
    getTicket,
    recordActivity,
    checkTicketWritable,
    checkTicketProjectWritable,
  } = ctx;

  /** The merge mode Ticket `number`'s Project gives a Claim taken now. */
  function projectMergeMode(number: number): MergeMode {
    const row = db
      .select({ autoMerge: projects.autoMerge })
      .from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(eq(tickets.number, number))
      .get();
    return mergeModeOf(row?.autoMerge ?? false);
  }

  return {
    /**
     * Claims Ticket `number` for one Agent run. Repeating a claim by that
     * run is idempotent; another run cannot replace the existing claim.
     */
    claimTicket(number: number, input: ClaimTicketInput): Ticket {
      const agentRunId = checkedAgentRunId(input.agentRunId);
      const agentName = input.agentName?.trim() || null;

      const changed = db.transaction(() => {
        checkTicketWritable(number);
        checkEpicClaimable(db, number, agentRunId);
        const claimed = db
          .update(tickets)
          .set({
            claimAgentRunId: agentRunId,
            claimAgentName: agentName,
            // The mode is fixed when the Claim is taken (ADR 0043).
            claimMerge: projectMergeMode(number),
            updatedAt: new Date(),
          })
          .where(
            and(eq(tickets.number, number), isNull(tickets.claimAgentRunId)),
          )
          .returning({ number: tickets.number })
          .get();
        if (claimed) {
          recordActivity(
            number,
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
        // An archived Ticket still lets its Claim go (T1312).
        checkTicketProjectWritable(number);
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
            recordActivity(number, claimChanges('claimReleased', claim));
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
      // An archived Ticket still lets its Claim go (T1312).
      checkTicketProjectWritable(number);
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
        recordActivity(number, claimChanges('claimCleared', claim));
        return true;
      });
      if (cleared) {
        changes.publish({ type: 'ticket', number });
      }
      return getTicket(number);
    },

    /**
     * The merge mode Ticket `number`'s Claim was taken with (ADR 0043), or
     * `null` while it has no Claim. A child under an Epic Claim has none of
     * its own: read the Epic's.
     */
    claimMergeMode(number: number): MergeMode | null {
      getTicket(number);
      const row = db
        .select({
          claimAgentRunId: tickets.claimAgentRunId,
          claimMerge: tickets.claimMerge,
        })
        .from(tickets)
        .where(eq(tickets.number, number))
        .get();
      return row?.claimAgentRunId == null
        ? null
        : (row.claimMerge ?? 'approve');
    },
  };
}
