'use client';

import {
  Alert,
  Button,
  Heading,
  Inline,
  Stack,
  Textarea,
} from '@blockle/blocks';
import { type FC, type KeyboardEvent, useId } from 'react';
import { useForm } from 'react-hook-form';

import { startConversation } from '../../app/conversations/actions';
import type { Conversation } from '../../conversations/conversations';
import type { NewTicketDefaults } from '../../conversations/run-brief';
import { FieldError } from '../field-error/field-error';
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
}) => {
  const errorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<{ text: string }>({
    defaultValues: { text: draft.text },
    reValidateMode: 'onSubmit',
  });
  const fieldError = errors.text?.message;
  const error = errors.root?.server?.message;
  const text = register('text');

  const submit = handleSubmit(async ({ text }) => {
    const result = await startConversation({
      intent: draft.intent,
      prompt: text,
      ...(draft.ticketNumber === undefined
        ? {}
        : { ticketNumber: draft.ticketNumber }),
      ...(draft.projectId === undefined ? {} : { projectId: draft.projectId }),
      ...(draft.defaults === undefined ? {} : { defaults: draft.defaults }),
    });
    if (!result.ok) {
      const reason = result.fieldErrors?.prompt;
      if (reason) {
        setError('text', { type: 'server', message: reason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    onStarted(result.conversation);
  });

  const send = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!isSubmitting && watch('text').trim() !== '') {
      submit();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      send(event);
    }
  };

  return (
    <div className={styles.draft}>
      <Heading level={3} fontSize="medium">
        {draftLabel(draft)}
      </Heading>
      <form onSubmit={send} className={styles.form}>
        <Stack gap={1}>
          <Textarea
            {...text}
            onChange={(event) => {
              text.onChange(event);
              onTextChange(event.target.value);
            }}
            aria-label={draft.intent === 'ask' ? 'Question' : 'Message'}
            placeholder={
              draft.intent === 'ask'
                ? 'Ask a question (Enter sends, Shift+Enter adds a line)'
                : 'Describe the Ticket (Enter sends, Shift+Enter adds a line)'
            }
            rows={4}
            autoFocus
            onKeyDown={onKeyDown}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
          />
          <FieldError id={errorId} reason={fieldError} />
          {error && <Alert intent="danger">{error}</Alert>}
          <Inline gap={2} alignX="end">
            <Button
              type="submit"
              size="small"
              loading={isSubmitting}
              disabled={isSubmitting || watch('text').trim() === ''}
            >
              Send
            </Button>
          </Inline>
        </Stack>
      </form>
    </div>
  );
};
