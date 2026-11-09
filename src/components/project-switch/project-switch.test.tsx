import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setProjectAgentSettings } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { ProjectSwitch } from './project-switch';

vi.mock('../../app/projects/actions', () => ({
  setProjectAgentSettings: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(setProjectAgentSettings).mockReset();
  vi.mocked(setProjectAgentSettings).mockResolvedValue({ ok: true });
});

describe('ProjectSwitch', () => {
  it('turns Auto-triage on through the settings Server Action', async () => {
    renderWithTheme(
      <ProjectSwitch
        projectId={3}
        setting="autoTriage"
        checked={false}
        ceiling={{ usd: 2, settingsHref: '/project/3/settings#triage-ceiling' }}
      />,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Auto-triage' }));

    expect(setProjectAgentSettings).toHaveBeenCalledWith({
      projectId: 3,
      autoTriage: true,
    });
  });

  it('turns Autopilot off', async () => {
    renderWithTheme(
      <ProjectSwitch projectId={3} setting="autopilot" checked />,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Autopilot' }));

    expect(setProjectAgentSettings).toHaveBeenCalledWith({
      projectId: 3,
      autopilot: false,
    });
  });

  it('is disabled without its ceiling and links to set it', () => {
    renderWithTheme(
      <ProjectSwitch
        projectId={3}
        setting="autopilot"
        checked={false}
        ceiling={{
          usd: null,
          settingsHref: '/project/3/settings#spend-ceiling',
        }}
      />,
    );

    expect(screen.getByRole('switch', { name: 'Autopilot' })).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'Set a Spend ceiling' }),
    ).toHaveAttribute('href', '/project/3/settings#spend-ceiling');
  });

  it("shows the Triage ceiling's refusal and puts the switch back", async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'Not saved.',
      fieldErrors: { triageCeilingUsd: 'Set a Triage ceiling first.' },
    });
    renderWithTheme(
      <ProjectSwitch projectId={3} setting="autoTriage" checked={false} />,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Auto-triage' }));

    expect(
      await screen.findByText('Set a Triage ceiling first.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Auto-triage' }),
      ).not.toBeChecked();
    });
  });
});
