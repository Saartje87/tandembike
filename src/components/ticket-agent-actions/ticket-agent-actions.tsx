'use client';

import { Alert, Button, Inline, Label, Stack, Textarea } from '@blockle/blocks';
import { type FC, useId, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { startConversation } from '../../app/conversations/actions';
import type { ConversationIntent } from '../../conversations/conversation-state';
import { FieldError } from '../field-error/field-error';

export type TicketAgentActionsProps = {
  ticketNumber: number;
  /** Called with the id of the Conversation a click started. */
  onStarted?: (conversationId: number) => void;
};

type AskFormProps = {
  ticketNumber: number;
  onStarted: (conversationId: number) => void;
  onClose: () => void;
};

/** The Ask field. A refused Ask keeps its text and shows the reason. */
const AskForm: FC<AskFormProps> = ({ ticketNumber, onStarted, onClose }) => {
  const inputId = useId();
  const errorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<{ prompt: string }>({
    defaultValues: { prompt: '' },
    reValidateMode: 'onSubmit',
  });
  const fieldError = errors.prompt?.message;
  const error = errors.root?.server?.message;

  const submit = handleSubmit(async ({ prompt }) => {
    const result = await startConversation({
      ticketNumber,
      intent: 'ask',
      prompt,
    });
    if (!result.ok) {
      const reason = result.fieldErrors?.prompt;
      if (reason) {
        setError('prompt', { type: 'server', message: reason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    onStarted(result.conversation.id);
    onClose();
  });

  return (
    <form
      onSubmit={(event) => {
        if (isSubmitting) {
          event.preventDefault();
          return;
        }
        submit(event);
      }}
    >
      <Stack gap={1}>
        <Label htmlFor={inputId}>Question</Label>
        <Textarea
          {...register('prompt')}
          id={inputId}
          rows={3}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
        />
        <FieldError id={errorId} reason={fieldError} />
        {error && <Alert intent="danger">{error}</Alert>}
        <Inline gap={2}>
          <Button
            type="submit"
            size="small"
            loading={isSubmitting}
            disabled={isSubmitting || watch('prompt').trim() === ''}
          >
            Send
          </Button>
          <Button type="button" size="small" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </Inline>
      </Stack>
    </form>
  );
};

/**
 * Start, Triage and Ask on a Ticket (ADR 0019). Start and Triage begin a
 * Conversation at once with a minimal message ("Start T42"); Ask opens a
 * field for the User's own question. A refusal, such as the Start run limit,
 * shows its reason.
 */
export const TicketAgentActions: FC<TicketAgentActionsProps> = ({
  ticketNumber,
  onStarted,
}) => {
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string>();

  const begin = (intent: ConversationIntent, prompt: string) => () => {
    setError(undefined);
    startTransition(async () => {
      const result = await startConversation({ ticketNumber, intent, prompt });
      if (result.ok) {
        onStarted?.(result.conversation.id);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Stack gap={2}>
      <Inline gap={2}>
        <Button
          type="button"
          size="small"
          disabled={pending}
          onClick={begin('start', `Start T${ticketNumber}`)}
        >
          Start
        </Button>
        <Button
          type="button"
          size="small"
          variant="outline"
          disabled={pending}
          onClick={begin('triage', `Triage T${ticketNumber}`)}
        >
          Triage
        </Button>
        <Button
          type="button"
          size="small"
          variant="outline"
          aria-expanded={asking}
          onClick={() => setAsking(true)}
        >
          Ask
        </Button>
      </Inline>
      {error && <Alert intent="danger">{error}</Alert>}
      {asking && (
        <AskForm
          ticketNumber={ticketNumber}
          onStarted={(id) => onStarted?.(id)}
          onClose={() => setAsking(false)}
        />
      )}
    </Stack>
  );
};
