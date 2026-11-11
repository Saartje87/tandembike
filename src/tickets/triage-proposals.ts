import { and, desc, eq, inArray } from 'drizzle-orm';

import { tickets, triageProposals } from '../db/schema';
import { recordActivity } from './activity';
import { checkTicketWritable } from './archived-projects';
import { NotAllowedError, NotFoundError } from './errors';
import { throwFieldErrors } from './rules';
import type { TicketRowContext } from './ticket-row-context';
import { checkAcceptanceCriteria } from './ticket-rules';
import type {
  AddCommentInput,
  Comment,
  CreateTicketBatchInput,
  Ticket,
  UpdateTicketInput,
} from './tickets';
import { triageStateLabels, wontfix } from './triage-labels';
import {
  type TriageCategory,
  type TriageProposalStatus,
  type TriageSplit,
  type TriageState,
  triageCategories,
  triageDisclaimer,
  triageStates,
} from './triage-proposal-state';

/** What a Triage run recommends for a Ticket. */
export type TriageProposal = {
  id: number;
  ticketNumber: number;
  runId: string | null;
  category: TriageCategory;
  state: TriageState;
  /** Markdown. */
  reasoning: string;
  /** Replace the Ticket's criteria on Approve; null leaves them. */
  acceptanceCriteria: string[] | null;
  duplicateOf: number | null;
  splits: TriageSplit[] | null;
  status: TriageProposalStatus;
  createdAt: Date;
  decidedAt: Date | null;
};

export type ProposeTriageInput = {
  category: TriageCategory;
  state: TriageState;
  reasoning: string;
  acceptanceCriteria?: string[];
  /** The Ticket this one duplicates; refused with `splits`, or for itself. */
  duplicateOf?: number;
  /** Tickets to split this one into; refused with `duplicateOf`, or for an Epic. */
  splits?: TriageSplit[];
  /** The Agent run making the proposal. */
  runId?: string;
};

export type ApproveTriageInput = {
  category?: TriageCategory;
  state?: TriageState;
};

const columns = {
  id: triageProposals.id,
  ticketNumber: triageProposals.ticketNumber,
  runId: triageProposals.runId,
  category: triageProposals.category,
  state: triageProposals.state,
  reasoning: triageProposals.reasoning,
  acceptanceCriteria: triageProposals.acceptanceCriteria,
  duplicateOf: triageProposals.duplicateOf,
  splits: triageProposals.splits,
  status: triageProposals.status,
  createdAt: triageProposals.createdAt,
  decidedAt: triageProposals.decidedAt,
};

/** The Tickets module's functions the triage proposals build on. */
export type TriageDeps = {
  updateTicket: (number: number, input: UpdateTicketInput) => Ticket;
  addComment: (number: number, input: AddCommentInput) => Comment;
  createTicketBatch: (input: CreateTicketBatchInput) => Ticket[];
  archiveTicket: (number: number) => Ticket;
};

const trimSplits = (splits: readonly TriageSplit[]): TriageSplit[] =>
  splits.map((split) => ({
    title: split.title.trim(),
    description: (split.description ?? '').trim(),
    acceptanceCriteria: (split.acceptanceCriteria ?? [])
      .map((text) => text.trim())
      .filter((text) => text !== ''),
  }));

const isOneOf = <T extends string>(list: readonly T[], value: unknown) =>
  list.includes(value as T);

/** The labels to remove and add so that `category` and `state` are the Ticket's. */
function labelChanges(
  current: readonly string[],
  category: TriageCategory,
  state: TriageState,
) {
  const add = [category, state];
  const owned = [...triageCategories, ...triageStateLabels, wontfix];
  return {
    addLabels: add,
    removeLabels: current.filter(
      (label) =>
        owned.includes(label as never) && !add.includes(label as never),
    ),
  };
}

