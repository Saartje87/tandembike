// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setProjectAgentSettings } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { SettingSwitch } from './setting-switch';

vi.mock('../../app/projects/actions', () => ({
  setProjectAgentSettings: vi.fn(),
}));

describe('SettingSwitch', () => {
  beforeEach(() => {
    vi.mocked(setProjectAgentSettings).mockReset();
    vi.mocked(setProjectAgentSettings).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves only its own setting at once, and says Saved briefly', async () => {
    const onSaved = vi.fn();
    renderWithTheme(
      <SettingSwitch
        projectId={3}
        setting="parallelRuns"
        label="Parallel runs"
        hint="Let Starts overlap."
        checked={false}
        onSaved={onSaved}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Parallel runs' });

    expect(toggle).toHaveAccessibleDescription('Let Starts overlap.');

    await userEvent.click(toggle);

    expect(setProjectAgentSettings).toHaveBeenCalledWith({
      projectId: 3,
      parallelRuns: true,
    });
    expect(toggle).toBeChecked();
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.queryByText('Saved')).toBeNull(), {
      timeout: 3000,
    });
  });

  it('puts itself back and shows the reason it names when refused', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'Not saved.',
      fieldErrors: {
        agentMode: 'Set a repository path before turning on agent mode.',
      },
    });
    const onSaved = vi.fn();
    renderWithTheme(
      <SettingSwitch
        projectId={3}
        setting="agentMode"
        label="Agent mode"
        checked={false}
        onSaved={onSaved}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Agent mode' });

    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(
      screen.getByText('Set a repository path before turning on agent mode.'),
    ).toBeInTheDocument();
    expect(toggle).toHaveAccessibleDescription(
      'Set a repository path before turning on agent mode.',
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows a refusal of another field, such as a ceiling, as its own', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'Not saved.',
      fieldErrors: { spendCeilingUsd: 'Set a Spend ceiling first.' },
    });
    renderWithTheme(
      <SettingSwitch
        projectId={3}
        setting="autopilot"
        label="Autopilot"
        checked
      />,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Autopilot' }));

    expect(
      await screen.findByText('Set a Spend ceiling first.'),
    ).toBeInTheDocument();
  });

  it('leaves the change to its section instead of saving, when it holds it', async () => {
    const hold = vi.fn(() => true);
    renderWithTheme(
      <SettingSwitch
        projectId={3}
        setting="autopilot"
        label="Autopilot"
        checked={false}
        hold={hold}
      />,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Autopilot' }));

    expect(hold).toHaveBeenCalledWith(true);
    expect(setProjectAgentSettings).not.toHaveBeenCalled();
  });

  it('keeps the saved value when the page has not caught up yet', async () => {
    renderWithTheme(
      <SettingSwitch
        projectId={3}
        setting="autoMerge"
        label="Auto-merge"
        checked={false}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Auto-merge' });

    await userEvent.click(toggle);
    await act(async () => {});

    expect(toggle).toBeChecked();
  });

  it('is disabled when told so', () => {
    renderWithTheme(
      <SettingSwitch
        projectId={3}
        setting="autoMerge"
        label="Auto-merge"
        checked={false}
        disabled
      />,
    );

    expect(screen.getByRole('switch', { name: 'Auto-merge' })).toBeDisabled();
  });

  it('shows what hangs off it underneath', () => {
    renderWithTheme(
      <SettingSwitch
        projectId={3}
        setting="autoMerge"
        label="Auto-merge"
        checked={false}
      >
        <p>Ceilings</p>
      </SettingSwitch>,
    );

    expect(screen.getByText('Ceilings')).toBeInTheDocument();
  });
});
