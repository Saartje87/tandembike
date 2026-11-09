/**
 * What a Notice is about (GLOSSARY: Notice). A kind is added here and as a
 * detector in `notice-kinds.ts`; nothing else changes.
 */
export const noticeKinds = ['waiting', 'needs_reply'] as const;
export type NoticeKind = (typeof noticeKinds)[number];

/**
 * Something the User should look at while they are away: raised once when
 * its `key` first appears in the machine-wide set, never again while the same
 * key persists.
 */
export type Notice = {
  kind: NoticeKind;
  /** Identifies this occurrence, such as the Conversation and its pending entry. */
  key: string;
  projectId: number;
  ticketNumber: number | null;
  conversationId: number | null;
  title: string;
  body: string;
  /** Where clicking the Notice goes. */
  path: string;
};
