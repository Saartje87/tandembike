'use client';

import { Alert, Button, Label, Stack, Text, TextInput } from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { fieldRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { saveMachineSettings } from '../../app/settings/actions';
import type { MachineSettings } from '../../tickets/machine-settings';
import { FieldError } from '../field-error/field-error';

export type MachineSettingsFormProps = {
  /** The saved machine settings. */
  settings: MachineSettings;
};

type MachineSettingsValues = {
  maxConcurrentRuns: number;
  dailySpendCeiling: string;
  dailySpendCeilingAiCredits: string;
};

/** A ceiling as the form's text, blank for none. */
const ceilingText = (ceiling: number | null) =>
  ceiling === null ? '' : String(ceiling);

/** A ceiling field's text as the setting, null when blank. */
const ceilingOf = (text: string) => (text.trim() === '' ? null : Number(text));

/**
 * The machine-wide limits (ADR 0041): the cap on working runs across all
 * Projects. A refusal shows under the field it names and keeps the draft.
 */
export const MachineSettingsForm: FC<MachineSettingsFormProps> = ({
  settings,
}) => {
  const capId = useId();
  const capErrorId = useId();
  const ceilingId = useId();
  const ceilingErrorId = useId();
  const creditsId = useId();
  const creditsErrorId = useId();
  const {
    formState: { errors, isSubmitting, isSubmitSuccessful },
    handleSubmit,
    register,
    setError,
  } = useForm<MachineSettingsValues>({
    defaultValues: {
      maxConcurrentRuns: settings.maxConcurrentRuns,
      dailySpendCeiling: ceilingText(settings.dailySpendCeilingUsd),
      dailySpendCeilingAiCredits: ceilingText(
        settings.dailySpendCeilingAiCredits,
      ),
    },
  });
  const capError = errors.maxConcurrentRuns?.message;
  const ceilingError = errors.dailySpendCeiling?.message;
  const creditsError = errors.dailySpendCeilingAiCredits?.message;
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await callAction(
      () =>
        saveMachineSettings({
          maxConcurrentRuns: Number(values.maxConcurrentRuns),
          dailySpendCeilingUsd: ceilingOf(values.dailySpendCeiling),
          dailySpendCeilingAiCredits: ceilingOf(
            values.dailySpendCeilingAiCredits,
          ),
        }),
      'The machine settings could not be saved. Try again.',
    );
    if (result.ok) {
      return;
    }
    const refused = (
      [
        ['maxConcurrentRuns', fieldRefusal(result, 'maxConcurrentRuns')],
        ['dailySpendCeiling', fieldRefusal(result, 'dailySpendCeilingUsd')],
        [
          'dailySpendCeilingAiCredits',
          fieldRefusal(result, 'dailySpendCeilingAiCredits'),
        ],
      ] as const
    ).filter(([, message]) => message);
    for (const [field, message] of refused) {
      setError(field, { type: 'server', message });
    }
    if (refused.length === 0) {
      setError('root.server', { message: result.error });
    }
  });

  return (
    <form aria-label="Machine settings" onSubmit={submit}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Label htmlFor={capId}>Max concurrent runs</Label>
          <TextInput
            {...register('maxConcurrentRuns', { valueAsNumber: true })}
            id={capId}
            type="number"
            min={1}
            step={1}
            aria-invalid={capError ? true : undefined}
            aria-describedby={capError ? capErrorId : undefined}
          />
          <Text tag="p" fontSize="small" color="muted">
            The most Agent runs alive at once, across all Projects. A Start or
            Merge keeps its place while it waits on your reply, until you
            answer, close or stop it. Your own conversations and Terminal
            sessions are never refused, but Autopilot counts them before it
            starts more work.
          </Text>
          <FieldError id={capErrorId} reason={capError} />
        </Stack>
        <Stack gap={1}>
          <Label htmlFor={ceilingId}>Daily spend ceiling (USD)</Label>
          <TextInput
            {...register('dailySpendCeiling')}
            id={ceilingId}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="No ceiling"
            aria-invalid={ceilingError ? true : undefined}
            aria-describedby={ceilingError ? ceilingErrorId : undefined}
          />
          <Text tag="p" fontSize="small" color="muted">
            The most Autopilot may spend per day across all Projects whose
            default agent is Claude Code. At it, Autopilot starts and resumes
            nothing in those Projects, running runs finish, and it goes on the
            next day or when you raise the ceiling. Merges you approve and your
            own runs are not counted.
          </Text>
          <FieldError id={ceilingErrorId} reason={ceilingError} />
        </Stack>
        <Stack gap={1}>
          <Label htmlFor={creditsId}>Daily spend ceiling (AI credits)</Label>
          <TextInput
            {...register('dailySpendCeilingAiCredits')}
            id={creditsId}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="No ceiling"
            aria-invalid={creditsError ? true : undefined}
            aria-describedby={creditsError ? creditsErrorId : undefined}
          />
          <Text tag="p" fontSize="small" color="muted">
            The same for Copilot runs, in GitHub AI credits. Each ceiling pauses
            only the Projects whose default agent counts in its unit; nothing
            converts one into the other.
          </Text>
          <FieldError id={creditsErrorId} reason={creditsError} />
        </Stack>
        {serverError && <Alert intent="danger">{serverError}</Alert>}
        {isSubmitSuccessful &&
          !serverError &&
          !capError &&
          !ceilingError &&
          !creditsError && (
            <Text tag="p" fontSize="small" color="muted" role="status">
              Saved.
            </Text>
          )}
        <Button type="submit" alignSelf="flex-start" loading={isSubmitting}>
          Save
        </Button>
      </Stack>
    </form>
  );
};
