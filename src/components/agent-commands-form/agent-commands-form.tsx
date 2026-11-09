'use client';

import { Alert, Button, Label, Stack, Text, TextInput } from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { settingsFieldOfStage } from '../../app/lib/paths';
import { setProjectAgentCommands } from '../../app/projects/actions';
import {
  agentStages,
  type ProjectAgentCommands,
  playbookCommand,
} from '../../tickets/agent-commands';
import { FieldError } from '../field-error/field-error';

export type AgentCommandsFormProps = {
  projectId: number;
  /** The Project's saved commands, `null` for none. */
  commands: ProjectAgentCommands;
};

type AgentCommandsFormValues = Record<keyof ProjectAgentCommands, string>;

const valuesOf = (commands: ProjectAgentCommands): AgentCommandsFormValues =>
  Object.fromEntries(
    agentStages.map(({ field }) => [field, commands[field] ?? '']),
  ) as AgentCommandsFormValues;

/**
 * A Project's agent commands (T621), one field for each Stage in
 * `agentStages`, each a single line. A blank field shows the Playbook command
 * it runs. Save shows them as stored; a refusal shows
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
    watch,
    reset,
    setError,
  } = useForm<AgentCommandsFormValues>({ defaultValues: valuesOf(commands) });
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await setProjectAgentCommands({ projectId, ...values });
    if (result.ok) {
      reset(valuesOf(result.commands));
      return;
    }
    let named = false;
    for (const { field: name } of agentStages) {
      const message = result.fieldErrors?.[name];
      if (message) {
        setError(name, { type: 'server', message });
        named = true;
      }
    }
    if (!named) {
      setError('root.server', { message: result.error });
    }
  });

  return (
    <form aria-label="Agent commands" onSubmit={submit}>
      <Stack gap={3}>
        {agentStages.map(({ field: name, label, skill }) => {
          const fieldId = `${idPrefix}-${name}`;
          const errorId = `${fieldId}-error`;
          const fieldError = errors[name]?.message;
          const blank = watch(name).trim() === '';
          return (
            <Stack key={name} gap={1} id={settingsFieldOfStage(name)}>
              <Label htmlFor={fieldId}>{label}</Label>
              <TextInput
                {...register(name)}
                id={fieldId}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? errorId : undefined}
              />
              {blank && (
                <Text tag="p" fontSize="small" color="muted">
                  Blank runs {playbookCommand(skill)}
                </Text>
              )}
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
