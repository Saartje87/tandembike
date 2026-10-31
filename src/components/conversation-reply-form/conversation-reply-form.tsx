'use client';

import { Alert, Button, Inline, Stack, Textarea } from '@blockle/blocks';
import { type FC, type KeyboardEvent, useId } from 'react';
import { useForm } from 'react-hook-form';

import { replyToConversation } from '../../app/conversations/actions';
import { FieldError } from '../field-error/field-error';

export type ConversationReplyFormProps = { conversationId: number };

/**
 * The reply input fixed at the bottom of the chat. Enter sends and
 * Shift+Enter starts a new line. A refused reply keeps its text and shows the
 * reason.
 */
export const ConversationReplyForm: FC<ConversationReplyFormProps> = ({
  conversationId,
}) => {
  const errorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    watch,
  } = useForm<{ text: string }>({
    defaultValues: { text: '' },
    reValidateMode: 'onSubmit',
  });
  const fieldError = errors.text?.message;
  const error = errors.root?.server?.message;

  const submit = handleSubmit(async ({ text }) => {
    const result = await replyToConversation({ conversationId, text });
    if (!result.ok) {
      const reason = result.fieldErrors?.text;
      if (reason) {
        setError('text', { type: 'server', message: reason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    reset();
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
    <form onSubmit={send}>
      <Stack gap={1}>
        <Textarea
          {...register('text')}
          aria-label="Reply"
          placeholder="Reply (Enter sends, Shift+Enter adds a line)"
          rows={2}
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
  );
};
