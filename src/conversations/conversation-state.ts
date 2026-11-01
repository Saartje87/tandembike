/** Why a Conversation was started (GLOSSARY: Start, Triage, Ask, New Ticket, Setup). */
export const conversationIntents = [
  'start',
  'triage',
  'ask',
  'new_ticket',
  'setup',
] as const;
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
  'question',
  /** Tickets the Agent created, as "Created T1, T2". */
  'created',
] as const;
export type TranscriptRole = (typeof transcriptRoles)[number];

/**
 * Where a permission request in the transcript is: `pending` waits for the
 * User's answer; `always-allowed` was allowed together with saving its rules;
 * `expired` was never answered because its run ended.
 */
export const permissionStatuses = [
  'pending',
  'allowed',
  'always-allowed',
  'denied',
  'expired',
] as const;
export type PermissionStatus = (typeof permissionStatuses)[number];

/**
 * The User's answers to a permission request, and the status each leaves it
 * in. The one source of the `PermissionAnswer` type and its runtime list.
 */
export const permissionStatusOf = {
  allow: 'allowed',
  'allow-always': 'always-allowed',
  deny: 'denied',
} as const satisfies Record<string, PermissionStatus>;
export type PermissionAnswer = keyof typeof permissionStatusOf;
export const permissionAnswers = Object.keys(
  permissionStatusOf,
) as PermissionAnswer[];

/**
 * A question of the Agent in the transcript (AskUserQuestion): what it asked,
 * and once answered the User's answers by question text. `expired` was never
 * answered because its run ended.
 */
export type QuestionEntry = {
  questions: {
    question: string;
    header: string;
    options: { label: string; description: string }[];
    multiSelect: boolean;
  }[];
  answers: Record<string, string> | null;
  expired: boolean;
};
