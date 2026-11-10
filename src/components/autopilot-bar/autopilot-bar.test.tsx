// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setProjectAgentSettings } from '../../app/projects/actions';
import { aFootprint } from '../../test/fixtures';
import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import { AutopilotBar } from './autopilot-bar';

vi.mock('../../app/projects/actions', () => ({
  setProjectAgentSettings: vi.fn(),
}));

showOpenPopovers();

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
        cycleFootprint={null}
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
        cycleFootprint={null}
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
        cycleFootprint={null}
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
        cycleFootprint={null}
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
        cycleFootprint={null}
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

  describe("the Cycle's Footprint (T1348)", () => {
    it('shows it labelled Cycle: after the spend, its scope first in the tooltip', async () => {
      renderWithTheme(
        <AutopilotBar
          projectId={3}
          autopilot
          spendCeilingUsd={5}
          spendUsd={0.75}
          cycleFootprint={aFootprint({ energyWh: 1200, co2eG: 570 })}
        />,
      );

      const figure = screen.getByText('~1.2 kWh · ~570 g CO₂e est.');
      expect(figure.parentElement).toHaveTextContent(
        'Cycle: ~1.2 kWh · ~570 g CO₂e est.',
      );
      expect(
        screen.getByText('$0.75 of $5.00').compareDocumentPosition(figure) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      await userEvent.hover(figure);

      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        /^All Conversations on this Cycle, hand-started included≈ 60 phone charges/,
      );
    });

    it('shows nothing for it without Conversations on the Cycle', () => {
      renderWithTheme(
        <AutopilotBar
          projectId={3}
          autopilot
          spendCeilingUsd={5}
          spendUsd={0}
          cycleFootprint={null}
        />,
      );

      expect(screen.queryByText(/Cycle:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/CO₂e/)).not.toBeInTheDocument();
    });

    it('says the Cycle is not measured when none of its Conversations recorded tokens', () => {
      renderWithTheme(
        <AutopilotBar
          projectId={3}
          autopilot
          spendCeilingUsd={5}
          spendUsd={0}
          cycleFootprint={{ measured: false }}
        />,
      );

      expect(
        screen.getByText('Cycle: Footprint not measured'),
      ).toBeInTheDocument();
    });

    it('never pauses Autopilot, however large', () => {
      renderWithTheme(
        <AutopilotBar
          projectId={3}
          autopilot
          spendCeilingUsd={5}
          spendUsd={1}
          cycleFootprint={aFootprint({ energyWh: 9e9, co2eG: 9e9 })}
        />,
      );

      expect(screen.queryByText(/paused/)).not.toBeInTheDocument();
    });
  });
});
