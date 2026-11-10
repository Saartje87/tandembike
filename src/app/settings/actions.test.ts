// @vitest-environment node

import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../test/tickets';
import { currentMachineRuns, saveMachineSettings } from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const world = vi.hoisted(() => ({
  tickets: undefined as unknown,
  processes: { working: 0, waiting: 0 },
  budget: null as unknown,
}));
vi.mock('../../tickets/app-tickets', () => ({
  appTickets: () => world.tickets,
}));
vi.mock('../../conversations/app-conversations', () => ({
  appConversations: () => ({
    liveProcesses: () => world.processes,
    machineBudget: () => world.budget,
  }),
}));

beforeEach(() => {
  world.tickets = createTestTickets();
  world.processes = { working: 0, waiting: 0 };
  world.budget = null;
  vi.mocked(revalidatePath).mockReset();
});

describe('saveMachineSettings', () => {
  it('saves the cap and revalidates the Settings page', async () => {
    expect(
      await saveMachineSettings({
        maxConcurrentRuns: 5,
        dailySpendCeilingUsd: 20,
      }),
    ).toEqual({
      ok: true,
      settings: { maxConcurrentRuns: 5, dailySpendCeilingUsd: 20 },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('comes back with the reason when the cap is below 1', async () => {
    expect(
      await saveMachineSettings({
        maxConcurrentRuns: 0,
        dailySpendCeilingUsd: null,
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { maxConcurrentRuns: 'Enter a whole number of at least 1.' },
    });
  });
});

describe('saveMachineSettings daily ceiling', () => {
  it('clears the ceiling with null and refuses zero', async () => {
    await saveMachineSettings({
      maxConcurrentRuns: 3,
      dailySpendCeilingUsd: 5,
    });
    expect(
      await saveMachineSettings({
        maxConcurrentRuns: 3,
        dailySpendCeilingUsd: null,
      }),
    ).toMatchObject({ ok: true, settings: { dailySpendCeilingUsd: null } });
    expect(
      await saveMachineSettings({
        maxConcurrentRuns: 3,
        dailySpendCeilingUsd: 0,
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: {
        dailySpendCeilingUsd: 'Enter an amount in dollars above 0.',
      },
    });
  });
});

describe('currentMachineRuns', () => {
  it('reports the runs working and waiting on the User against the cap (T1332)', async () => {
    world.processes = { working: 1, waiting: 2 };

    expect(await currentMachineRuns()).toEqual({
      working: 1,
      waiting: 2,
      cap: 3,
      budget: null,
    });
    world.budget = { spendUsd: 4, ceilingUsd: 10, paused: false };
    expect((await currentMachineRuns()).budget).toEqual(world.budget);
  });
});
