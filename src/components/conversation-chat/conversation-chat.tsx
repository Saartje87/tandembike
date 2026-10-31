'use client';

import { Alert } from '@blockle/blocks';
import { type FC, useRef } from 'react';

import { needsYou } from '../../conversations/conversation-activity';
import type { TranscriptEntry } from '../../conversations/conversations';
import {
  type ReplyQuestion,
  replyQuestions,
} from '../../conversations/reply-options';
import { ConversationChatHeader } from '../conversation-chat-header/conversation-chat-header';
import type { ConversationWithTranscript } from '../conversation-labels/conversation-labels';
import { ConversationMessages } from '../conversation-messages/conversation-messages';
import {
  ConversationReplyForm,
  type ReplyControl,
} from '../conversation-reply-form/conversation-reply-form';
import { ConversationReplyOptions } from '../conversation-reply-options/conversation-reply-options';
import * as styles from './conversation-chat.css';

export type ConversationChatProps = {
  item: ConversationWithTranscript;
  /** What the Conversation is about: its Ticket, or its Project. */
  title: string;
};

/** The options of the Agent's latest message, while it waits for the User. */
const optionsToAnswer = (
  waiting: boolean,
  transcript: TranscriptEntry[],
): ReplyQuestion[] | null => {
  const latest = transcript.at(-1);
  return waiting && latest?.role === 'agent'
    ? replyQuestions(latest.text)
    : null;
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
}) => {
  const reply = useRef<ReplyControl>(null);
  const questions = optionsToAnswer(needsYou(conversation.state), transcript);

  return (
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
      {questions && (
        <ConversationReplyOptions
          questions={questions}
          onChoose={({ label }, { key }) =>
            label === null
              ? reply.current?.sendWith(key)
              : reply.current?.addLine(`${label}:`, `${label}: ${key}`)
          }
        />
      )}
      <ConversationReplyForm
        key={conversation.id}
        conversationId={conversation.id}
        control={reply}
      />
    </div>
  );
};
