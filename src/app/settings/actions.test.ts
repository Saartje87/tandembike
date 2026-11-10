import { refresh } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultFootprintFactors } from '../../footprint/footprint';
import { createTestSettings } from '../../test/settings';
import { createTestTickets } from '../../test/tickets';
import {
  currentMachineRuns,
  resetFootprintFactor,
  saveFootprintFactors,
  saveMachineSettings,
} from './actions';

vi.mock('next/cache', () => ({ refresh: vi.fn() }));

const world = vi.hoisted(() => ({
  tickets: undefined as unknown,
  settings: undefined as unknown,
  processes: { working: 0, waiting: 0 },
  budget: null as unknown,
}));
vi.mock('../../tickets/app-tickets', () => ({
  appTickets: () => world.tickets,
}));
vi.mock('../../settings/app-settings', () => ({
  appSettings: () => world.settings,
}));
vi.mock('../../conversations/app-conversations', () => ({
  appConversations: () => ({
    capacity: () => ({ liveProcesses: world.processes }),
    machineBudget: () => world.budget,
  }),
}));

beforeEach(() => {
  world.tickets = createTestTickets();
  world.settings = createTestSettings();
  world.processes = { working: 0, waiting: 0 };
  world.budget = null;
  vi.mocked(refresh).mockReset();
});

describe('saveMachineSettings', () => {
  it('saves the cap and refreshes the page', async () => {
    expect(
      await saveMachineSettings({
        maxConcurrentRuns: 5,
        dailySpendCeilingUsd: 20,
      }),
    ).toEqual({
      ok: true,
      settings: { maxConcurrentRuns: 5, dailySpendCeilingUsd: 20 },
    });
    expect(refresh).toHaveBeenCalled();
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

describe('saveFootprintFactors (T1178)', () => {
  it('saves the factors and refreshes the page', async () => {
    expect(
      await saveFootprintFactors({
        ...defaultFootprintFactors,
        opusWhPerMillion: 800,
      }),
    ).toEqual({
      ok: true,
      factors: { ...defaultFootprintFactors, opusWhPerMillion: 800 },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('comes back with the field and reason for a negative factor', async () => {
    expect(
      await saveFootprintFactors({
        ...defaultFootprintFactors,
        gridGramsPerKwh: -5,
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { gridGramsPerKwh: 'Enter a number of 0 or more.' },
    });
  });

  it('refuses an empty or non-number factor, rather than reading it as 0', async () => {
    expect(
      await saveFootprintFactors({
        ...defaultFootprintFactors,
        haikuWhPerMillion: '' as never,
        sonnetWhPerMillion: null as never,
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: {
        haikuWhPerMillion: 'Enter a number of 0 or more.',
        sonnetWhPerMillion: 'Enter a number of 0 or more.',
      },
    });
  });
});

describe('resetFootprintFactor (T1178)', () => {
  it('sets one factor back to its default', async () => {
    await saveFootprintFactors({
      ...defaultFootprintFactors,
      haikuWhPerMillion: 1,
    });

    expect(await resetFootprintFactor({ name: 'haikuWhPerMillion' })).toEqual({
      ok: true,
      factors: defaultFootprintFactors,
    });
  });

  it('refuses a name that is not a factor', async () => {
    expect(await resetFootprintFactor({ name: 'nope' as never })).toMatchObject(
      { ok: false },
    );
  });
});
