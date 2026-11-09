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

import {
  detectProjectRepository,
  setProjectAgentSettings,
} from '../../app/projects/actions';
import type { Conversation } from '../../conversations/conversations';
import type { AgentRunMode } from '../../tickets/agent-run-mode';
import type { ProjectAgentSettings } from '../../tickets/tickets';
import { CheckCommandField } from '../check-command-field/check-command-field';
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
  checkCommand: string;
  prepareCommand: string;
  parallelRuns: boolean;
  maxConcurrentRuns: number;
  agentMode: boolean;
  runMode: AgentRunMode;
  runModel: string;
  triageModel: string;
  autopilot: boolean;
  spendCeiling: string;
  autoTriage: boolean;
  triageCeiling: string;
  autoMerge: boolean;
};

/** The form field each field of a refusal names. */
const formFields: Record<string, keyof AgentSettingsValues | undefined> = {
  repositoryPath: 'repositoryPath',
  checkCommand: 'checkCommand',
  prepareCommand: 'prepareCommand',
  maxConcurrentRuns: 'maxConcurrentRuns',
  agentMode: 'agentMode',
  runMode: 'runMode',
  runModel: 'runModel',
  triageModel: 'triageModel',
  spendCeilingUsd: 'spendCeiling',
  triageCeilingUsd: 'triageCeiling',
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
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [detecting, setDetecting] = useState(false);
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
    clearErrors,
    getValues,
    handleSubmit,
    register,
    setError,
    setValue,
    watch,
  } = useForm<AgentSettingsValues>({
    defaultValues: {
      repositoryPath: settings.repositoryPath ?? '',
      checkCommand: settings.checkCommand ?? '',
      prepareCommand: settings.prepareCommand ?? '',
      parallelRuns: settings.parallelRuns,
      maxConcurrentRuns: settings.maxConcurrentRuns,
      agentMode: settings.agentMode,
      runMode: settings.runMode,
      runModel: settings.runModel ?? '',
      triageModel: settings.triageModel ?? '',
      autopilot: settings.autopilot,
      spendCeiling:
        settings.spendCeilingUsd === null
          ? ''
          : String(settings.spendCeilingUsd),
      autoTriage: settings.autoTriage,
      triageCeiling:
        settings.triageCeilingUsd === null
          ? ''
          : String(settings.triageCeilingUsd),
      autoMerge: settings.autoMerge,
    },
  });
  const hasPath = settings.repositoryPath !== null;
  const pathError = errors.repositoryPath?.message;
  const checkError = errors.checkCommand?.message;
  const prepareError = errors.prepareCommand?.message;
  const prepareId = useId();
  const prepareErrorId = useId();
  const capError = errors.maxConcurrentRuns?.message;
  const modeError = errors.agentMode?.message;
  const runModeError = errors.runMode?.message;
  const runModelError = errors.runModel?.message;
  const triageModelId = useId();
  const triageModelErrorId = useId();
  const triageModelError = errors.triageModel?.message;
  const ceilingError = errors.spendCeiling?.message;
  const ceilingId = useId();
  const ceilingErrorId = useId();
  const autopilotId = useId();
  const autoTriageId = useId();
  const autoMergeId = useId();
  const triageCeilingId = useId();
  const triageCeilingErrorId = useId();
  const triageCeilingError = errors.triageCeiling?.message;
  const serverError = errors.root?.server?.message;

  /** Re-runs detection for the path in the field and offers its candidates. */
  const detect = async () => {
    setDetecting(true);
    try {
      const result = await detectProjectRepository({
        path: getValues('repositoryPath'),
      });
      if (result.ok) {
        clearErrors('repositoryPath');
        setCandidates(result.repository.checkCommands);
      } else {
        setCandidates(null);
        setError('repositoryPath', { type: 'server', message: result.error });
      }
    } finally {
      setDetecting(false);
    }
  };

  const submit = handleSubmit(async (values) => {
    const result = await setProjectAgentSettings({
      projectId,
      repositoryPath: values.repositoryPath,
      checkCommand:
        values.checkCommand.trim() === '' ? null : values.checkCommand,
      prepareCommand:
        values.prepareCommand.trim() === '' ? null : values.prepareCommand,
      parallelRuns: values.parallelRuns,
      maxConcurrentRuns: Number(values.maxConcurrentRuns),
      agentMode: values.agentMode,
      runMode: values.runMode,
      runModel: values.runModel.trim() === '' ? null : values.runModel.trim(),
      triageModel:
        values.triageModel.trim() === '' ? null : values.triageModel.trim(),
      autopilot: values.autopilot,
      spendCeilingUsd:
        values.spendCeiling.trim() === '' ? null : Number(values.spendCeiling),
      autoTriage: values.autoTriage,
      triageCeilingUsd:
        values.triageCeiling.trim() === ''
          ? null
          : Number(values.triageCeiling),
      autoMerge: values.autoMerge,
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
    const named = Object.entries(result.fieldErrors ?? {}).flatMap(
      ([field, message]) => {
        const name = formFields[field];
        return name && message ? [{ name, message }] : [];
      },
    );
    for (const { name, message } of named) {
      setError(name, { type: 'server', message });
    }
    if (named.length === 0) {
      setError('root.server', { message: result.error });
    }
  });

  return (
    <Stack gap={3}>
      <form aria-label="Agent settings" onSubmit={submit}>
        <Stack gap={3}>
          <Stack gap={1} id="repository-path">
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
            <div>
              <Button
                type="button"
                size="small"
                variant="ghost"
                loading={detecting}
                onClick={detect}
              >
                Detect
              </Button>
            </div>
          </Stack>
          <div id="check-command">
            <CheckCommandField
              registration={register('checkCommand')}
              value={watch('checkCommand')}
              error={checkError}
              candidates={candidates}
              onUse={(candidate) => setValue('checkCommand', candidate)}
            >
              <Text tag="p" fontSize="small" color="muted">
                The command that defines green for the repository. Start runs
                must see it pass before they open a pull request; leave empty to
                follow the repository's own instructions.
              </Text>
            </CheckCommandField>
          </div>
          <Stack gap={1} id="prepare-command">
            <Label htmlFor={prepareId}>Prepare command</Label>
            <TextInput
              {...register('prepareCommand')}
              id={prepareId}
              placeholder="npm ci"
              autoComplete="off"
              aria-invalid={prepareError ? true : undefined}
              aria-describedby={prepareError ? prepareErrorId : undefined}
            />
            <Text tag="p" fontSize="small" color="muted">
              Run in each new worktree before its run starts, so the run finds
              its dependencies ready. A failing command starts no run.
            </Text>
            <FieldError id={prepareErrorId} reason={prepareError} />
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
          {/* Blocks has no radio group yet, so a Stack carries the role (T1163). */}
          <Stack
            gap={1}
            role="radiogroup"
            aria-labelledby={runModeLabelId}
            id="run-mode"
          >
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
          <Stack gap={1} id="run-model">
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
          <Stack gap={1}>
            <Label htmlFor={triageModelId}>Triage model</Label>
            <TextInput
              {...register('triageModel')}
              id={triageModelId}
              placeholder="The run model"
              autoComplete="off"
              aria-invalid={triageModelError ? true : undefined}
              aria-describedby={
                triageModelError ? triageModelErrorId : undefined
              }
            />
            <Text tag="p" fontSize="small" color="muted">
              The model Triage runs start on; leave empty to use the run model.
            </Text>
            <FieldError id={triageModelErrorId} reason={triageModelError} />
          </Stack>
          <Stack gap={1} id="autopilot">
            <Inline gap={2} alignY="center">
              <Switch {...register('autopilot')} id={autopilotId} />
              <Label htmlFor={autopilotId}>Autopilot</Label>
            </Inline>
            <Text tag="p" fontSize="small" color="muted">
              While on, and the Project has an Active Cycle, Tandembike starts
              runs for the Cycle's ready work by itself, as many as Parallel
              runs allow. Turning it off leaves running runs alone.
            </Text>
          </Stack>
          <Stack gap={1} id="spend-ceiling">
            <Label htmlFor={ceilingId}>Spend ceiling (USD)</Label>
            <TextInput
              {...register('spendCeiling')}
              id={ceilingId}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="No ceiling"
              aria-invalid={ceilingError ? true : undefined}
              aria-describedby={ceilingError ? ceilingErrorId : undefined}
            />
            <FieldError id={ceilingErrorId} reason={ceilingError} />
          </Stack>
          <Stack gap={1}>
            <Inline gap={2} alignY="center">
              <Switch {...register('autoMerge')} id={autoMergeId} />
              <Label htmlFor={autoMergeId}>Auto-merge</Label>
            </Inline>
            <Text tag="p" fontSize="small" color="muted">
              While on, a run merges its own PR once its checks, its review and
              every acceptance criterion pass, then finishes the Ticket; it
              hands off for your approval when they do not. Off, every PR waits
              for Approve merge. It applies to runs started after you change it,
              with or without Autopilot.
            </Text>
          </Stack>
          <Stack gap={1} id="auto-triage">
            <Inline gap={2} alignY="center">
              <Switch {...register('autoTriage')} id={autoTriageId} />
              <Label htmlFor={autoTriageId}>Auto-triage</Label>
            </Inline>
            <Text tag="p" fontSize="small" color="muted">
              While on, Tandembike starts one Triage run at a time on Intake
              work in the Backlog and every Cycle, oldest first, with or without
              an Active Cycle. Each ends in a proposal for you to approve.
              Turning it off leaves a running Triage run alone.
            </Text>
          </Stack>
          <Stack gap={1} id="triage-ceiling">
            <Label htmlFor={triageCeilingId}>Triage ceiling (USD)</Label>
            <TextInput
              {...register('triageCeiling')}
              id={triageCeilingId}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="No ceiling"
              aria-invalid={triageCeilingError ? true : undefined}
              aria-describedby={
                triageCeilingError ? triageCeilingErrorId : undefined
              }
            />
            <Text tag="p" fontSize="small" color="muted">
              The most Auto-triage may spend per day. Triage pauses once today's
              spend reaches it and starts again tomorrow.
            </Text>
            <FieldError id={triageCeilingErrorId} reason={triageCeilingError} />
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
