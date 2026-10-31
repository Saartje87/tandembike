'use client';

import {
  Alert,
  Button,
  Inline,
  Label,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { setProjectAgentSettings } from '../../app/projects/actions';
import type { ProjectAgentSettings } from '../../tickets/tickets';
import { FieldError } from '../field-error/field-error';

export type AgentSettingsFormProps = {
  projectId: number;
  /** The Project's saved settings. */
  settings: ProjectAgentSettings;
};

type AgentSettingsValues = {
  repositoryPath: string;
  parallelRuns: boolean;
  maxConcurrentRuns: number;
  agentMode: boolean;
};

/**
 * A Project's settings for Agent runs. The run controls show only once a
 * repository path is saved; agent mode shows always, disabled with a reason
 * until then. A refusal shows under the field it names and keeps the draft.
 */
export const AgentSettingsForm: FC<AgentSettingsFormProps> = ({
  projectId,
  settings,
}) => {
  const pathId = useId();
  const parallelId = useId();
  const modeId = useId();
  const pathErrorId = useId();
  const capId = useId();
  const capErrorId = useId();
  const modeReasonId = useId();
  const modeErrorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<AgentSettingsValues>({
    defaultValues: {
      repositoryPath: settings.repositoryPath ?? '',
      parallelRuns: settings.parallelRuns,
      maxConcurrentRuns: settings.maxConcurrentRuns,
      agentMode: settings.agentMode,
    },
  });
  const hasPath = settings.repositoryPath !== null;
  const pathError = errors.repositoryPath?.message;
  const capError = errors.maxConcurrentRuns?.message;
  const modeError = errors.agentMode?.message;
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await setProjectAgentSettings({
      projectId,
      repositoryPath: values.repositoryPath,
      parallelRuns: values.parallelRuns,
      maxConcurrentRuns: Number(values.maxConcurrentRuns),
      agentMode: values.agentMode,
    });
    if (result.ok) {
      return;
    }
    const { repositoryPath, maxConcurrentRuns, agentMode } =
      result.fieldErrors ?? {};
    if (repositoryPath) {
      setError('repositoryPath', { type: 'server', message: repositoryPath });
    }
    if (maxConcurrentRuns) {
      setError('maxConcurrentRuns', {
        type: 'server',
        message: maxConcurrentRuns,
      });
    }
    if (agentMode) {
      setError('agentMode', { type: 'server', message: agentMode });
    }
    if (!repositoryPath && !maxConcurrentRuns && !agentMode) {
      setError('root.server', { message: result.error });
    }
  });

  return (
    <form aria-label="Agent settings" onSubmit={submit}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Label htmlFor={pathId}>Repository path</Label>
          <TextInput
            {...register('repositoryPath')}
            id={pathId}
            placeholder="/Users/you/Projects/website"
            autoComplete="off"
            aria-invalid={pathError ? true : undefined}
            aria-describedby={pathError ? pathErrorId : undefined}
          />
          <FieldError id={pathErrorId} reason={pathError} />
        </Stack>
        {hasPath && (
          <>
            <Inline gap={2} alignY="center">
              <Switch {...register('parallelRuns')} id={parallelId} />
              <Label htmlFor={parallelId}>Parallel runs</Label>
            </Inline>
            <Stack gap={1}>
              <Label htmlFor={capId}>Max concurrent Start runs</Label>
              <TextInput
                {...register('maxConcurrentRuns', { valueAsNumber: true })}
                id={capId}
                type="number"
                min={1}
                step={1}
                aria-invalid={capError ? true : undefined}
                aria-describedby={capError ? capErrorId : undefined}
              />
              <FieldError id={capErrorId} reason={capError} />
            </Stack>
          </>
        )}
        <Stack gap={1}>
          <Inline gap={2} alignY="center">
            <Switch
              {...register('agentMode')}
              id={modeId}
              disabled={!hasPath}
              aria-describedby={
                hasPath ? (modeError ? modeErrorId : undefined) : modeReasonId
              }
            />
            <Label htmlFor={modeId}>Agent mode</Label>
          </Inline>
          {!hasPath && (
            <Text id={modeReasonId} tag="p" fontSize="small" color="muted">
              Set a repository path to turn on agent mode.
            </Text>
          )}
          <FieldError id={modeErrorId} reason={modeError} />
        </Stack>
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
