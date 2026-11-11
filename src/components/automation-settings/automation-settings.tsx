'use client';

import { Alert, Box, Divider, Grid, GridItem, Text } from '@blockle/blocks';
import { type FC, type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';

import { fieldRefusal, rootRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { setProjectAgentSettings } from '../../app/projects/actions';
import { agentCostUnits } from '../../tickets/cost-unit';
import type { ProjectAgentSettings } from '../../tickets/tickets';
import {
  type AgentKindOption,
  claudeCodeOnly,
  showsCopilot,
} from '../agent-settings/agent-kind-options';
import { SettingSwitch } from '../setting-switch/setting-switch';
import { SettingsSection } from '../settings-section/settings-section';
import { SettingsTextField } from '../settings-text-field/settings-text-field';

export type AutomationSettingsProps = {
  projectId: number;
  /** The Project's saved settings. */
  settings: ProjectAgentSettings;
  /** Every Agent kind with whether it can run now (ADR 0051). */
  agentKinds?: AgentKindOption[];
};

type AutomationValues = {
  spendCeiling: string;
  spendCeilingAiCredits: string;
  triageCeiling: string;
  triageCeilingAiCredits: string;
  /** Autopilot turned on, held until its ceiling saves with it. */
  holdAutopilot: boolean;
  /** Auto-triage turned on, held until its ceiling saves with it. */
  holdAutoTriage: boolean;
};

type CeilingField = Exclude<
  keyof AutomationValues,
  'holdAutopilot' | 'holdAutoTriage'
>;

/** The form field each field of a refusal names. */
const formFields: Record<string, CeilingField> = {
  spendCeilingUsd: 'spendCeiling',
  spendCeilingAiCredits: 'spendCeilingAiCredits',
  triageCeilingUsd: 'triageCeiling',
  triageCeilingAiCredits: 'triageCeilingAiCredits',
};

/** A ceiling as the form's text, blank for none. */
const ceilingText = (ceiling: number | null) =>
  ceiling === null ? '' : String(ceiling);

/** A ceiling field's text as the setting, `null` when blank. */
const ceilingOf = (text: string | undefined) =>
  text === undefined || text.trim() === '' ? null : Number(text);

const valuesOf = (settings: ProjectAgentSettings): AutomationValues => ({
  spendCeiling: ceilingText(settings.spendCeilingUsd),
  spendCeilingAiCredits: ceilingText(settings.spendCeilingAiCredits),
  triageCeiling: ceilingText(settings.triageCeilingUsd),
  triageCeilingAiCredits: ceilingText(settings.triageCeilingAiCredits),
  holdAutopilot: false,
  holdAutoTriage: false,
});

type CeilingsProps = { children: ReactNode };

/** A switch's ceilings, under it and set in from it. */
const Ceilings: FC<CeilingsProps> = ({ children }) => (
  <Box paddingInlineStart={[0, 6]}>
    <Grid rowGap={3} columnGap={[0, 3]}>
      {children}
    </Grid>
  </Box>
);

/**
 * Automation, on a Project's Settings (T1437): Autopilot, Auto-merge and
 * Auto-triage, each saved at once, with their ceilings under them, saved
 * with the section's Save and disabled while their switch is off. A switch
 * turned on before its ceiling is saved is held as an unsaved edit, so the
 * Save sends it with the ceiling (ADR 0053). Disabled until a repository
 * path is saved.
 */
export const AutomationSettings: FC<AutomationSettingsProps> = ({
  projectId,
  settings,
  agentKinds = claudeCodeOnly,
}) => {
  const [on, setOn] = useState({
    autopilot: settings.autopilot,
    autoTriage: settings.autoTriage,
  });
  const {
    formState: { defaultValues, errors, isDirty, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<AutomationValues>({ defaultValues: valuesOf(settings) });
  const locked = settings.repositoryPath === null;
  const copilot = showsCopilot(settings, agentKinds);
  const serverError = errors.root?.server?.message;
  const held = {
    autopilot: watch('holdAutopilot'),
    autoTriage: watch('holdAutoTriage'),
  };
  // A switch checks its ceiling in the default agent's unit (ADR 0051).
  const unit = agentCostUnits[settings.defaultAgentKind];
  const savedCeiling = {
    autopilot: ceilingOf(
      unit === 'usd'
        ? defaultValues?.spendCeiling
        : defaultValues?.spendCeilingAiCredits,
    ),
    autoTriage: ceilingOf(
      unit === 'usd'
        ? defaultValues?.triageCeiling
        : defaultValues?.triageCeilingAiCredits,
    ),
  };

  /** Holds a switch's change as an edit when it cannot save on its own. */
  const holdOf =
    (setting: 'autopilot' | 'autoTriage') =>
    (next: boolean): boolean => {
      const field =
        setting === 'autopilot' ? 'holdAutopilot' : 'holdAutoTriage';
      if (held[setting] && !next) {
        setValue(field, false, { shouldDirty: true });
        return true;
      }
      if (next && !on[setting] && savedCeiling[setting] === null) {
        setValue(field, true, { shouldDirty: true });
        return true;
      }
      return false;
    };

  const savedOf = (setting: 'autopilot' | 'autoTriage') => (next: boolean) =>
    setOn((current) => ({ ...current, [setting]: next }));

  const submit = handleSubmit(async (values) => {
    const result = await callAction(
      () =>
        setProjectAgentSettings({
          projectId,
          ...(values.holdAutopilot ? { autopilot: true } : {}),
          ...(values.holdAutoTriage ? { autoTriage: true } : {}),
          spendCeilingUsd: ceilingOf(values.spendCeiling),
          ...(copilot
            ? { spendCeilingAiCredits: ceilingOf(values.spendCeilingAiCredits) }
            : {}),
          triageCeilingUsd: ceilingOf(values.triageCeiling),
          ...(copilot
            ? {
                triageCeilingAiCredits: ceilingOf(
                  values.triageCeilingAiCredits,
                ),
              }
            : {}),
        }),
      'The automation settings could not be saved. Try again.',
    );
    if (result.ok) {
      setOn((current) => ({
        autopilot: current.autopilot || values.holdAutopilot,
        autoTriage: current.autoTriage || values.holdAutoTriage,
      }));
      reset({ ...values, holdAutopilot: false, holdAutoTriage: false });
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

  const ceiling = (
    name: CeilingField,
    label: string,
    anchor: string,
    enabled: boolean,
    hint?: string,
  ) => (
    <GridItem colSpan={[12, 6]}>
      <SettingsTextField
        registration={register(name)}
        label={label}
        anchor={anchor}
        placeholder="No ceiling"
        hint={hint}
        error={errors[name]?.message}
        number
        disabled={locked || !enabled}
      />
    </GridItem>
  );

  const autopilotOn = on.autopilot || held.autopilot;
  const autoTriageOn = on.autoTriage || held.autoTriage;

  return (
    <form aria-label="Automation settings" onSubmit={submit}>
      <SettingsSection
        section="automation"
        title="Automation"
        description="What the factory may do without asking you."
        help={
          <>
            <Text tag="p" fontSize="small" color="muted">
              Autopilot starts runs for the Active Cycle's ready work, as many
              as Parallel runs allow, until its spend reaches the Spend ceiling.
              Auto-triage starts one Triage run at a time on Intake work, oldest
              first, until today's spend reaches the Triage ceiling; it starts
              again tomorrow. Each needs a ceiling in the unit of the default
              agent before it turns on.
            </Text>
            <Text tag="p" fontSize="small" color="muted">
              Auto-merge lets a run merge its own PR once its checks, its review
              and every acceptance criterion pass, then finish the Ticket; it
              hands off for your approval when they do not. It applies to runs
              started after you change it, with or without Autopilot.
            </Text>
            <Text tag="p" fontSize="small" color="muted">
              Turning a switch off leaves running runs alone.
            </Text>
          </>
        }
        dirty={isDirty}
        saving={isSubmitting}
        onDiscard={() => reset()}
        locked={locked}
      >
        <div id="autopilot">
          <SettingSwitch
            projectId={projectId}
            setting="autopilot"
            label="Autopilot"
            hint="Start the Active Cycle's ready Tickets on its own."
            checked={autopilotOn}
            disabled={locked}
            hold={holdOf('autopilot')}
            onSaved={savedOf('autopilot')}
          >
            <Ceilings>
              {ceiling(
                'spendCeiling',
                'Spend ceiling (USD)',
                'spend-ceiling',
                autopilotOn,
              )}
              {copilot &&
                ceiling(
                  'spendCeilingAiCredits',
                  'Spend ceiling (AI credits)',
                  'spend-ceiling-ai-credits',
                  autopilotOn,
                  'For Copilot runs, in GitHub AI credits.',
                )}
            </Ceilings>
          </SettingSwitch>
        </div>
        <Divider />
        <SettingSwitch
          projectId={projectId}
          setting="autoMerge"
          label="Auto-merge"
          hint="Runs merge their own PRs once everything passes."
          checked={settings.autoMerge}
          disabled={locked}
        />
        <Divider />
        <div id="auto-triage">
          <SettingSwitch
            projectId={projectId}
            setting="autoTriage"
            label="Auto-triage"
            hint="Triage Intake work, one run at a time, with or without an Active Cycle."
            checked={autoTriageOn}
            disabled={locked}
            hold={holdOf('autoTriage')}
            onSaved={savedOf('autoTriage')}
          >
            <Ceilings>
              {ceiling(
                'triageCeiling',
                'Triage ceiling (USD)',
                'triage-ceiling',
                autoTriageOn,
                'The most Auto-triage may spend per day.',
              )}
              {copilot &&
                ceiling(
                  'triageCeilingAiCredits',
                  'Triage ceiling (AI credits)',
                  'triage-ceiling-ai-credits',
                  autoTriageOn,
                )}
            </Ceilings>
          </SettingSwitch>
        </div>
        {serverError && <Alert intent="danger">{serverError}</Alert>}
      </SettingsSection>
    </form>
  );
};
