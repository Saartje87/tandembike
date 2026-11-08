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
 * Project's Retro command followed by the Cycle reference, or the plain
 * prompt naming the Cycle when the Project has no Retro command.
 */
export const retroPrompt = (
  cycle: RetroCycle,
  command: string | null,
): string =>
  command === null
    ? `Retro on Cycle "${cycle.title}"`
    : `${command} ${cycleReference(cycle)}`;
