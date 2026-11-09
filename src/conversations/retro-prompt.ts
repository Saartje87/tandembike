import type { Cycle } from '../tickets/cycles';

/** The part of a Cycle a Retro names: enough to point an Agent at it. */
export type RetroCycle = Pick<Cycle, 'id' | 'title'>;

/**
 * How a Retro names its Cycle, by title and id, so a skill can read its
 * Tickets with `find_tickets` and `cycleId`.
 */
export const cycleReference = (cycle: RetroCycle): string =>
  `"${cycle.title}" (Cycle ${cycle.id})`;

/**
 * The User's first message of a Retro, the one place it is built: the
 * command of the Retro Stage (the Project's, or the Playbook's) followed by
 * the Cycle reference.
 */
export const retroPrompt = (cycle: RetroCycle, command: string): string =>
  `${command} ${cycleReference(cycle)}`;
