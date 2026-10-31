'use client';

import { Heading } from '@blockle/blocks';
import type { FC } from 'react';

import { startConversation } from '../../app/conversations/actions';
import type { Conversation } from '../../conversations/conversations';
import type { NewTicketDefaults } from '../../conversations/run-brief';
import { ConversationMessageInput } from '../conversation-message-input/conversation-message-input';
import * as styles from './conversation-draft.css';

/**
 * A Conversation the User has not started yet (T611). It lives only in the
 * browser, never in the URL; Send starts the real Conversation.
 */
export type Draft = {
  /** Identifies the draft in the browser only. */
  key: string;
  intent: 'ask' | 'new_ticket';
  /** Ask: the Ticket asked about. */
  ticketNumber?: number;
  /** New Ticket: the Project. */
  projectId?: number;
  /** What the User has typed. */
  text: string;
  /** New Ticket: where the title field was; the Agent's defaults. */
  defaults?: NewTicketDefaults;
};

/** What an entry point gives to open a draft. */
export type DraftInput = Omit<Draft, 'key' | 'text'> & { text?: string };

/** `Draft · New Ticket`, or `Draft · Ask T42`. */
export const draftLabel = (draft: Draft) =>
  draft.intent === 'ask'
    ? `Draft · Ask T${draft.ticketNumber}`
    : 'Draft · New Ticket';

export type ConversationDraftProps = {
  draft: Draft;
  /** Called as the User types, so the text survives switching tabs. */
  onTextChange: (text: string) => void;
  /** Called with the Conversation Send started. */
  onStarted: (conversation: Conversation) => void;
};

/**
 * The shown tab of a draft: an input and Send. Nothing starts until Send;
 * a refusal, such as the Start run limit, keeps the text and shows the reason.
 */
export const ConversationDraft: FC<ConversationDraftProps> = ({
  draft,
  onTextChange,
  onStarted,
}) => (
  <div className={styles.draft}>
    <Heading level={3} fontSize="medium">
      {draftLabel(draft)}
    </Heading>
    <ConversationMessageInput
      className={styles.form}
      initialText={draft.text}
      onTextChange={onTextChange}
      label={draft.intent === 'ask' ? 'Question' : 'Message'}
      placeholder={
        draft.intent === 'ask'
          ? 'Ask a question (Enter sends, Shift+Enter adds a line)'
          : 'Describe the Ticket (Enter sends, Shift+Enter adds a line)'
      }
      rows={4}
      autoFocus
      onSend={async (text) => {
        const result = await startConversation({
          intent: draft.intent,
          prompt: text,
          ...(draft.ticketNumber === undefined
            ? {}
            : { ticketNumber: draft.ticketNumber }),
          ...(draft.projectId === undefined
            ? {}
            : { projectId: draft.projectId }),
          ...(draft.defaults === undefined ? {} : { defaults: draft.defaults }),
        });
        if (!result.ok) {
          return {
            ok: false,
            error: result.error,
            textError: result.fieldErrors?.prompt,
          };
        }
        onStarted(result.conversation);
        return { ok: true };
      }}
    />
  </div>
);
