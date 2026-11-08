'use client';

import {
  Alert,
  Button,
  Inline,
  Label,
  Radio,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@blockle/blocks';
import { type FC, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { setProjectAgentSettings } from '../../app/projects/actions';
import type { Conversation } from '../../conversations/conversations';
import type { AgentRunMode, ProjectAgentSettings } from '../../tickets/tickets';
import { FieldError } from '../field-error/field-error';
import { ProjectSetup, type SetupOffer } from '../project-setup/project-setup';

export type AgentSettingsFormProps = {
  projectId: number;
  /** The Project's saved settings. */
  settings: ProjectAgentSettings;
  /** The Project's latest Setup Conversation, if it ever held one. */
  latestSetup?: Conversation | null;
};

type AgentSettingsValues = {
  repositoryPath: string;
  parallelRuns: boolean;
  maxConcurrentRuns: number;
  agentMode: boolean;
  runMode: AgentRunMode;
  runModel: string;
};

/**
 * A Project's settings for Agent runs. The run controls show only once a
 * repository path is saved; agent mode shows always, disabled with a reason
 * until then. A refusal shows under the field it names and keeps the draft.
 */
export const AgentSettingsForm: FC<AgentSettingsFormProps> = ({
  projectId,
  settings,
  latestSetup = null,
}) => {
  const [saved, setSaved] = useState({
    agentMode: settings.agentMode,
    parallelRuns: settings.parallelRuns,
  });
  const [offer, setOffer] = useState<SetupOffer | null>(null);
  const pathId = useId();
  const parallelId = useId();
  const modeId = useId();
  const pathErrorId = useId();
  const capId = useId();
  const capErrorId = useId();
  const modeReasonId = useId();
  const modeErrorId = useId();
  const runModeErrorId = useId();
  const runModeLabelId = useId();
  const runModelId = useId();
  const runModelErrorId = useId();
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
      runMode: settings.runMode,
      runModel: settings.runModel ?? '',
    },
  });
  const hasPath = settings.repositoryPath !== null;
  const pathError = errors.repositoryPath?.message;
  const capError = errors.maxConcurrentRuns?.message;
  const modeError = errors.agentMode?.message;
  const runModeError = errors.runMode?.message;
  const runModelError = errors.runModel?.message;
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await setProjectAgentSettings({
      projectId,
      repositoryPath: values.repositoryPath,
      parallelRuns: values.parallelRuns,
      maxConcurrentRuns: Number(values.maxConcurrentRuns),
      agentMode: values.agentMode,
      runMode: values.runMode,
      runModel: values.runModel.trim() === '' ? null : values.runModel.trim(),
    });
    if (result.ok) {
      // Turning agent mode or Parallel runs on offers Setup; it never starts it.
      if (values.agentMode && !saved.agentMode) {
        setOffer('agent-mode');
      } else if (
        values.agentMode &&
        values.parallelRuns &&
        !saved.parallelRuns
      ) {
        setOffer('parallel-runs');
      } else {
        setOffer(null);
      }
      setSaved({
        agentMode: values.agentMode,
        parallelRuns: values.parallelRuns,
      });
      return;
    }
    const { repositoryPath, maxConcurrentRuns, agentMode, runMode, runModel } =
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
    if (runMode) {
      setError('runMode', { type: 'server', message: runMode });
    }
    if (runModel) {
      setError('runModel', { type: 'server', message: runModel });
    }
    if (
      !repositoryPath &&
      !maxConcurrentRuns &&
      !agentMode &&
      !runMode &&
      !runModel
    ) {
      setError('root.server', { message: result.error });
    }
  });

  return (
    <Stack gap={3}>
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
          <Stack gap={1} role="radiogroup" aria-labelledby={runModeLabelId}>
            <Text tag="p" id={runModeLabelId} fontWeight="bold">
              Agent run mode
            </Text>
            <Radio {...register('runMode')} value="default">
              Default: asks before each tool call the repository has not
              allowed.
            </Radio>
            <Radio {...register('runMode')} value="auto">
              Auto: a classifier decides, so runs wait less.
            </Radio>
            <Text tag="p" fontSize="small" color="muted">
              In the spike the auto classifier allowed a hard reset, writes
              outside the repository, an outbound POST and a push without
              asking. Calls it cannot decide still ask you. Applies to every run
              this Project starts.
            </Text>
            <FieldError id={runModeErrorId} reason={runModeError} />
          </Stack>
          <Stack gap={1}>
            <Label htmlFor={runModelId}>Run model</Label>
            <TextInput
              {...register('runModel')}
              id={runModelId}
              placeholder="Your default model"
              autoComplete="off"
              aria-invalid={runModelError ? true : undefined}
              aria-describedby={runModelError ? runModelErrorId : undefined}
            />
            <Text tag="p" fontSize="small" color="muted">
              The model runs start on; leave empty for your default. A run can
              still change models itself.
            </Text>
            <FieldError id={runModelErrorId} reason={runModelError} />
          </Stack>
          {serverError && <Alert intent="danger">{serverError}</Alert>}
          <div>
            <Button type="submit" size="small" loading={isSubmitting}>
              Save
            </Button>
          </div>
        </Stack>
      </form>
      <ProjectSetup
        projectId={projectId}
        agentMode={saved.agentMode}
        offer={offer}
        latestSetup={latestSetup}
      />
    </Stack>
  );
};
