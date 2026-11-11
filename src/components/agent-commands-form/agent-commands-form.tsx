'use client';

import { Alert, Label, Stack, Text, TextInput } from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { fieldRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { settingsFieldOfStage } from '../../app/lib/paths';
import { setProjectAgentCommands } from '../../app/projects/actions';
import {
  agentStages,
  type ProjectAgentCommands,
  playbookCommand,
} from '../../tickets/agent-commands';
import { FieldError } from '../field-error/field-error';
import { SettingsSection } from '../settings-section/settings-section';

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
 * it runs. They save with the Commands section's Save (ADR 0053), which
 * shows them as stored; a refusal shows under the field it names and keeps
 * the text.
 */
export const AgentCommandsForm: FC<AgentCommandsFormProps> = ({
  projectId,
  commands,
}) => {
  const idPrefix = useId();
  const {
    formState: { errors, isDirty, isSubmitting },
    handleSubmit,
    register,
    watch,
    reset,
    setError,
  } = useForm<AgentCommandsFormValues>({ defaultValues: valuesOf(commands) });
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await callAction(
      () => setProjectAgentCommands({ projectId, ...values }),
      'The agent commands could not be saved. Try again.',
    );
    if (result.ok) {
      reset(valuesOf(result.commands));
      return;
    }
    let named = false;
    for (const { field: name } of agentStages) {
      const message = fieldRefusal(result, name);
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
      <SettingsSection
        section="commands"
        title="Commands"
        description="Replace the Playbook command a Stage sends, per Stage."
        help={
          <>
            <Text tag="p" fontSize="small" color="muted">
              A Stage sends its command before the Ticket number, such as
              /tandembike:implement T42. A blank field runs the Playbook command
              shown under it; a command you set replaces it for that Stage only.
            </Text>
            <Text tag="p" fontSize="small" color="muted">
              Start on an Epic does not fall back to the Start command. The
              Retro command is followed by the Cycle's title and id. The Merge
              command runs when you approve a merge.
            </Text>
            <Text tag="p" fontSize="small" color="muted">
              They apply to Claude Code runs only: a run on another agent always
              runs the Playbook's skill for its Stage.
            </Text>
          </>
        }
        dirty={isDirty}
        saving={isSubmitting}
        onDiscard={() => reset()}
      >
        <Stack gap={3} id="agent-commands">
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
        </Stack>
        {serverError && <Alert intent="danger">{serverError}</Alert>}
      </SettingsSection>
    </form>
  );
};
