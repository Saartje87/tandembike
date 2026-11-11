// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { startSetup } from '../../app/conversations/actions';
import {
  detectProjectRepository,
  setProjectAgentSettings,
} from '../../app/projects/actions';
import { projectAgentSettings } from '../../test/fixtures';
import { renderWithTheme } from '../../test/render';
import { AgentSettingsForm } from './agent-settings-form';

vi.mock('../../app/conversations/actions', () => ({ startSetup: vi.fn() }));
vi.mock('../../app/projects/actions', () => ({
  detectProjectRepository: vi.fn(),
  setProjectAgentSettings: vi.fn(),
}));

const unset = projectAgentSettings();
const set = projectAgentSettings({ repositoryPath: '/repo' });

describe('AgentSettingsForm', () => {
  beforeEach(() => {
    vi.mocked(setProjectAgentSettings).mockReset();
    vi.mocked(setProjectAgentSettings).mockResolvedValue({ ok: true });
  });

  it('detects Check command candidates for the path in the field and offers them', async () => {
    vi.mocked(detectProjectRepository).mockResolvedValue({
      ok: true,
      repository: {
        ok: true,
        path: '/other',
        defaultBranch: 'main',
        remote: null,
        referenceTemplate: null,
        checkCommands: ['npm run check', 'make test'],
      },
    });
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);
    const path = screen.getByLabelText('Repository path');
    await userEvent.clear(path);
    await userEvent.type(path, '/other');

    await userEvent.click(screen.getByRole('button', { name: 'Detect' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Use make test' }),
    );

    expect(detectProjectRepository).toHaveBeenCalledWith({ path: '/other' });
    expect(screen.getByLabelText('Check command')).toHaveValue('make test');
  });

  it('shows why detection failed on the path field', async () => {
    vi.mocked(detectProjectRepository).mockResolvedValue({
      ok: false,
      error: 'This folder is not a git repository: it has no .git inside.',
    });
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    await userEvent.click(screen.getByRole('button', { name: 'Detect' }));

    expect(
      screen.getByLabelText('Repository path'),
    ).toHaveAccessibleDescription(
      'This folder is not a git repository: it has no .git inside.',
    );
  });

  it('shows a detection whose action throws on the path field (T1322)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(detectProjectRepository).mockRejectedValue(
      new Error('network down'),
    );
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    await userEvent.click(screen.getByRole('button', { name: 'Detect' }));

    await waitFor(() =>
      expect(
        screen.getByLabelText('Repository path'),
      ).toHaveAccessibleDescription(
        'The repository could not be detected. Try again.',
      ),
    );
    expect(screen.getByLabelText('Repository path')).toHaveValue('/repo');
    expect(screen.getByRole('button', { name: 'Detect' })).toBeEnabled();
  });

  it('shows a save whose action throws as an alert and keeps the draft (T1322)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(setProjectAgentSettings).mockRejectedValue(
      new Error('network down'),
    );
    renderWithTheme(<AgentSettingsForm projectId={3} settings={unset} />);

    await userEvent.type(screen.getByLabelText('Repository path'), '/next');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The agent settings could not be saved. Try again.',
    );
    expect(screen.getByLabelText('Repository path')).toHaveValue('/next');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('hides the run controls and disables agent mode with a reason while the path is unset', () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={unset} />);

    expect(screen.getByLabelText('Repository path')).toHaveValue('');
    expect(
      screen.queryByRole('switch', { name: 'Parallel runs' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Agent mode' })).toBeDisabled();
    expect(
      screen.getByText(/Set a repository path to turn on agent mode/),
    ).toBeInTheDocument();
  });

  it('shows saved settings as on in their registered Switches', () => {
    renderWithTheme(
      <AgentSettingsForm
        projectId={3}
        settings={{ ...set, parallelRuns: true, agentMode: true }}
      />,
    );

    // Blocks 3.5 styles the Switch from its input's `:checked` (T1132), so a
    // checked input is what makes it look on.
    for (const name of ['Parallel runs', 'Agent mode']) {
      const toggle = screen.getByRole('switch', { name });
      expect(toggle).toBeChecked();
      expect(toggle.matches(':checked')).toBe(true);
    }
  });

  it('saves a new path', async () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={unset} />);

    await userEvent.type(screen.getByLabelText('Repository path'), '/repo');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith({
        projectId: 3,
        repositoryPath: '/repo',
        checkCommand: null,
        prepareCommand: null,
        parallelRuns: false,
        agentMode: false,
        runMode: 'default',
        models: { 'claude-code': { runModel: null, triageModel: null } },
        autopilot: false,
        spendCeilingUsd: null,
        autoTriage: false,
        triageCeilingUsd: null,
        autoMerge: false,
        defaultAgentKind: 'claude-code',
      }),
    );
  });

  it('offers as the default Agent only the kinds that can run, and saves the choice (ADR 0051)', async () => {
    renderWithTheme(
      <AgentSettingsForm
        projectId={3}
        settings={set}
        agentKinds={[
          { kind: 'claude-code', label: 'Claude Code', available: true },
          {
            kind: 'copilot',
            label: 'Copilot',
            available: false,
            reason: 'Copilot cannot run here yet.',
          },
        ]}
      />,
    );

    const agent = screen.getByLabelText('Agent');
    expect(agent).toHaveValue('claude-code');
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Claude Code']);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith(
        expect.objectContaining({ defaultAgentKind: 'claude-code' }),
      ),
    );
  });

  it('saves a default Agent of another kind that can run', async () => {
    renderWithTheme(
      <AgentSettingsForm
        projectId={3}
        settings={set}
        agentKinds={[
          { kind: 'claude-code', label: 'Claude Code', available: true },
          { kind: 'copilot', label: 'Copilot', available: true },
        ]}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Agent'), 'copilot');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith(
        expect.objectContaining({ defaultAgentKind: 'copilot' }),
      ),
    );
  });

  it('shows the saved Check command and saves an edit of it', async () => {
    renderWithTheme(
      <AgentSettingsForm
        projectId={3}
        settings={{ ...set, checkCommand: 'npm run check' }}
      />,
    );

    const field = screen.getByLabelText('Check command');
    expect(field).toHaveValue('npm run check');
    await userEvent.clear(field);
    await userEvent.type(field, 'make test');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 3, checkCommand: 'make test' }),
      ),
    );
  });

  it('saves a cleared Check command as null', async () => {
    renderWithTheme(
      <AgentSettingsForm
        projectId={3}
        settings={{ ...set, checkCommand: 'npm test' }}
      />,
    );

    await userEvent.clear(screen.getByLabelText('Check command'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith(
        expect.objectContaining({ checkCommand: null }),
      ),
    );
  });

  it('shows the saved Prepare command, saves an edit of it and saves a cleared one as null', async () => {
    renderWithTheme(
      <AgentSettingsForm
        projectId={3}
        settings={{ ...set, prepareCommand: 'npm ci' }}
      />,
    );

    const field = screen.getByLabelText('Prepare command');
    expect(field).toHaveValue('npm ci');
    await userEvent.clear(field);
    await userEvent.type(field, 'pnpm i');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith(
        expect.objectContaining({ prepareCommand: 'pnpm i' }),
      ),
    );

    await userEvent.clear(field);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ prepareCommand: null }),
      ),
    );
  });

  it('saves Parallel runs and agent mode once a path is set, with no run count of its own (T1330)', async () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    expect(screen.queryByLabelText(/max concurrent/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Parallel runs' }),
    ).toHaveAccessibleDescription(/up to the machine cap set in Settings/);
    await userEvent.click(
      screen.getByRole('switch', { name: 'Parallel runs' }),
    );
    await userEvent.click(screen.getByRole('switch', { name: 'Agent mode' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith({
        projectId: 3,
        repositoryPath: '/repo',
        checkCommand: null,
        prepareCommand: null,
        parallelRuns: true,
        agentMode: true,
        runMode: 'default',
        models: { 'claude-code': { runModel: null, triageModel: null } },
        autopilot: false,
        spendCeilingUsd: null,
        autoTriage: false,
        triageCeilingUsd: null,
        autoMerge: false,
        defaultAgentKind: 'claude-code',
      }),
    );
  });

  it('saves the run mode with its trade-off shown, and the run model', async () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    expect(screen.getByRole('radio', { name: /Default/ })).toBeChecked();
    expect(screen.getByText(/hard reset/)).toBeInTheDocument();
    expect(screen.getByText(/outbound POST/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Auto/ }));
    await userEvent.type(
      screen.getByLabelText('Claude Code run model'),
      ' claude-opus-5-5 ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          runMode: 'auto',
          models: {
            'claude-code': { runModel: 'claude-opus-5-5', triageModel: null },
          },
        }),
      ),
    );
  });

  it('saves the triage model, blank as none', async () => {
    renderWithTheme(
      <AgentSettingsForm
        projectId={3}
        settings={{
          ...set,
          models: {
            ...set.models,
            'claude-code': { runModel: null, triageModel: 'claude-haiku-5' },
          },
        }}
      />,
    );

    const field = screen.getByLabelText('Claude Code triage model');
    expect(field).toHaveValue('claude-haiku-5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          models: {
            'claude-code': { runModel: null, triageModel: 'claude-haiku-5' },
          },
        }),
      ),
    );

    await userEvent.clear(field);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          models: { 'claude-code': { runModel: null, triageModel: null } },
        }),
      ),
    );
  });

  it('saves Autopilot with its Spend ceiling in dollars', async () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    expect(screen.getByRole('switch', { name: 'Autopilot' })).not.toBeChecked();
    await userEvent.type(screen.getByLabelText('Spend ceiling (USD)'), '25.5');
    await userEvent.click(screen.getByRole('switch', { name: 'Autopilot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith(
        expect.objectContaining({ autopilot: true, spendCeilingUsd: 25.5 }),
      ),
    );
  });

  it('shows Auto-merge and saves it on its own, without Autopilot', async () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    expect(
      screen.getByRole('switch', { name: 'Auto-merge' }),
    ).not.toBeChecked();
    await userEvent.click(screen.getByRole('switch', { name: 'Auto-merge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith(
        expect.objectContaining({ autoMerge: true, autopilot: false }),
      ),
    );
  });

  it('shows Auto-merge on when the Project has it on', () => {
    renderWithTheme(
      <AgentSettingsForm
        projectId={3}
        settings={{ ...set, autoMerge: true }}
      />,
    );

    expect(screen.getByRole('switch', { name: 'Auto-merge' })).toBeChecked();
  });

  it('saves Auto-triage with its Triage ceiling in dollars', async () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    expect(
      screen.getByRole('switch', { name: 'Auto-triage' }),
    ).not.toBeChecked();
    await userEvent.type(screen.getByLabelText('Triage ceiling (USD)'), '4.5');
    await userEvent.click(screen.getByRole('switch', { name: 'Auto-triage' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith(
        expect.objectContaining({ autoTriage: true, triageCeilingUsd: 4.5 }),
      ),
    );
  });

  it('shows the Triage ceiling refusal on its field', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'Set a Triage ceiling before turning on Auto-triage.',
      fieldErrors: {
        triageCeilingUsd: 'Set a Triage ceiling before turning on Auto-triage.',
      },
    });
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Auto-triage' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Set a Triage ceiling before turning on Auto-triage.',
      ),
    ).toBeInTheDocument();
    expect(setProjectAgentSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoTriage: true, triageCeilingUsd: null }),
    );
  });

  it('sends no ceiling when the field is empty, and shows the refusal on it', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'Set a Spend ceiling before turning on Autopilot.',
      fieldErrors: {
        spendCeilingUsd: 'Set a Spend ceiling before turning on Autopilot.',
      },
    });
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Autopilot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Set a Spend ceiling before turning on Autopilot.',
      ),
    ).toBeInTheDocument();
    expect(setProjectAgentSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autopilot: true, spendCeilingUsd: null }),
    );
  });

  it('shows a run mode refusal on the field', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'Choose default or auto.',
      fieldErrors: { runMode: 'Choose default or auto.' },
    });
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Choose default or auto.'),
    ).toBeInTheDocument();
  });

  it('shows a refusal under the field it names and keeps the draft', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'There is no directory at this path.',
      fieldErrors: { repositoryPath: 'There is no directory at this path.' },
    });
    renderWithTheme(<AgentSettingsForm projectId={3} settings={unset} />);

    await userEvent.type(screen.getByLabelText('Repository path'), '/nope');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('There is no directory at this path.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Repository path')).toHaveValue('/nope');
  });

  it('offers Setup after agent mode is turned on, without starting one', async () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);
    expect(
      screen.queryByRole('button', { name: 'Run Setup' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Agent mode' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/Agent mode is on\. Run Setup/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Run Setup' })).toBeVisible();
    expect(startSetup).not.toHaveBeenCalled();
  });

  it('offers Setup after Parallel runs is turned on while agent mode is on', async () => {
    renderWithTheme(
      <AgentSettingsForm
        projectId={3}
        settings={{ ...set, agentMode: true }}
      />,
    );

    await userEvent.click(
      screen.getByRole('switch', { name: 'Parallel runs' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/Parallel runs is on\. Run Setup/),
    ).toBeVisible();
  });

  it('does not offer Setup when saving other settings', async () => {
    renderWithTheme(
      <AgentSettingsForm
        projectId={3}
        settings={{ ...set, agentMode: true }}
      />,
    );

    await userEvent.type(screen.getByLabelText('Repository path'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(setProjectAgentSettings).toHaveBeenCalled());
    expect(screen.queryByText(/Run Setup to check/)).not.toBeInTheDocument();
  });
});
