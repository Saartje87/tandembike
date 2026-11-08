/**
 * The User's first message of a Retro, the one place it is built: the
 * Project's Retro command followed by the Cycle reference (its title and id,
 * so a skill can read its Tickets with `list_tickets` and `cycleId`), or the
 * plain prompt naming the Cycle when the Project has no Retro command.
 */
export const retroPrompt = (
  cycle: { id: number; title: string },
  command: string | null,
): string =>
  command === null
    ? `Retro on Cycle "${cycle.title}"`
    : `${command} "${cycle.title}" (Cycle ${cycle.id})`;
