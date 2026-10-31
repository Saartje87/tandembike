'use client';

import { Alert } from '@blockle/blocks';
import type { FC } from 'react';

import { ConversationChatHeader } from '../conversation-chat-header/conversation-chat-header';
import type { ConversationWithTranscript } from '../conversation-labels/conversation-labels';
import { ConversationMessages } from '../conversation-messages/conversation-messages';
import { ConversationReplyForm } from '../conversation-reply-form/conversation-reply-form';
import * as styles from './conversation-chat.css';

export type ConversationChatProps = {
  item: ConversationWithTranscript;
  /** What the Conversation is about: its Ticket, or its Project. */
  title: string;
};

/**
 * One Conversation with an Agent (ADR 0019) as a chat window, in the
 * Conversation dialog: a header, the messages, which the dialog refreshes
 * while the run works, and a reply input fixed at the bottom. It only lays
 * those out; each part is its own component.
 */
export const ConversationChat: FC<ConversationChatProps> = ({
  item: { conversation, transcript },
  title,
}) => (
  <div className={styles.chat}>
    <ConversationChatHeader conversation={conversation} title={title} />
    <ConversationMessages transcript={transcript} />
    {conversation.state === 'interrupted' && (
      <Alert intent="warning">
        This Conversation was interrupted. Reply to resume it.
      </Alert>
    )}
    {conversation.state === 'stopped' && (
      <Alert intent="info">
        This Conversation was stopped. Reply to resume it.
      </Alert>
    )}
    <ConversationReplyForm
      key={conversation.id}
      conversationId={conversation.id}
    />
  </div>
);