/** Triage proposals (T1243): propose, Approve, Reject and the reads. */
export function createTriageProposals(
  { db, actor, changes, getTicket, transaction }: TicketRowContext,
  deps: TriageDeps,
) {
  function find(id: number): TriageProposal {
    const found = db
      .select(columns)
      .from(triageProposals)
      .where(eq(triageProposals.id, id))
      .get();
    if (!found) {
      throw new NotFoundError(`There is no triage proposal ${id}.`);
    }
    return found;
  }

  /** The pending proposal `id`, on a Todo Ticket, or a refusal. */
  function decidable(id: number): TriageProposal {
    const found = find(id);
    if (found.status !== 'pending') {
      throw new NotAllowedError(
        `This triage proposal is ${found.status}; only a pending one can be decided.`,
      );
    }
    checkTodo(found.ticketNumber);
    return found;
  }

  function checkTodo(number: number) {
    const ticket = getTicket(number);
    checkTicketWritable(db, number);
    if (ticket.status !== 'Todo') {
      throw new NotAllowedError(
        `T${number} is ${ticket.status}; only a Todo Ticket can be triaged.`,
      );
    }
  }

  /** Why `input`'s duplicate is refused, or undefined. */
  function checkDuplicate(number: number, input: ProposeTriageInput) {
    const target = input?.duplicateOf;
    if (target === undefined) {
      return undefined;
    }
    if (input.splits !== undefined) {
      return 'Propose a duplicate or splits, not both.';
    }
    if (target === number) {
      return `T${number} cannot be a duplicate of itself.`;
    }
    try {
      getTicket(target);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return `There is no Ticket T${target} to be a duplicate of.`;
      }
      throw error;
    }
    return undefined;
  }

  /** Why `input`'s splits are refused, or undefined. */
  function checkSplits(number: number, input: ProposeTriageInput) {
    const splits = input?.splits;
    if (splits === undefined) {
      return undefined;
    }
    if (input.duplicateOf !== undefined) {
      return 'Propose a duplicate or splits, not both.';
    }
    if (splits.length === 0) {
      return 'Give at least one split, or leave splits out.';
    }
    if (getTicket(number).type === 'Epic') {
      return `T${number} is an Epic; an Epic cannot be split.`;
    }
    for (const [position, split] of splits.entries()) {
      if (String(split?.title ?? '').trim() === '') {
        return `Split ${position + 1} needs a title.`;
      }
      const problem = checkAcceptanceCriteria(
        (split.acceptanceCriteria ?? []).map((text) => text.trim()),
      );
      if (problem) {
        return `Split ${position + 1}: ${problem}`;
      }
    }
    return undefined;
  }

  return {
    /**
     * Records a pending triage proposal on Todo Ticket `number`, superseding
     * a pending one, and posts the reasoning as a comment starting with the
     * AI disclaimer. It may name a duplicate or propose splits, not both.
     */
    proposeTriage(number: number, input: ProposeTriageInput): TriageProposal {
      const reasoning = String(input?.reasoning ?? '').trim();
      const criteria = input?.acceptanceCriteria?.map((text) => text.trim());
      throwFieldErrors({
        category: isOneOf(triageCategories, input?.category)
          ? undefined
          : 'Choose a category: bug or enhancement.',
        state: isOneOf(triageStates, input?.state)
          ? undefined
          : `Choose a state: ${triageStates.join(', ')}.`,
        reasoning: reasoning === '' ? 'Enter the reasoning.' : undefined,
        acceptanceCriteria: criteria && checkAcceptanceCriteria(criteria),
        duplicateOf: checkDuplicate(number, input),
        splits: checkSplits(number, input),
      });
      const made = transaction(() => {
        checkTodo(number);
        db.update(triageProposals)
          .set({ status: 'superseded', decidedAt: new Date() })
          .where(
            and(
              eq(triageProposals.ticketNumber, number),
              eq(triageProposals.status, 'pending'),
            ),
          )
          .run();
        const row = db
          .insert(triageProposals)
          .values({
            ticketNumber: number,
            runId: input.runId ?? null,
            category: input.category,
            state: input.state,
            reasoning,
            acceptanceCriteria:
              criteria && criteria.length > 0 ? criteria : null,
            duplicateOf: input.duplicateOf ?? null,
            splits: input.splits ? trimSplits(input.splits) : null,
            createdAt: new Date(),
          })
          .returning(columns)
          .get();
        deps.addComment(number, {
          body: `${triageDisclaimer}\n\n${reasoning}`,
          author: 'agent',
        });
        recordActivity(db, number, actor, [
          {
            type: 'triageProposed',
            category: input.category,
            state: input.state,
          },
        ]);
        return row;
      });
      changes.publish({ type: 'ticket', number });
      return made;
    },

    /**
     * Applies pending proposal `id` all or nothing: the category and state
     * (overridable) as labels, the old state label swapped out, and the
     * proposed criteria replacing the Ticket's when it has some. A duplicate
     * comments "Duplicate of T#", sets `wontfix` and archives the Ticket;
     * splits are filed with the Ticket as Origin, in its Cycle, with the
     * approved category and state, then "Split into T…" is commented and the
     * Ticket archived.
     */
    approveTriage(id: number, input: ApproveTriageInput = {}): TriageProposal {
      throwFieldErrors({
        category:
          input?.category === undefined ||
          isOneOf(triageCategories, input.category)
            ? undefined
            : 'Choose a category: bug or enhancement.',
        state:
          input?.state === undefined || isOneOf(triageStates, input.state)
            ? undefined
            : `Choose a state: ${triageStates.join(', ')}.`,
      });
      const { approved, ticketNumber } = transaction(() => {
        const found = decidable(id);
        const category = input.category ?? found.category;
        const state = input.state ?? found.state;
        const ticket = getTicket(found.ticketNumber);
        const isDuplicate = found.duplicateOf !== null;
        deps.updateTicket(found.ticketNumber, {
          ...labelChanges(
            ticket.labels,
            category,
            isDuplicate ? wontfix : state,
          ),
          ...(found.acceptanceCriteria && !isDuplicate && !found.splits
            ? {
                acceptanceCriteria: found.acceptanceCriteria.map((text) => ({
                  text,
                })),
              }
            : {}),
        });
        if (found.duplicateOf !== null) {
          deps.addComment(found.ticketNumber, {
            body: `Duplicate of T${found.duplicateOf}`,
            author: 'user',
          });
          deps.archiveTicket(found.ticketNumber);
        } else if (found.splits) {
          const filed = deps.createTicketBatch({
            projectId: ticket.projectId,
            originNumber: found.ticketNumber,
            ...(ticket.cycle ? { cycleId: ticket.cycle.id } : {}),
            tickets: found.splits.map((split) => ({
              title: split.title,
              description: split.description,
              labels: [category, state],
              acceptanceCriteria: split.acceptanceCriteria.map((text) => ({
                text,
              })),
            })),
          });
          deps.addComment(found.ticketNumber, {
            body: `Split into ${filed.map(({ number }) => `T${number}`).join(', ')}`,
            author: 'user',
          });
          deps.archiveTicket(found.ticketNumber);
        }
        db.update(triageProposals)
          .set({ status: 'approved', decidedAt: new Date() })
          .where(eq(triageProposals.id, id))
          .run();
        recordActivity(db, found.ticketNumber, actor, [
          { type: 'triageApproved', category, state },
        ]);
        return { approved: find(id), ticketNumber: found.ticketNumber };
      });
      changes.publish({ type: 'ticket', number: ticketNumber });
      return approved;
    },

    /** Rejects pending proposal `id`, commenting `reason` when given. */
    rejectTriage(id: number, reason?: string): TriageProposal {
      const rejected = transaction(() => {
        const found = decidable(id);
        db.update(triageProposals)
          .set({ status: 'rejected', decidedAt: new Date() })
          .where(eq(triageProposals.id, id))
          .run();
        const body = reason?.trim();
        if (body) {
          deps.addComment(found.ticketNumber, { body, author: 'user' });
        }
        recordActivity(db, found.ticketNumber, actor, [
          { type: 'triageRejected' },
        ]);
        return find(id);
      });
      changes.publish({ type: 'ticket', number: rejected.ticketNumber });
      return rejected;
    },

    getTriageProposal: find,

    /** Ticket `number`'s pending triage proposal, or null. */
    pendingTriage(number: number): TriageProposal | null {
      return (
        db
          .select(columns)
          .from(triageProposals)
          .where(
            and(
              eq(triageProposals.ticketNumber, number),
              eq(triageProposals.status, 'pending'),
            ),
          )
          .get() ?? null
      );
    },

    /** Ticket `number`'s latest triage proposal of any status, or null. */
    latestTriage(number: number): TriageProposal | null {
      return (
        db
          .select(columns)
          .from(triageProposals)
          .where(eq(triageProposals.ticketNumber, number))
          .orderBy(desc(triageProposals.id))
          .get() ?? null
      );
    },

    /** The numbers of Project `projectId`'s Tickets with a pending proposal. */
    pendingTriageNumbers(projectId: number): number[] {
      return db
        .select({ number: triageProposals.ticketNumber })
        .from(triageProposals)
        .innerJoin(tickets, eq(tickets.number, triageProposals.ticketNumber))
        .where(
          and(
            eq(tickets.projectId, projectId),
            inArray(triageProposals.status, ['pending']),
          ),
        )
        .all()
        .map(({ number }) => number);
    },
  };
}
