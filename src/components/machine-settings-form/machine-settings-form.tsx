'use client';

import { Alert, Button, Label, Stack, Text, TextInput } from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

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
};

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
  const {
    formState: { errors, isSubmitting, isSubmitSuccessful },
    handleSubmit,
    register,
    setError,
  } = useForm<MachineSettingsValues>({
    defaultValues: {
      maxConcurrentRuns: settings.maxConcurrentRuns,
      dailySpendCeiling:
        settings.dailySpendCeilingUsd === null
          ? ''
          : String(settings.dailySpendCeilingUsd),
    },
  });
  const capError = errors.maxConcurrentRuns?.message;
  const ceilingError = errors.dailySpendCeiling?.message;
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await saveMachineSettings({
      maxConcurrentRuns: Number(values.maxConcurrentRuns),
      dailySpendCeilingUsd:
        values.dailySpendCeiling.trim() === ''
          ? null
          : Number(values.dailySpendCeiling),
    });
    if (result.ok) {
      return;
    }
    const refused = (
      [
        ['maxConcurrentRuns', result.fieldErrors?.maxConcurrentRuns],
        ['dailySpendCeiling', result.fieldErrors?.dailySpendCeilingUsd],
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
            The most working Start, Merge and Autopilot Triage runs the machine
            holds at once, across all Projects. Your own conversations and
            Terminal sessions are not counted.
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
            The most Autopilot may spend per day across all Projects. At it,
            Autopilot starts and resumes nothing anywhere, running runs finish,
            and it goes on the next day or when you raise the ceiling. Merges
            you approve and your own runs are not counted.
          </Text>
          <FieldError id={ceilingErrorId} reason={ceilingError} />
        </Stack>
        {serverError && <Alert intent="danger">{serverError}</Alert>}
        {isSubmitSuccessful && !serverError && !capError && !ceilingError && (
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
