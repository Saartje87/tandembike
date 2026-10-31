'use client';

import { Alert, Button, Inline, Stack, Textarea } from '@blockle/blocks';
import {
  type FC,
  type KeyboardEvent,
  type Ref,
  useId,
  useImperativeHandle,
} from 'react';
import { useForm } from 'react-hook-form';

import { replyToConversation } from '../../app/conversations/actions';
import { FieldError } from '../field-error/field-error';

/** What the chat does to the reply input besides the User typing (T613). */
export type ReplyControl = {
  /** Adds a line to the input, replacing an earlier line with the same prefix. */
  addLine: (prefix: string, line: string) => void;
  /** Sends the input's text with this line at once. */
  sendWith: (line: string) => void;
};

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
}) => {
  const errorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<{ text: string }>({
    defaultValues: { text: '' },
    reValidateMode: 'onSubmit',
  });
  const fieldError = errors.text?.message;
  const error = errors.root?.server?.message;

  const sendText = async (text: string) => {
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
  };
  const submit = handleSubmit(({ text }) => sendText(text));

  useImperativeHandle(control, () => ({
    addLine: (prefix, line) => {
      const lines = watch('text')
        .split('\n')
        .filter((existing) => existing !== '' && !existing.startsWith(prefix));
      setValue('text', [...lines, line].join('\n'));
    },
    sendWith: (line) => {
      if (!isSubmitting) {
        const typed = watch('text').trim();
        setValue('text', typed === '' ? line : `${typed}\n${line}`);
        submit();
      }
    },
  }));

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
