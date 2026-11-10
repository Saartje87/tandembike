import { cycleReference, type RetroCycle } from './retro-prompt';

/** How a Batch triage names its Board: a Cycle by title and id, or the Backlog. */
export const boardReference = (cycle: RetroCycle | null): string =>
  cycle === null ? 'the Backlog' : `the Cycle ${cycleReference(cycle)}`;

/**
 * The User's first message of a Batch triage (T1317), the one place it is
 * built: the Board and the Ticket numbers recorded when it started.
 */
export const batchTriagePrompt = (
  cycle: RetroCycle | null,
  ticketNumbers: number[],
): string =>
  `Batch triage ${boardReference(cycle)}: ${ticketNumbers
    .map((number) => `T${number}`)
    .join(', ')}.`;
