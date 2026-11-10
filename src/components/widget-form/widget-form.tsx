'use client';

import { Alert, Button, Inline, Stack, Text, TextInput } from '@blockle/blocks';
import { type ReactElement, type ReactNode, useEffect } from 'react';
import {
  type DefaultValues,
  type FieldValues,
  type UseFormReturn,
  useForm,
} from 'react-hook-form';

import { answerConversationWidget } from '../../app/conversations/actions';
import { callAction } from '../../app/lib/call-action';
import type { WidgetAnswer } from '../../conversations/widget';
import { useKeptConversation } from '../conversation-dialog-provider/kept-conversations';

/** What every Widget form holds: its own answer, and the Other text once Other… is open. */
export type WidgetValues<V extends FieldValues> = {
  value: V;
  otherOpen: boolean;
  other: string;
};

export type WidgetFormProps<V extends FieldValues> = {
  conversationId: number;
  entryId: number;
  prompt: string;
  /** The answer the form starts with, such as the recommended choices. */
  initial: V;
  /** The Widget's own answer from the form's value; null while it is not complete. */
  answerOf: (value: V) => WidgetAnswer | null;
  /** The Widget's own fields. */
  children: (form: UseFormReturn<WidgetValues<V>>) => ReactNode;
};

/**
 * The frame every pending Widget shares (ADR 0045): its prompt, its own
 * fields, Other… with a text field, Skip and Send answer, which sends the Other text
 * while Other… is open, else the Widget's own answer. A refusal shows its
 * reason and keeps the draft. In the Conversation dialog, an unsent draft is
 * kept while another tab is shown (T1100).
 */
export const WidgetForm = <V extends FieldValues>({
  conversationId,
  entryId,
  prompt,
  initial,
  answerOf,
  children,
}: WidgetFormProps<V>): ReactElement => {
  const kept = useKeptConversation();
  const form = useForm<WidgetValues<V>>({
    defaultValues: ((kept?.widgets.get(entryId) as WidgetValues<V>) ?? {
      value: initial,
      otherOpen: false,
      other: '',
    }) as DefaultValues<WidgetValues<V>>,
  });
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    setValue,
    watch,
  } = form;
  const values = watch();

  // Keep what the User picks and types until it is sent.
  useEffect(() => {
    if (!kept) {
      return;
    }
    const subscription = watch((current) => {
      kept.widgets.set(entryId, structuredClone(current));
    });
    return () => subscription.unsubscribe();
  }, [kept, entryId, watch]);

  const send = async (answer: WidgetAnswer) => {
    const result = await callAction(
      () => answerConversationWidget({ conversationId, entryId, answer }),
      'The answer could not be sent. Try again.',
    );
    if (result.ok) {
      kept?.widgets.delete(entryId);
    } else {
      setError('root.server', { message: result.error });
    }
  };

  const answer: WidgetAnswer | null = values.otherOpen
    ? values.other.trim() === ''
      ? null
      : { other: values.other.trim() }
    : answerOf(values.value as V);
  const error = errors.root?.server?.message;

  return (
    <form
      aria-label={prompt}
      onSubmit={handleSubmit(() =>
        answer === null ? undefined : send(answer),
      )}
    >
      <Stack gap={2}>
        <Text tag="p" fontWeight="strong">
          {prompt}
        </Text>
        {!values.otherOpen && children(form)}
        {values.otherOpen && (
          <TextInput
            {...register('other')}
            aria-label={`Other answer to ${prompt}`}
            placeholder="Your own answer"
            autoFocus
          />
        )}
        {error && <Alert intent="danger">{error}</Alert>}
        <Inline gap={2} alignX="end" flexWrap="wrap">
          <Button
            type="button"
            size="small"
            variant="ghost"
            onClick={() => setValue('otherOpen', !values.otherOpen)}
          >
            {values.otherOpen ? 'Back to the options' : 'Other…'}
          </Button>
          <Button
            type="button"
            size="small"
            variant="outline"
            disabled={isSubmitting}
            onClick={handleSubmit(() => send({ skipped: true }))}
          >
            Skip
          </Button>
          <Button
            type="submit"
            size="small"
            loading={isSubmitting}
            disabled={isSubmitting || answer === null}
          >
            Send answer
          </Button>
        </Inline>
      </Stack>
    </form>
  );
};
