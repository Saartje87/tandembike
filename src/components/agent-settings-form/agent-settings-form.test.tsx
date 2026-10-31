import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startSetup } from '../../app/conversations/actions';
import { setProjectAgentSettings } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import type { ProjectAgentSettings } from '../../tickets/tickets';
import { AgentSettingsForm } from './agent-settings-form';

vi.mock('../../app/conversations/actions', () => ({ startSetup: vi.fn() }));
vi.mock('../../app/projects/actions', () => ({
  setProjectAgentSettings: vi.fn(),
}));

const unset: ProjectAgentSettings = {
  repositoryPath: null,
  parallelRuns: false,
  maxConcurrentRuns: 3,
  agentMode: false,
};
const set: ProjectAgentSettings = { ...unset, repositoryPath: '/repo' };

describe('AgentSettingsForm', () => {
  beforeEach(() => {
    vi.mocked(setProjectAgentSettings).mockReset();
    vi.mocked(setProjectAgentSettings).mockResolvedValue({ ok: true });
  });

  it('hides the run controls and disables agent mode with a reason while the path is unset', () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={unset} />);

    expect(screen.getByLabelText('Repository path')).toHaveValue('');
    expect(
      screen.queryByRole('switch', { name: 'Parallel runs' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Max concurrent Start runs'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Agent mode' })).toBeDisabled();
    expect(
      screen.getByText(/Set a repository path to turn on agent mode/),
    ).toBeInTheDocument();
  });

  it('saves a new path', async () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={unset} />);

    await userEvent.type(screen.getByLabelText('Repository path'), '/repo');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith({
        projectId: 3,
        repositoryPath: '/repo',
        parallelRuns: false,
        maxConcurrentRuns: 3,
        agentMode: false,
      }),
    );
  });

  it('saves Parallel runs, the cap and agent mode once a path is set', async () => {
    renderWithTheme(<AgentSettingsForm projectId={3} settings={set} />);

    await userEvent.click(
      screen.getByRole('switch', { name: 'Parallel runs' }),
    );
    const cap = screen.getByLabelText('Max concurrent Start runs');
    await userEvent.clear(cap);
    await userEvent.type(cap, '5');
    await userEvent.click(screen.getByRole('switch', { name: 'Agent mode' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(setProjectAgentSettings).toHaveBeenCalledWith({
        projectId: 3,
        repositoryPath: '/repo',
        parallelRuns: true,
        maxConcurrentRuns: 5,
        agentMode: true,
      }),
    );
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
