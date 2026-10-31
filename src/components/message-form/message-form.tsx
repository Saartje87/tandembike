'use client';

import { Alert, Button, Inline, Label, Stack, Textarea } from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { FieldError } from '../field-error/field-error';

/** What sending a message came to: `reason` is the one the field is refused for. */
export type MessageResult =
  | { ok: true }
  | { ok: false; error: string; reason?: string | undefined };

export type MessageFormProps = {
  /** The field's label, such as "Reply". */
  label: string;
  /** Sends the text; a refusal shows its reason and keeps the text. */
  onSend: (text: string) => Promise<MessageResult>;
  /** Adds a Cancel button next to Send. */
  onCancel?: () => void;
};

/**
 * A message field with Send, for talking to an Agent. A refused message keeps
 * its text and shows the reason; a sent one clears the field.
 */
export const MessageForm: FC<MessageFormProps> = ({
  label,
  onSend,
  onCancel,
}) => {
  const inputId = useId();
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
    const result = await onSend(text);
    if (result.ok) {
      reset();
    } else if (result.reason) {
      setError('text', { type: 'server', message: result.reason });
    } else {
      setError('root.server', { message: result.error });
    }
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
        <Label htmlFor={inputId}>{label}</Label>
        <Textarea
          {...register('text')}
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
            disabled={isSubmitting || watch('text').trim() === ''}
          >
            Send
          </Button>
          {onCancel && (
            <Button
              type="button"
              size="small"
              variant="ghost"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </Inline>
      </Stack>
    </form>
  );
};
