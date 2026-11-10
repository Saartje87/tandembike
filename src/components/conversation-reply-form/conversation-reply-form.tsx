'use client';

import type { FC, Ref } from 'react';

import { replyToConversation } from '../../app/conversations/actions';
import type { ActionResult } from '../../app/lib/action-result';
import {
  ConversationMessageInput,
  type MessageInputControl,
} from '../conversation-message-input/conversation-message-input';

/** What the chat does to the reply input besides the User typing (T613). */
export type ReplyControl = MessageInputControl;

export type ConversationReplyFormProps = {
  conversationId: number;
  control?: Ref<ReplyControl>;
  /** The text to start with, such as an unsent reply kept across a switch of tab. */
  initialText?: string;
  /** Called as the text changes, and with `''` once it is sent. */
  onTextChange?: (text: string) => void;
  /** Sends the reply in place of `replyToConversation`, such as a Spar's turn. */
  send?: (text: string) => Promise<ActionResult>;
};

/**
 * The reply input fixed at the bottom of the chat, with Send beside it. Enter sends and Shift+Enter starts a new line. A refused
 * reply keeps its text and shows the reason.
 */
export const ConversationReplyForm: FC<ConversationReplyFormProps> = ({
  conversationId,
  control,
  initialText,
  onTextChange,
  send = (text) => replyToConversation({ conversationId, text }),
}) => {
  return (
    <ConversationMessageInput
      label="Reply"
      placeholder="Reply (Enter sends, Shift+Enter adds a line)"
      {...(control ? { control } : {})}
      {...(initialText === undefined ? {} : { initialText })}
      {...(onTextChange ? { onTextChange } : {})}
      onSend={async (text) => {
        const result = await send(text);
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
};
