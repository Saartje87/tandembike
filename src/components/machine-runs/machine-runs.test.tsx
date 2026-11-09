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
    vi.mocked(currentMachineRuns).mockResolvedValue({ inUse: 2, cap: 3 });

    renderWithTheme(<MachineRuns />);

    expect(await screen.findByText('Runs 2/3')).toBeInTheDocument();
  });

  it('shows nothing when the load fails', async () => {
    vi.mocked(currentMachineRuns).mockRejectedValue(new Error('offline'));

    renderWithTheme(<MachineRuns />);

    await vi.waitFor(() => expect(currentMachineRuns).toHaveBeenCalled());
    expect(screen.queryByText(/Runs/)).not.toBeInTheDocument();
  });
});
