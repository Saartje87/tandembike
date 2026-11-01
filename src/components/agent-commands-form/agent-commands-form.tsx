'use client';

import { Alert, Button, Label, Stack, TextInput } from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { setProjectAgentCommands } from '../../app/projects/actions';
import type { ProjectAgentCommands } from '../../tickets/agent-commands';
import { FieldError } from '../field-error/field-error';

export type AgentCommandsFormProps = {
  projectId: number;
  /** The Project's saved commands, `null` for none. */
  commands: ProjectAgentCommands;
};

type Values = Record<keyof ProjectAgentCommands, string>;

const fields: { name: keyof ProjectAgentCommands; label: string }[] = [
  { name: 'triageCommand', label: 'Triage command' },
  { name: 'startCommand', label: 'Start command' },
  { name: 'startEpicCommand', label: 'Start command for Epics' },
];

const valuesOf = (commands: ProjectAgentCommands): Values => ({
  triageCommand: commands.triageCommand ?? '',
  startCommand: commands.startCommand ?? '',
  startEpicCommand: commands.startEpicCommand ?? '',
});

/**
 * A Project's Triage, Start and Start-for-Epics commands (T621), each a
 * single line, blank for none. Save shows them as stored; a refusal shows
 * under the field it names and keeps the text.
 */
export const AgentCommandsForm: FC<AgentCommandsFormProps> = ({
  projectId,
  commands,
}) => {
  const idPrefix = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<Values>({ defaultValues: valuesOf(commands) });
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await setProjectAgentCommands({ projectId, ...values });
    if (result.ok) {
      reset(valuesOf(result.commands));
      return;
    }
    const named = fields.filter(({ name }) => result.fieldErrors?.[name]);
    for (const { name } of named) {
      setError(name, { type: 'server', message: result.fieldErrors?.[name] });
    }
    if (named.length === 0) {
      setError('root.server', { message: result.error });
    }
  });

  return (
    <form aria-label="Agent commands" onSubmit={submit}>
      <Stack gap={3}>
        {fields.map(({ name, label }) => {
          const fieldId = `${idPrefix}-${name}`;
          const errorId = `${fieldId}-error`;
          const fieldError = errors[name]?.message;
          return (
            <Stack key={name} gap={1}>
              <Label htmlFor={fieldId}>{label}</Label>
              <TextInput
                {...register(name)}
                id={fieldId}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? errorId : undefined}
              />
              <FieldError id={errorId} reason={fieldError} />
            </Stack>
          );
        })}
        {serverError && <Alert intent="danger">{serverError}</Alert>}
        <div>
          <Button type="submit" size="small" loading={isSubmitting}>
            Save
          </Button>
        </div>
      </Stack>
    </form>
  );
};
