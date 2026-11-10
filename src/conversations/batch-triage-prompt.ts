import { cycleReference, type RetroCycle } from './retro-prompt';

/** How a Batch triage names its Board: a Cycle by title and id, or the Backlog. */
export const boardReference = (cycle: RetroCycle | null): string =>
  cycle === null ? 'the Backlog' : `the Cycle ${cycleReference(cycle)}`;

/**
 * The User's first message of a Batch triage (T1317), the one place it is
 * built: the Board, the Ticket numbers recorded when it started, oldest
 * first, and how to triage them (ADR 0047).
 */
export const batchTriagePrompt = (
  cycle: RetroCycle | null,
  ticketNumbers: number[],
): string =>
  [
    `Batch triage ${boardReference(cycle)}: ${ticketNumbers
      .map((number) => `T${number}`)
      .join(', ')}.`,
    '',
    'Triage each of these Tickets in turn, in this order, as a Triage run would, and end each in a triage proposal:',
    '',
    '- Re-read the Ticket with get_ticket just before you propose. Skip one that is no longer Triage-eligible (not Todo, archived, labelled with a state other than needs-triage, or already proposed on since its latest change) and say which you skipped.',
    '- Propose with propose_triage. Read the other listed Tickets too: propose duplicateOf for a duplicate, including of another listed Ticket, and splits for a Ticket that is several pieces of work.',
    '- Never apply labels or change a Ticket yourself: update_ticket and file_tickets are not allowed in this Conversation. The User approves each proposal. Use add_note for anything else worth recording.',
    '',
    'End with a short summary: what you proposed for each Ticket, and which you skipped and why.',
  ].join('\n');
