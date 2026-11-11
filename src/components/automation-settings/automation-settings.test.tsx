// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setProjectAgentSettings } from '../../app/projects/actions';
import { projectAgentSettings } from '../../test/fixtures';
import { renderWithTheme } from '../../test/render';
import { AutomationSettings } from './automation-settings';

vi.mock('../../app/projects/actions', () => ({
  setProjectAgentSettings: vi.fn(),
}));

const set = projectAgentSettings({ repositoryPath: '/repo' });
const withCopilot = [
  { kind: 'claude-code', label: 'Claude Code', available: true },
  { kind: 'copilot', label: 'Copilot', available: true },
] as const;

const card = () => screen.getByRole('region', { name: 'Automation' });
const toggle = (name: string) => screen.getByRole('switch', { name });
const save = () =>
  userEvent.click(within(card()).getByRole('button', { name: 'Save' }));

describe('AutomationSettings', () => {
  beforeEach(() => {
    vi.mocked(setProjectAgentSettings).mockReset();
    vi.mocked(setProjectAgentSettings).mockResolvedValue({ ok: true });
  });

  it('puts each ceiling under its switch, disabled while the switch is off', () => {
    renderWithTheme(
      <AutomationSettings
        projectId={3}
        settings={{ ...set, autoTriage: true, triageCeilingUsd: 2 }}
      />,
    );

    expect(screen.getByLabelText('Spend ceiling (USD)')).toBeDisabled();
    expect(screen.getByLabelText('Triage ceiling (USD)')).toBeEnabled();
    expect(screen.getByLabelText('Triage ceiling (USD)')).toHaveValue(2);
    const order = [
      toggle('Autopilot'),
      screen.getByLabelText('Spend ceiling (USD)'),
      toggle('Auto-merge'),
      toggle('Auto-triage'),
      screen.getByLabelText('Triage ceiling (USD)'),
    ];
    for (const [index, element] of order.slice(1).entries()) {
      expect(
        order[index].compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('saves each switch at once, on its own', async () => {
    renderWithTheme(
      <AutomationSettings
        projectId={3}
        settings={{ ...set, autopilot: true, spendCeilingUsd: 20 }}
      />,
    );

    await userEvent.click(toggle('Auto-merge'));
    await userEvent.click(toggle('Autopilot'));

    expect(setProjectAgentSettings).toHaveBeenNthCalledWith(1, {
      projectId: 3,
      autoMerge: true,
    });
    expect(setProjectAgentSettings).toHaveBeenNthCalledWith(2, {
      projectId: 3,
      autopilot: false,
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Spend ceiling (USD)')).toBeDisabled(),
    );
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('turns a switch on at once when its ceiling is saved', async () => {
    renderWithTheme(
      <AutomationSettings
        projectId={3}
        settings={{ ...set, triageCeilingUsd: 2 }}
      />,
    );

    await userEvent.click(toggle('Auto-triage'));

    expect(setProjectAgentSettings).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      autoTriage: true,
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Triage ceiling (USD)')).toBeEnabled(),
    );
  });

  it('holds a switch turned on without a saved ceiling, so the section Save sends it with the ceiling (ADR 0053)', async () => {
    renderWithTheme(<AutomationSettings projectId={3} settings={set} />);

    await userEvent.click(toggle('Autopilot'));

    expect(setProjectAgentSettings).not.toHaveBeenCalled();
    expect(toggle('Autopilot')).toBeChecked();
    expect(screen.getByLabelText('Spend ceiling (USD)')).toBeEnabled();

    await userEvent.type(screen.getByLabelText('Spend ceiling (USD)'), '25.5');
    await save();

    expect(setProjectAgentSettings).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      autopilot: true,
      spendCeilingUsd: 25.5,
      triageCeilingUsd: null,
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull(),
    );
    expect(toggle('Autopilot')).toBeChecked();
  });

  it('lets go of a held switch turned back off, with nothing to save', async () => {
    renderWithTheme(<AutomationSettings projectId={3} settings={set} />);

    await userEvent.click(toggle('Auto-triage'));
    expect(within(card()).getByRole('button', { name: 'Save' })).toBeVisible();
    await userEvent.click(toggle('Auto-triage'));

    expect(toggle('Auto-triage')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(setProjectAgentSettings).not.toHaveBeenCalled();
  });

  it('shows the refusal of a held switch under the ceiling it names', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'Set a Triage ceiling before turning on Auto-triage.',
      fieldErrors: {
        triageCeilingUsd: 'Set a Triage ceiling before turning on Auto-triage.',
      },
    });
    renderWithTheme(<AutomationSettings projectId={3} settings={set} />);

    await userEvent.click(toggle('Auto-triage'));
    await save();

    expect(
      screen.getByLabelText('Triage ceiling (USD)'),
    ).toHaveAccessibleDescription(
      expect.stringContaining(
        'Set a Triage ceiling before turning on Auto-triage.',
      ),
    );
    expect(toggle('Auto-triage')).toBeChecked();
  });

  it('saves an edited ceiling with the section Save, and shows its refusal under it', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({
      ok: false,
      error: 'Enter an amount in dollars above 0.',
      fieldErrors: { spendCeilingUsd: 'Enter an amount in dollars above 0.' },
    });
    renderWithTheme(
      <AutomationSettings
        projectId={3}
        settings={{ ...set, autopilot: true, spendCeilingUsd: 20 }}
      />,
    );
    const ceiling = screen.getByLabelText('Spend ceiling (USD)');

    await userEvent.clear(ceiling);
    await userEvent.type(ceiling, '0');
    await save();

    expect(setProjectAgentSettings).toHaveBeenCalledWith({
      projectId: 3,
      spendCeilingUsd: 0,
      triageCeilingUsd: null,
    });
    await waitFor(() =>
      expect(ceiling).toHaveAccessibleDescription(
        expect.stringContaining('Enter an amount in dollars above 0.'),
      ),
    );
    expect(ceiling).toHaveValue(0);
  });

  describe('AI-credit ceilings (ADR 0051)', () => {
    it('shows none while Copilot cannot run and is not the default', () => {
      renderWithTheme(<AutomationSettings projectId={3} settings={set} />);

      expect(screen.queryByLabelText('Spend ceiling (AI credits)')).toBeNull();
      expect(screen.queryByLabelText('Triage ceiling (AI credits)')).toBeNull();
    });

    it('shows them beside the dollar ones once Copilot can run, and saves them', async () => {
      renderWithTheme(
        <AutomationSettings
          projectId={3}
          settings={{
            ...set,
            autoTriage: true,
            triageCeilingUsd: 2,
            spendCeilingAiCredits: 300,
          }}
          agentKinds={[...withCopilot]}
        />,
      );

      expect(screen.getByLabelText('Spend ceiling (AI credits)')).toHaveValue(
        300,
      );
      await userEvent.type(
        screen.getByLabelText('Triage ceiling (AI credits)'),
        '40',
      );
      await save();

      expect(setProjectAgentSettings).toHaveBeenCalledWith({
        projectId: 3,
        spendCeilingUsd: null,
        spendCeilingAiCredits: 300,
        triageCeilingUsd: 2,
        triageCeilingAiCredits: 40,
      });
    });

    it("holds a switch by the ceiling in the default agent's unit", async () => {
      renderWithTheme(
        <AutomationSettings
          projectId={3}
          settings={{
            ...set,
            defaultAgentKind: 'copilot',
            spendCeilingUsd: 20,
          }}
        />,
      );

      await userEvent.click(toggle('Autopilot'));

      expect(setProjectAgentSettings).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Spend ceiling (AI credits)')).toBeEnabled();
    });
  });

  it('disables every control without a repository path, pointing to Repository', () => {
    renderWithTheme(
      <AutomationSettings projectId={3} settings={projectAgentSettings()} />,
    );

    expect(
      within(card()).getByText(/Set a repository path first/),
    ).toBeInTheDocument();
    for (const name of ['Autopilot', 'Auto-merge', 'Auto-triage']) {
      expect(toggle(name)).toBeDisabled();
    }
  });
});
