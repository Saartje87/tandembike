// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startSetup } from '../../app/conversations/actions';
import { setProjectAgentSettings } from '../../app/projects/actions';
import { projectAgentSettings } from '../../test/fixtures';
import { renderWithTheme } from '../../test/render';
import { AgentSettings } from './agent-settings';

vi.mock('../../app/conversations/actions', () => ({ startSetup: vi.fn() }));
vi.mock('../../app/projects/actions', () => ({
  setProjectAgentSettings: vi.fn(),
}));

const unset = projectAgentSettings();
const set = projectAgentSettings({ repositoryPath: '/repo' });
const withCopilot = [
  { kind: 'claude-code', label: 'Claude Code', available: true },
  { kind: 'copilot', label: 'Copilot', available: true },
] as const;

const card = () => screen.getByRole('region', { name: 'Agent' });
const group = (name: string) => within(screen.getByRole('group', { name }));
const save = () =>
  userEvent.click(within(card()).getByRole('button', { name: 'Save' }));

describe('AgentSettings', () => {
  beforeEach(() => {
    vi.mocked(setProjectAgentSettings).mockReset();
    vi.mocked(setProjectAgentSettings).mockResolvedValue({ ok: true });
  });

  it('shows the models grouped per agent kind, without Copilot while it cannot run and keeps nothing', () => {
    renderWithTheme(
      <AgentSettings
        projectId={3}
        settings={projectAgentSettings({
          repositoryPath: '/repo',
          models: {
            'claude-code': { runModel: 'opus', triageModel: 'haiku' },
            copilot: { runModel: null, triageModel: null },
          },
        })}
      />,
    );

    expect(group('Claude Code models').getByLabelText('Run model')).toHaveValue(
      'opus',
    );
    expect(
      group('Claude Code models').getByLabelText('Triage model'),
    ).toHaveValue('haiku');
    expect(screen.queryByRole('group', { name: 'Copilot models' })).toBeNull();
  });

  it("saves its own fields with its Save, Copilot's models once Copilot can run, blank as the agent's default", async () => {
    renderWithTheme(
      <AgentSettings
        projectId={3}
        settings={projectAgentSettings({
          repositoryPath: '/repo',
          runMode: 'auto',
          models: {
            'claude-code': { runModel: 'opus', triageModel: null },
            copilot: { runModel: 'gpt-5.5', triageModel: null },
          },
        })}
        agentKinds={[...withCopilot]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await userEvent.selectOptions(
      screen.getByLabelText('Default agent'),
      'copilot',
    );
    await userEvent.click(screen.getByRole('radio', { name: /^Default/ }));
    await userEvent.clear(group('Copilot models').getByLabelText('Run model'));
    await userEvent.type(
      group('Copilot models').getByLabelText('Triage model'),
      'gpt-5-mini',
    );
    await save();

    expect(setProjectAgentSettings).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      defaultAgentKind: 'copilot',
      runMode: 'default',
      models: {
        'claude-code': { runModel: 'opus', triageModel: null },
        copilot: { runModel: null, triageModel: 'gpt-5-mini' },
      },
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull(),
    );
  });

  it('sends no Copilot models while it shows none', async () => {
    renderWithTheme(<AgentSettings projectId={3} settings={set} />);

    await userEvent.type(
      group('Claude Code models').getByLabelText('Run model'),
      'opus',
    );
    await save();

    expect(setProjectAgentSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        models: { 'claude-code': { runModel: 'opus', triageModel: null } },
      }),
    );
  });

  it('shows a kind that cannot run disabled in the default selector, with its reason (ADR 0051, T1368)', () => {
    renderWithTheme(
      <AgentSettings
        projectId={3}
        settings={set}
        agentKinds={[
          { kind: 'claude-code', label: 'Claude Code', available: true },
          {
            kind: 'copilot',
            label: 'Copilot',
            available: false,
            reason: 'Copilot is not signed in. Sign in with copilot login.',
          },
        ]}
      />,
    );

    expect(screen.getByLabelText('Default agent')).toHaveValue('claude-code');
    expect(
      screen.getByRole('option', { name: 'Copilot: cannot run' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Copilot is not signed in. Sign in with copilot login.'),
    ).toBeInTheDocument();
  });

  it('shows a refusal under the model it names and keeps the draft', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'Not saved.',
      fieldErrors: {
        'models.claude-code.triageModel': 'Enter a model name without spaces.',
      },
    });
    renderWithTheme(<AgentSettings projectId={3} settings={set} />);
    const triage = group('Claude Code models').getByLabelText('Triage model');

    await userEvent.type(triage, 'claude haiku');
    await save();

    await waitFor(() =>
      expect(triage).toHaveAccessibleDescription(
        expect.stringContaining('Enter a model name without spaces.'),
      ),
    );
    expect(triage).toHaveValue('claude haiku');
  });

  it('saves agent mode at once and offers Setup under it, without starting one', async () => {
    renderWithTheme(<AgentSettings projectId={3} settings={set} />);
    expect(screen.queryByRole('button', { name: 'Run Setup' })).toBeNull();

    await userEvent.click(screen.getByRole('switch', { name: 'Agent mode' }));

    expect(setProjectAgentSettings).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      agentMode: true,
    });
    expect(
      await screen.findByText(/Agent mode is on\. Run Setup/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Run Setup' })).toBeVisible();
    expect(startSetup).not.toHaveBeenCalled();
  });

  it('keeps Setup under agent mode while it is on', () => {
    renderWithTheme(
      <AgentSettings projectId={3} settings={{ ...set, agentMode: true }} />,
    );

    expect(screen.getByRole('button', { name: 'Run Setup' })).toBeVisible();
  });

  it('disables its controls without a repository path, pointing to Repository', () => {
    renderWithTheme(<AgentSettings projectId={3} settings={unset} />);

    expect(
      within(card()).getByText(/Set a repository path first/),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Agent mode' })).toBeDisabled();
    expect(screen.getByLabelText('Default agent')).toBeDisabled();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    expect(
      group('Claude Code models').getByLabelText('Run model'),
    ).toBeDisabled();
  });
});
