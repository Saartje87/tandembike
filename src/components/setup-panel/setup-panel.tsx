import { Heading, Stack, Tag, Text } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { formatCost } from '../../app/lib/format-cost';
import {
  projectSettingsFieldPath,
  type SettingsField,
  settingsFieldOfStage,
  settingsPath,
} from '../../app/lib/paths';
import {
  agentStages,
  type ProjectAgentCommands,
  playbookCommand,
} from '../../tickets/agent-commands';
import { type CostUnit, ceilingsByUnit } from '../../tickets/cost-unit';
import type { ProjectAgentSettings } from '../../tickets/tickets';
import type { AgentKindOption } from '../agent-settings/agent-kind-options';
import { AppLink } from '../app-link/app-link';

/** The Stages by the names the glossary gives them. */
const stageNames = {
  triage: 'Triage',
  start: 'Start',
  startEpic: 'Start on an Epic',
  spec: 'Spec',
  plan: 'Plan',
  spar: 'Spar',
  retro: 'Retro',
  merge: 'Merge',
} as const;

const stageOrder = [
  'triage',
  'start',
  'startEpic',
  'spec',
  'plan',
  'spar',
  'retro',
  'merge',
] as const;

export type SetupPanelProps = {
  projectId: number;
  settings: ProjectAgentSettings;
  commands: ProjectAgentCommands;
  /** What Autopilot has spent on the Active Cycle, or null without one. */
  cycleSpend: number | null;
  /** What Auto-triage has spent today. */
  triageSpend: number;
  /**
   * The unit of the agent Autopilot starts, the Project's default (ADR
   * 0051): the spend and the ceilings shown are in it.
   */
  unit: CostUnit;
  /**
   * Every Agent kind with whether it can run (ADR 0051); Copilot's gets a
   * status row (T1368). Left out, none shows.
   */
  agentKinds?: AgentKindOption[];
};

type ItemProps = {
  label: string;
  href: string;
  children: ReactNode;
};

/** One setting: its name linking to its field on Settings, and its value. */
const Item: FC<ItemProps> = ({ label, href, children }) => (
  <li>
    <Stack gap={0}>
      <Text fontSize="small" fontWeight="strong">
        <AppLink href={href}>{label}</AppLink>
      </Text>
      <Text fontSize="small">{children}</Text>
    </Stack>
  </li>
);

type GroupProps = { title: string; children: ReactNode };

const Group: FC<GroupProps> = ({ title, children }) => (
  <Stack gap={2}>
    <Heading level={3} fontSize="medium">
      {title}
    </Heading>
    <Stack gap={2} listStyle="none" role="list" aria-label={title} asChild>
      <ul>{children}</ul>
    </Stack>
  </Stack>
);

const ceilingText = (ceiling: number | null, unit: CostUnit, spent: string) =>
  ceiling === null
    ? `None set · ${spent}`
    : `${formatCost(ceiling, unit)} · ${spent}`;

/**
 * Flow's Setup (ADR 0044): what this Project runs at each Stage, its Check
 * and Prepare commands, run mode and model, and its ceilings with their
 * spend in the default agent's unit, read-only, each linking to its field on
 * Settings.
 */
export const SetupPanel: FC<SetupPanelProps> = ({
  projectId,
  settings,
  commands,
  cycleSpend,
  triageSpend,
  unit,
  agentKinds = [],
}) => {
  const copilot = agentKinds.find(({ kind }) => kind === 'copilot');
  const field = (name: SettingsField) =>
    projectSettingsFieldPath(projectId, name);
  return (
    <Stack gap={4}>
      <Group title="Stages">
        {stageOrder.map((stage) => {
          const entry = agentStages.find(
            (candidate) => candidate.stage === stage,
          );
          if (!entry) {
            return null;
          }
          const own = commands[entry.field];
          return (
            <Item
              key={stage}
              label={stageNames[stage]}
              href={field(settingsFieldOfStage(entry.field))}
            >
              <code>{own ?? playbookCommand(entry.skill)}</code>{' '}
              <Tag>{own === null ? "Playbook's" : "Project's own"}</Tag>
            </Item>
          );
        })}
      </Group>
      <Group title="Commands">
        <Item label="Check command" href={field('check-command')}>
          {settings.checkCommand === null ? (
            'None set: runs follow the repository’s own instructions.'
          ) : (
            <code>{settings.checkCommand}</code>
          )}
        </Item>
        <Item label="Prepare command" href={field('prepare-command')}>
          {settings.prepareCommand === null ? (
            'None set: a run starts right after its worktree is made.'
          ) : (
            <code>{settings.prepareCommand}</code>
          )}
        </Item>
      </Group>
      <Group title="Runs">
        <Item label="Agent run mode" href={field('run-mode')}>
          {settings.runMode === 'auto'
            ? 'Auto: a classifier decides, so runs wait less.'
            : 'Default: asks before each tool call the repository has not allowed.'}
        </Item>
        <Item label="Claude Code run model" href={field('run-model')}>
          {settings.models['claude-code'].runModel ?? 'Your default model'}
        </Item>
        {copilot && (
          <Item label="Copilot" href={field('default-agent')}>
            {copilot.available
              ? 'Ready: Copilot can run here.'
              : copilot.reason}
          </Item>
        )}
      </Group>
      <Group title="Ceilings">
        <Item
          label="Spend ceiling"
          href={field(
            unit === 'usd' ? 'spend-ceiling' : 'spend-ceiling-ai-credits',
          )}
        >
          {ceilingText(
            ceilingsByUnit(
              settings.spendCeilingUsd,
              settings.spendCeilingAiCredits,
            )[unit],
            unit,
            cycleSpend === null
              ? 'no Active Cycle'
              : `${formatCost(cycleSpend, unit)} spent this Cycle`,
          )}
        </Item>
        <Item
          label="Triage ceiling"
          href={field(
            unit === 'usd' ? 'triage-ceiling' : 'triage-ceiling-ai-credits',
          )}
        >
          {ceilingText(
            ceilingsByUnit(
              settings.triageCeilingUsd,
              settings.triageCeilingAiCredits,
            )[unit],
            unit,
            `${formatCost(triageSpend, unit)} spent today`,
          )}
        </Item>
        <Item label="Machine cap and ceiling" href={settingsPath()}>
          Shared by every Project, on the machine Settings page.
        </Item>
      </Group>
    </Stack>
  );
};
