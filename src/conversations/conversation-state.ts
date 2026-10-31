/** Why a Conversation was started (GLOSSARY: Start, Triage, Ask). */
export const conversationIntents = ['start', 'triage', 'ask'] as const;
export type ConversationIntent = (typeof conversationIntents)[number];

/**
 * Where a Conversation is:
 * - `running`: the Agent is working on a turn.
 * - `waiting`: the Agent waits for the User, such as for an Allow or Deny.
 * - `idle`: the Agent finished its turn and listens for a reply.
 * - `interrupted`: its run died, such as when the server restarted; a reply
 *   resumes it from its SDK session ID.
 * - `stopped`: the User stopped it; it takes no more replies.
 */
export const conversationStates = [
  'running',
  'waiting',
  'idle',
  'interrupted',
  'stopped',
] as const;
export type ConversationState = (typeof conversationStates)[number];

/** Who wrote a transcript entry. */
export const transcriptRoles = [
  'user',
  'agent',
  'tool',
  'error',
  'permission',
] as const;
export type TranscriptRole = (typeof transcriptRoles)[number];

/**
 * Where a permission request in the transcript is: `pending` waits for the
 * User's Allow or Deny; `expired` was never answered because its run ended.
 */
export const permissionStatuses = [
  'pending',
  'allowed',
  'denied',
  'expired',
] as const;
export type PermissionStatus = (typeof permissionStatuses)[number];
