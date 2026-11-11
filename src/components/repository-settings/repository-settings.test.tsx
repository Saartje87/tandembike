// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { startSetup } from '../../app/conversations/actions';
import {
  detectProjectRepository,
  setProjectAgentSettings,
} from '../../app/projects/actions';
import { projectAgentSettings } from '../../test/fixtures';
import { renderWithTheme } from '../../test/render';
import { RepositorySettings } from './repository-settings';

vi.mock('../../app/conversations/actions', () => ({ startSetup: vi.fn() }));
vi.mock('../../app/projects/actions', () => ({
  detectProjectRepository: vi.fn(),
  setProjectAgentSettings: vi.fn(),
}));

const unset = projectAgentSettings();
const set = projectAgentSettings({
  repositoryPath: '/repo',
  checkCommand: 'npm test',
  prepareCommand: 'npm ci',
});

const card = () => screen.getByRole('region', { name: 'Repository' });
const save = () =>
  userEvent.click(within(card()).getByRole('button', { name: 'Save' }));

describe('RepositorySettings', () => {
  beforeEach(() => {
    vi.mocked(setProjectAgentSettings).mockReset();
    vi.mocked(setProjectAgentSettings).mockResolvedValue({ ok: true });
  });

  it('shows the saved path and commands, with no Save until one is edited', () => {
    renderWithTheme(<RepositorySettings projectId={3} settings={set} />);

    expect(screen.getByLabelText('Repository path')).toHaveValue('/repo');
    expect(screen.getByLabelText('Check command')).toHaveValue('npm test');
    expect(screen.getByLabelText('Prepare command')).toHaveValue('npm ci');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('saves only its own text fields with its Save, blank commands as none', async () => {
    renderWithTheme(<RepositorySettings projectId={3} settings={set} />);

    await userEvent.clear(screen.getByLabelText('Check command'));
    await userEvent.type(screen.getByLabelText('Check command'), 'make check');
    await userEvent.clear(screen.getByLabelText('Prepare command'));
    await save();

    expect(setProjectAgentSettings).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      repositoryPath: '/repo',
      checkCommand: 'make check',
      prepareCommand: null,
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull(),
    );
  });

  it('shows a refusal under the field it names and keeps the draft', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'There is no directory at this path.',
      fieldErrors: { repositoryPath: 'There is no directory at this path.' },
    });
    renderWithTheme(<RepositorySettings projectId={3} settings={set} />);

    await userEvent.type(screen.getByLabelText('Repository path'), '/nope');
    await save();

    expect(
      await screen.findByText('There is no directory at this path.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Repository path'),
    ).toHaveAccessibleDescription('There is no directory at this path.');
    expect(screen.getByLabelText('Repository path')).toHaveValue('/repo/nope');
  });

  it('shows a save whose action throws as an alert and keeps the draft (T1322)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(setProjectAgentSettings).mockRejectedValue(
      new Error('network down'),
    );
    renderWithTheme(<RepositorySettings projectId={3} settings={unset} />);

    await userEvent.type(screen.getByLabelText('Repository path'), '/next');
    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The repository settings could not be saved. Try again.',
    );
    expect(screen.getByLabelText('Repository path')).toHaveValue('/next');
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
    renderWithTheme(<RepositorySettings projectId={3} settings={set} />);
    const path = screen.getByLabelText('Repository path');
    await userEvent.clear(path);
    await userEvent.type(path, '/other');

    await userEvent.click(screen.getByRole('button', { name: 'Detect' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Use make test' }),
    );

    expect(detectProjectRepository).toHaveBeenCalledWith({ path: '/other' });
    expect(screen.getByLabelText('Check command')).toHaveValue('make test');
    expect(within(card()).getByRole('button', { name: 'Save' })).toBeVisible();
  });

  it('shows why detection failed on the path field', async () => {
    vi.mocked(detectProjectRepository).mockResolvedValue({
      ok: false,
      error: 'This folder is not a git repository: it has no .git inside.',
    });
    renderWithTheme(<RepositorySettings projectId={3} settings={set} />);

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
    renderWithTheme(<RepositorySettings projectId={3} settings={set} />);

    await userEvent.click(screen.getByRole('button', { name: 'Detect' }));

    await waitFor(() =>
      expect(
        screen.getByLabelText('Repository path'),
      ).toHaveAccessibleDescription(
        'The repository could not be detected. Try again.',
      ),
    );
    expect(screen.getByRole('button', { name: 'Detect' })).toBeEnabled();
  });

  it('saves Parallel runs at once, on its own', async () => {
    renderWithTheme(<RepositorySettings projectId={3} settings={set} />);

    await userEvent.click(
      screen.getByRole('switch', { name: 'Parallel runs' }),
    );

    expect(setProjectAgentSettings).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      parallelRuns: true,
    });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('disables Parallel runs while no repository path is saved', () => {
    renderWithTheme(<RepositorySettings projectId={3} settings={unset} />);

    expect(
      screen.getByRole('switch', { name: 'Parallel runs' }),
    ).toBeDisabled();
  });

  it('offers Setup under Parallel runs once it is turned on with agent mode on, without starting one', async () => {
    renderWithTheme(
      <RepositorySettings
        projectId={3}
        settings={{ ...set, agentMode: true }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Run Setup' })).toBeNull();

    await userEvent.click(
      screen.getByRole('switch', { name: 'Parallel runs' }),
    );

    expect(
      await screen.findByText(/Parallel runs is on\. Run Setup/),
    ).toBeVisible();
    expect(startSetup).not.toHaveBeenCalled();
  });

  it('does not offer Setup when Parallel runs is turned off', async () => {
    renderWithTheme(
      <RepositorySettings
        projectId={3}
        settings={{ ...set, agentMode: true, parallelRuns: true }}
      />,
    );

    await userEvent.click(
      screen.getByRole('switch', { name: 'Parallel runs' }),
    );

    await waitFor(() => expect(setProjectAgentSettings).toHaveBeenCalled());
    expect(screen.queryByText(/Run Setup to check/)).toBeNull();
  });
});
