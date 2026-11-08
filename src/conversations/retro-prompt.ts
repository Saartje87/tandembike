/**
 * The User's first message of a Retro: the plain prompt naming the Cycle. The
 * one place the Retro prompt is built.
 */
export const retroPrompt = (cycle: { title: string }): string =>
  `Retro on Cycle "${cycle.title}"`;
