// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { noAgentCommands } from '../../tickets/agent-commands';
import type { ProjectAgentSettings } from '../../tickets/tickets';
import { SetupPanel, type SetupPanelProps } from './setup-panel';

const defaults: ProjectAgentSettings = {
  repositoryPath: '/repo',
  checkCommand: null,
  prepareCommand: null,
  parallelRuns: false,
  agentMode: true,
  runMode: 'default',
  runModel: null,
  triageModel: null,
  autopilot: false,
  spendCeilingUsd: null,
  autoTriage: false,
  triageCeilingUsd: null,
  autoMerge: false,
};

const renderPanel = (props: Partial<SetupPanelProps> = {}) =>
  renderWithTheme(
    <SetupPanel
      projectId={3}
      settings={defaults}
      commands={noAgentCommands}
      cycleSpendUsd={null}
      triageSpendUsd={0}
      {...props}
    />,
  );

/** Each item of list `name` as its text. */
const items = (name: string) =>
  within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('SetupPanel', () => {
  it("shows the Playbook's command for each Stage, and that nothing else is set", () => {
    renderPanel();

    expect(items('Stages')).toEqual([
      "Triage/tandembike:triage Playbook's",
      "Start/tandembike:implement Playbook's",
      "Start on an Epic/tandembike:implement-epic Playbook's",
      "Spec/tandembike:spec Playbook's",
      "Plan/tandembike:plan Playbook's",
      "Spar/tandembike:spar Playbook's",
      "Retro/tandembike:retro Playbook's",
      "Merge/tandembike:merge Playbook's",
    ]);
    expect(items('Commands')).toEqual([
      'Check commandNone set: runs follow the repository’s own instructions.',
      'Prepare commandNone set: a run starts right after its worktree is made.',
    ]);
    expect(items('Runs')).toEqual([
      'Agent run modeDefault: asks before each tool call the repository has not allowed.',
      'Run modelYour default model',
    ]);
    expect(items('Ceilings')).toEqual([
      'Spend ceilingNone set · no Active Cycle',
      'Triage ceilingNone set · $0.00 spent today',
      'Machine cap and ceilingShared by every Project, on the machine Settings page.',
    ]);
  });

  it("shows the Project's own commands, settings and spend", () => {
    renderPanel({
      settings: {
        ...defaults,
        checkCommand: 'npm run check',
        prepareCommand: 'npm ci',
        runMode: 'auto',
        runModel: 'claude-opus-5-5',
        spendCeilingUsd: 20,
        triageCeilingUsd: 2,
      },
      commands: { ...noAgentCommands, startCommand: '/implement' },
      cycleSpendUsd: 4.5,
      triageSpendUsd: 0.25,
    });

    expect(items('Stages')[1]).toBe("Start/implement Project's own");
    expect(items('Commands')).toEqual([
      'Check commandnpm run check',
      'Prepare commandnpm ci',
    ]);
    expect(items('Runs')).toEqual([
      'Agent run modeAuto: a classifier decides, so runs wait less.',
      'Run modelclaude-opus-5-5',
    ]);
    expect(items('Ceilings').slice(0, 2)).toEqual([
      'Spend ceiling$20.00 · $4.50 spent this Cycle',
      'Triage ceiling$2.00 · $0.25 spent today',
    ]);
  });

  it('links each item to its field on Settings, and the machine limits to the machine Settings', () => {
    renderPanel();

    const href = (name: string) =>
      screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Start on an Epic')).toBe(
      '/project/3/settings#start-epic-command',
    );
    expect(href('Prepare command')).toBe('/project/3/settings#prepare-command');
    expect(href('Agent run mode')).toBe('/project/3/settings#run-mode');
    expect(href('Run model')).toBe('/project/3/settings#run-model');
    expect(href('Spend ceiling')).toBe('/project/3/settings#spend-ceiling');
    expect(href('Triage ceiling')).toBe('/project/3/settings#triage-ceiling');
    expect(href('Machine cap and ceiling')).toBe('/settings');
  });
});
