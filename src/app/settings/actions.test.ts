// @vitest-environment node

import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../test/tickets';
import { currentMachineRuns, saveMachineSettings } from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const world = vi.hoisted(() => ({
  tickets: undefined as unknown,
  slots: 0,
}));
vi.mock('../../tickets/app-tickets', () => ({
  appTickets: () => world.tickets,
}));
vi.mock('../../conversations/app-conversations', () => ({
  appConversations: () => ({ machineSlotsInUse: () => world.slots }),
}));

beforeEach(() => {
  world.tickets = createTestTickets();
  world.slots = 0;
  vi.mocked(revalidatePath).mockReset();
});

describe('saveMachineSettings', () => {
  it('saves the cap and revalidates the Settings page', async () => {
    expect(await saveMachineSettings({ maxConcurrentRuns: 5 })).toEqual({
      ok: true,
      settings: { maxConcurrentRuns: 5 },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('comes back with the reason when the cap is below 1', async () => {
    expect(await saveMachineSettings({ maxConcurrentRuns: 0 })).toMatchObject({
      ok: false,
      fieldErrors: { maxConcurrentRuns: 'Enter a whole number of at least 1.' },
    });
  });
});

describe('currentMachineRuns', () => {
  it('reports the working runs against the cap', async () => {
    world.slots = 2;

    expect(await currentMachineRuns()).toEqual({ inUse: 2, cap: 3 });
  });
});
