import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { currentMachineRuns } from '../../app/settings/actions';
import { renderWithTheme } from '../../test/render';
import { MachineRuns } from './machine-runs';

vi.mock('../../app/settings/actions', () => ({ currentMachineRuns: vi.fn() }));

beforeEach(() => {
  vi.mocked(currentMachineRuns).mockReset();
});

describe('MachineRuns', () => {
  it('shows the working runs against the cap', async () => {
    vi.mocked(currentMachineRuns).mockResolvedValue({
      inUse: 2,
      cap: 3,
      budget: null,
    });

    renderWithTheme(<MachineRuns />);

    expect(await screen.findByText('Runs 2/3')).toBeInTheDocument();
    expect(screen.queryByText(/Spend/)).not.toBeInTheDocument();
  });

  it("shows today's spend against the ceiling", async () => {
    vi.mocked(currentMachineRuns).mockResolvedValue({
      inUse: 1,
      cap: 3,
      budget: { spendUsd: 4.5, ceilingUsd: 10, paused: false },
    });

    renderWithTheme(<MachineRuns />);

    expect(await screen.findByText('Spend $4.50/$10.00')).toBeInTheDocument();
    expect(screen.queryByText(/paused/)).not.toBeInTheDocument();
  });

  it('says paused: machine ceiling at the ceiling', async () => {
    vi.mocked(currentMachineRuns).mockResolvedValue({
      inUse: 0,
      cap: 3,
      budget: { spendUsd: 10, ceilingUsd: 10, paused: true },
    });

    renderWithTheme(<MachineRuns />);

    expect(
      await screen.findByText('paused: machine ceiling'),
    ).toBeInTheDocument();
  });

  it('shows nothing when the load fails', async () => {
    vi.mocked(currentMachineRuns).mockRejectedValue(new Error('offline'));

    renderWithTheme(<MachineRuns />);

    await vi.waitFor(() => expect(currentMachineRuns).toHaveBeenCalled());
    expect(screen.queryByText(/Runs/)).not.toBeInTheDocument();
  });
});
