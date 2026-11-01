import type { Conversation } from '../../conversations/conversations';

/**
 * The Project's latest Setup: the newest Setup Conversation of the Project
 * among the one the page loaded and the ones the dialog holds, which may be
 * newer. The highest id wins.
 */
export const latestSetup = (
  projectId: number,
  loaded: Conversation | null,
  held: Conversation[],
): Conversation | null =>
  [loaded, ...held].reduce<Conversation | null>(
    (best, conversation) =>
      conversation !== null &&
      conversation.intent === 'setup' &&
      conversation.projectId === projectId &&
      (best === null || conversation.id >= best.id)
        ? conversation
        : best,
    null,
  );
