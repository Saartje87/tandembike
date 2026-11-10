'use client';

import { Alert } from '@blockle/blocks';
import { type FC, type ReactNode, useRef } from 'react';

import type { ActionResult } from '../../app/lib/action-result';
import { waitsOnUser } from '../../conversations/conversation-activity';
import { isTerminal } from '../../conversations/conversation-state';
import type { TranscriptEntry } from '../../conversations/conversations';
import {
  type ReplyQuestion,
  replyQuestions,
} from '../../conversations/reply-options';
import { ConversationChatHeader } from '../conversation-chat-header/conversation-chat-header';
import { useKeptConversation } from '../conversation-dialog-provider/kept-conversations';
import type { ConversationWithTranscript } from '../conversation-labels/conversation-labels';
import { ConversationMessages } from '../conversation-messages/conversation-messages';
import {
  ConversationReplyForm,
  type ReplyControl,
} from '../conversation-reply-form/conversation-reply-form';
import { ConversationReplyOptions } from '../conversation-reply-options/conversation-reply-options';
import { ConversationTerminalNotice } from '../conversation-terminal-notice/conversation-terminal-notice';
import * as styles from './conversation-chat.css';

export type ConversationChatProps = {
  item: ConversationWithTranscript;
  /** What the Conversation is about: its Ticket, or its Project. */
  title: string;
  /** Why the latest reload failed, shown above the transcript it keeps (T1100). */
  error?: string | undefined;
  /** Sends a reply in place of `replyToConversation`, such as a Spar's turn. */
  onReply?: (text: string) => Promise<ActionResult>;
  /** Shown just above the reply input, such as a Spar's button bar. */
  beforeReply?: ReactNode;
  /**
   * Why it takes no replies, such as a closed Spar's: shown in place of the
   * reply input and its notices.
   */
  closedReason?: string;
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
 * those out; each part is its own component. In the dialog, the unsent reply
 * is kept while another tab is shown (T1100).
 */
export const ConversationChat: FC<ConversationChatProps> = ({
  item: { conversation, transcript },
  title,
  error,
  onReply,
  beforeReply,
  closedReason,
}) => {
  const reply = useRef<ReplyControl>(null);
  const kept = useKeptConversation();
  const terminal = isTerminal(conversation);
  const questions = optionsToAnswer(
    waitsOnUser(conversation.state),
    transcript,
  );

  return (
    <div className={styles.chat}>
      <ConversationChatHeader conversation={conversation} title={title} />
      {error && <Alert intent="danger">{error}</Alert>}
      <ConversationMessages transcript={transcript} />
      {closedReason !== undefined ? (
        <Alert intent="info">{closedReason}</Alert>
      ) : (
        <>
          {!terminal && conversation.state === 'interrupted' && (
            <Alert intent="warning">
              This Conversation was interrupted. Reply to resume it.
            </Alert>
          )}
          {!terminal && conversation.state === 'stopped' && (
            <Alert intent="info">
              This Conversation was stopped. Reply to resume it.
            </Alert>
          )}
          {!terminal && questions && (
            <ConversationReplyOptions
              questions={questions}
              onChoose={({ label }, { key }) =>
                label === null
                  ? reply.current?.sendWith(key)
                  : reply.current?.addLine(`${label}:`, `${label}: ${key}`)
              }
            />
          )}
          {!terminal && beforeReply}
          {terminal ? (
            <ConversationTerminalNotice conversation={conversation} />
          ) : (
            <ConversationReplyForm
              {...(onReply ? { send: onReply } : {})}
              key={conversation.id}
              conversationId={conversation.id}
              projectId={conversation.projectId}
              control={reply}
              {...(kept
                ? {
                    initialText: kept.reply,
                    onTextChange: (text: string) => {
                      kept.reply = text;
                    },
                  }
                : {})}
            />
          )}
        </>
      )}
    </div>
  );
};
