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
  const {
    formState: { errors, isSubmitting, isSubmitSuccessful },
    handleSubmit,
    register,
    setError,
  } = useForm<MachineSettingsValues>({
    defaultValues: { maxConcurrentRuns: settings.maxConcurrentRuns },
  });
  const capError = errors.maxConcurrentRuns?.message;
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await saveMachineSettings({
      maxConcurrentRuns: Number(values.maxConcurrentRuns),
    });
    if (result.ok) {
      return;
    }
    const message = result.fieldErrors?.maxConcurrentRuns;
    if (message) {
      setError('maxConcurrentRuns', { type: 'server', message });
    } else {
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
        {serverError && <Alert intent="danger">{serverError}</Alert>}
        {isSubmitSuccessful && !serverError && !capError && (
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
