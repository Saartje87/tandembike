import {
  type ConversationActivity,
  type LiveConversation,
  noConversationActivity,
} from '../conversations/conversation-activity';

/** A Conversation activity with nothing going on, but for `overrides`. */
export const activity = (
  overrides: Partial<ConversationActivity> = {},
): ConversationActivity => ({ ...noConversationActivity, ...overrides });

/** A live Conversation, running unless `overrides` says otherwise. */
export const liveConversation = (
  overrides: Partial<LiveConversation> = {},
): LiveConversation => ({
  conversationId: 1,
  state: 'running',
  line: 'Reading board.tsx',
  since: '2026-11-07T10:00:00.000Z',
  cost: 0,
  terminal: false,
  ...overrides,
});
