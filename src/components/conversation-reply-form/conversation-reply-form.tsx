'use client';

import type { FC, Ref } from 'react';

import { replyToConversation } from '../../app/conversations/actions';
import {
  ConversationMessageInput,
  type MessageInputControl,
} from '../conversation-message-input/conversation-message-input';

/** What the chat does to the reply input besides the User typing (T613). */
export type ReplyControl = MessageInputControl;

export type ConversationReplyFormProps = {
  conversationId: number;
  control?: Ref<ReplyControl>;
};

/**
 * The reply input fixed at the bottom of the chat. Enter sends and
 * Shift+Enter starts a new line. A refused reply keeps its text and shows the
 * reason.
 */
export const ConversationReplyForm: FC<ConversationReplyFormProps> = ({
  conversationId,
  control,
}) => (
  <ConversationMessageInput
    label="Reply"
    placeholder="Reply (Enter sends, Shift+Enter adds a line)"
    rows={2}
    {...(control ? { control } : {})}
    onSend={async (text) => {
      const result = await replyToConversation({ conversationId, text });
      return result.ok
        ? { ok: true }
        : {
            ok: false,
            error: result.error,
            textError: result.fieldErrors?.text,
          };
    }}
  />
);
