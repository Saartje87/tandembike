import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setProjectAgentSettings } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { AutopilotBar } from './autopilot-bar';

vi.mock('../../app/projects/actions', () => ({
  setProjectAgentSettings: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(setProjectAgentSettings).mockReset();
  vi.mocked(setProjectAgentSettings).mockResolvedValue({ ok: true });
});

describe('AutopilotBar', () => {
  it('shows the switch and the Cycle spend against the ceiling', () => {
    renderWithTheme(
      <AutopilotBar
        projectId={3}
        autopilot
        spendCeilingUsd={5}
        spendUsd={0.75}
      />,
    );

    expect(screen.getByRole('switch', { name: 'Autopilot' })).toBeChecked();
    expect(screen.getByText('$0.75 of $5.00')).toBeInTheDocument();
    expect(screen.queryByText(/paused/)).not.toBeInTheDocument();
  });

  it('says paused: over ceiling with the amount once the spend reaches the ceiling, switch still on', () => {
    renderWithTheme(
      <AutopilotBar
        projectId={3}
        autopilot
        spendCeilingUsd={5}
        spendUsd={5.2}
      />,
    );

    expect(
      screen.getByText('paused: over ceiling ($5.20)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Autopilot' })).toBeChecked();
  });

  it('does not say paused with the switch off', () => {
    renderWithTheme(
      <AutopilotBar
        projectId={3}
        autopilot={false}
        spendCeilingUsd={5}
        spendUsd={9}
      />,
    );

    expect(screen.queryByText(/paused/)).not.toBeInTheDocument();
  });

  it('turns Autopilot on through the same setting as the settings page', async () => {
    renderWithTheme(
      <AutopilotBar
        projectId={3}
        autopilot={false}
        spendCeilingUsd={5}
        spendUsd={0}
      />,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Autopilot' }));

    expect(setProjectAgentSettings).toHaveBeenCalledWith({
      projectId: 3,
      autopilot: true,
    });
  });

  it('shows a refusal, such as no ceiling, and puts the switch back', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'Set a Spend ceiling first.',
      fieldErrors: { spendCeilingUsd: 'Set a Spend ceiling first.' },
    });
    renderWithTheme(
      <AutopilotBar
        projectId={3}
        autopilot={false}
        spendCeilingUsd={null}
        spendUsd={0}
      />,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Autopilot' }));

    expect(
      await screen.findByText('Set a Spend ceiling first.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Autopilot' }),
      ).not.toBeChecked();
    });
  });
});
