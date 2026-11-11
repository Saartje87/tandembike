'use client';

import {
  Alert,
  Grid,
  GridItem,
  Label,
  Radio,
  Select,
  Stack,
  Text,
} from '@blockle/blocks';
import { type FC, type ReactNode, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { fieldRefusal, rootRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { setProjectAgentSettings } from '../../app/projects/actions';
import type { Conversation } from '../../conversations/conversations';
import type { AgentKind } from '../../tickets/agent-kind';
import type { AgentRunMode } from '../../tickets/agent-run-mode';
import type { ProjectAgentSettings } from '../../tickets/tickets';
import { FieldError } from '../field-error/field-error';
import { ProjectSetup } from '../project-setup/project-setup';
import { SettingSwitch } from '../setting-switch/setting-switch';
import { SettingsSection } from '../settings-section/settings-section';
import { SettingsTextField } from '../settings-text-field/settings-text-field';
import {
  type AgentKindOption,
  claudeCodeOnly,
  showsCopilot,
} from './agent-kind-options';

export type AgentSettingsProps = {
  projectId: number;
  /** The Project's saved settings. */
  settings: ProjectAgentSettings;
  /** The Project's latest Setup Conversation, if it ever held one. */
  latestSetup?: Conversation | null;
  /**
   * Every Agent kind with whether it can run now (ADR 0051); the default
   * selector offers only those that can. Claude Code alone when left out.
   */
  agentKinds?: AgentKindOption[];
};

type AgentValues = {
  defaultAgentKind: AgentKind;
  runMode: AgentRunMode;
  runModel: string;
  triageModel: string;
  copilotRunModel: string;
  copilotTriageModel: string;
};

/** The form field each field of a refusal names. */
const formFields: Record<string, keyof AgentValues> = {
  defaultAgentKind: 'defaultAgentKind',
  runMode: 'runMode',
  'models.claude-code.runModel': 'runModel',
  'models.claude-code.triageModel': 'triageModel',
  'models.copilot.runModel': 'copilotRunModel',
  'models.copilot.triageModel': 'copilotTriageModel',
};

const valuesOf = (settings: ProjectAgentSettings): AgentValues => ({
  defaultAgentKind: settings.defaultAgentKind,
  runMode: settings.runMode,
  runModel: settings.models['claude-code'].runModel ?? '',
  triageModel: settings.models['claude-code'].triageModel ?? '',
  copilotRunModel: settings.models.copilot.runModel ?? '',
  copilotTriageModel: settings.models.copilot.triageModel ?? '',
});

/** A model field's text as the setting, `null` when blank: the default. */
const modelOf = (text: string) => (text.trim() === '' ? null : text.trim());

type ModelGroupProps = { title: string; children: ReactNode };

/** One Agent kind's models, named by its title. */
const ModelGroup: FC<ModelGroupProps> = ({ title, children }) => {
  const titleId = useId();
  return (
    <GridItem colSpan={[12, 6]}>
      <Stack gap={3} role="group" aria-labelledby={titleId}>
        <Text tag="p" id={titleId} fontWeight="bold">
          {title}
        </Text>
        {children}
      </Stack>
    </GridItem>
  );
};

/**
 * Agent, on a Project's Settings (T1436): the default agent, the run mode
 * and each kind's models, saved with the section's Save, and agent mode,
 * saved at once, with Setup under it while it is on. Its controls are
 * disabled until a repository path is saved.
 */
export const AgentSettings: FC<AgentSettingsProps> = ({
  projectId,
  settings,
  latestSetup = null,
  agentKinds = claudeCodeOnly,
}) => {
  const [agentMode, setAgentMode] = useState(settings.agentMode);
  const [offer, setOffer] = useState(false);
  const agentKindId = useId();
  const agentKindHintId = useId();
  const agentKindErrorId = useId();
  const runModeLabelId = useId();
  const runModeErrorId = useId();
  const {
    formState: { errors, isDirty, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<AgentValues>({ defaultValues: valuesOf(settings) });
  const locked = settings.repositoryPath === null;
  const copilot = showsCopilot(settings, agentKinds);
  const agentKindError = errors.defaultAgentKind?.message;
  const runModeError = errors.runMode?.message;
  const serverError = errors.root?.server?.message;
  // A kind that cannot run shows disabled with its reason (T1368); the saved
  // one stays selectable, so saving other settings keeps it.
  const kindReasons = agentKinds.flatMap((option) =>
    option.available ? [] : [{ kind: option.kind, reason: option.reason }],
  );

  const submit = handleSubmit(async (values) => {
    const result = await callAction(
      () =>
        setProjectAgentSettings({
          projectId,
          defaultAgentKind: values.defaultAgentKind,
          runMode: values.runMode,
          // Each kind's models apply to its own runs only (ADR 0051).
          models: {
            'claude-code': {
              runModel: modelOf(values.runModel),
              triageModel: modelOf(values.triageModel),
            },
            ...(copilot
              ? {
                  copilot: {
                    runModel: modelOf(values.copilotRunModel),
                    triageModel: modelOf(values.copilotTriageModel),
                  },
                }
              : {}),
          },
        }),
      'The agent settings could not be saved. Try again.',
    );
    if (result.ok) {
      reset(values);
      return;
    }
    let named = false;
    for (const [field, name] of Object.entries(formFields)) {
      const message = fieldRefusal(result, field);
      if (message) {
        setError(name, { type: 'server', message });
        named = true;
      }
    }
    if (!named) {
      setError('root.server', { message: rootRefusal(result) });
    }
  });

  return (
    <form aria-label="Agent settings" onSubmit={submit}>
      <SettingsSection
        section="agent"
        title="Agent"
        description="Which agent runs your Tickets, and how freely."
        help={
          <>
            <Text tag="p" fontSize="small" color="muted">
              Default asks before each tool call the repository has not allowed.
              Auto lets a classifier decide, so runs wait less: in the spike it
              allowed a hard reset, writes outside the repository, an outbound
              POST and a push without asking. Calls it cannot decide still ask
              you. On Copilot, auto approves what Copilot's Assisted permissions
              judge safe and asks you about the rest.
            </Text>
            <Text tag="p" fontSize="small" color="muted">
              Changing the agent leaves Conversations already started on their
              own agent. Each kind's models apply to its own runs only, and a
              run can still change models itself.
            </Text>
          </>
        }
        dirty={isDirty}
        saving={isSubmitting}
        onDiscard={() => reset()}
        locked={locked}
      >
        <Stack gap={1} id="default-agent">
          <Label htmlFor={agentKindId}>Default agent</Label>
          <Select
            {...register('defaultAgentKind')}
            id={agentKindId}
            disabled={locked}
            aria-invalid={agentKindError ? true : undefined}
            aria-describedby={
              agentKindError
                ? `${agentKindHintId} ${agentKindErrorId}`
                : agentKindHintId
            }
          >
            {agentKinds.map(({ kind, label, available }) => (
              <option
                key={kind}
                value={kind}
                disabled={!available && kind !== settings.defaultAgentKind}
              >
                {available ? label : `${label}: cannot run`}
              </option>
            ))}
          </Select>
          <Text id={agentKindHintId} tag="p" fontSize="small" color="muted">
            New Conversations and Autopilot's runs start on it.
          </Text>
          {kindReasons.map(({ kind, reason }) => (
            <Text key={kind} tag="p" fontSize="small" color="muted">
              {reason}
            </Text>
          ))}
          <FieldError id={agentKindErrorId} reason={agentKindError} />
        </Stack>
        <SettingSwitch
          projectId={projectId}
          setting="agentMode"
          label="Agent mode"
          hint="Run Agents on this Project's Tickets from the Board."
          checked={settings.agentMode}
          disabled={locked}
          onSaved={(on) => {
            setAgentMode(on);
            setOffer(on);
          }}
        >
          <ProjectSetup
            projectId={projectId}
            agentMode={agentMode && !locked}
            offer={offer ? 'agent-mode' : null}
            latestSetup={latestSetup}
          />
        </SettingSwitch>
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
          <Radio {...register('runMode')} value="default" disabled={locked}>
            Default: asks before each tool call the repository has not allowed.
          </Radio>
          <Radio {...register('runMode')} value="auto" disabled={locked}>
            Auto: a classifier decides, so runs wait less.
          </Radio>
          <FieldError id={runModeErrorId} reason={runModeError} />
        </Stack>
        <Grid rowGap={5} columnGap={[0, 5]}>
          <ModelGroup title="Claude Code models">
            <SettingsTextField
              registration={register('runModel')}
              label="Run model"
              anchor="run-model"
              placeholder="Its default model"
              hint="Leave empty for Claude Code's default."
              error={errors.runModel?.message}
              disabled={locked}
            />
            <SettingsTextField
              registration={register('triageModel')}
              label="Triage model"
              placeholder="The run model"
              hint="Leave empty to use the run model."
              error={errors.triageModel?.message}
              disabled={locked}
            />
          </ModelGroup>
          {copilot && (
            <ModelGroup title="Copilot models">
              <SettingsTextField
                registration={register('copilotRunModel')}
                label="Run model"
                anchor="copilot-run-model"
                placeholder="Copilot's default model"
                hint="Leave empty for Copilot's default."
                error={errors.copilotRunModel?.message}
                disabled={locked}
              />
              <SettingsTextField
                registration={register('copilotTriageModel')}
                label="Triage model"
                placeholder="The run model"
                hint="Leave empty to use the run model."
                error={errors.copilotTriageModel?.message}
                disabled={locked}
              />
            </ModelGroup>
          )}
        </Grid>
        {serverError && <Alert intent="danger">{serverError}</Alert>}
      </SettingsSection>
    </form>
  );
};
