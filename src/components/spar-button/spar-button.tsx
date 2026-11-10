'use client';

import {
  Alert,
  Button,
  Inline,
  Label,
  Stack,
  TextInput,
} from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import { type FC, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { callAction } from '../../app/lib/call-action';
import { sparPath } from '../../app/lib/paths';
import { startSpar } from '../../app/spars/actions';
import { FieldError } from '../field-error/field-error';

export type SparButtonProps = {
  projectId: number;
  /** The Ticket or Epic the Spar is about; left out for the Project. */
  focusTicketNumber?: number;
  /** The button's text; "Spar" by default. */
  label?: string;
};

/**
 * Spar (GLOSSARY): a button that asks for an optional one-line topic and
 * starts a Spar, about the Project or about `focusTicketNumber`, then opens
 * the Spar's own page. A refusal shows under the topic.
 */
export const SparButton: FC<SparButtonProps> = ({
  projectId,
  focusTicketNumber,
  label = 'Spar',
}) => {
  const router = useRouter();
  const topicId = useId();
  const errorId = useId();
  const [asking, setAsking] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ topic: string }>({ defaultValues: { topic: '' } });
  const topicReason = errors.topic?.message;
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async ({ topic }) => {
    const result = await callAction(
      () =>
        startSpar({
          projectId,
          focusTicketNumber: focusTicketNumber ?? null,
          topic,
        }),
      'The Spar could not be started. Try again.',
    );
    if (!result.ok) {
      const reason = result.fieldErrors?.topic;
      if (reason) {
        setError('topic', { type: 'server', message: reason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    reset();
    setAsking(false);
    router.push(sparPath(projectId, result.spar.id));
  });

  if (!asking) {
    return (
      <div>
        <Button
          type="button"
          size="small"
          variant="outline"
          onClick={() => setAsking(true)}
        >
          {label}
        </Button>
      </div>
    );
  }

  return (
    <form aria-label="Spar" onSubmit={submit}>
      <Stack gap={2}>
        <Label htmlFor={topicId}>Topic (optional)</Label>
        <TextInput
          {...register('topic')}
          id={topicId}
          autoComplete="off"
          autoFocus
          placeholder="What do you want to think through?"
          readOnly={isSubmitting}
          aria-invalid={topicReason ? true : undefined}
          aria-describedby={topicReason ? errorId : undefined}
        />
        <FieldError id={errorId} reason={topicReason} />
        {serverError && <Alert intent="danger">{serverError}</Alert>}
        <Inline gap={2}>
          <Button type="submit" size="small" loading={isSubmitting}>
            Start sparring
          </Button>
          <Button
            type="button"
            size="small"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => {
              reset();
              setAsking(false);
            }}
          >
            Cancel
          </Button>
        </Inline>
      </Stack>
    </form>
  );
};
