// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { ValidationError } from './errors';

describe('Machine settings', () => {
  it('start with a cap of 3 working runs', () => {
    const tickets = createTestTickets();

    expect(tickets.getMachineSettings()).toEqual({
      maxConcurrentRuns: 3,
      dailySpendCeilingUsd: null,
    });
  });

  it('save the cap and read it back', () => {
    const tickets = createTestTickets();

    expect(tickets.setMachineSettings({ maxConcurrentRuns: 5 })).toEqual({
      maxConcurrentRuns: 5,
      dailySpendCeilingUsd: null,
    });
    expect(tickets.getMachineSettings()).toEqual({
      maxConcurrentRuns: 5,
      dailySpendCeilingUsd: null,
    });
    tickets.setMachineSettings({ maxConcurrentRuns: 1 });
    expect(tickets.getMachineSettings()).toEqual({
      maxConcurrentRuns: 1,
      dailySpendCeilingUsd: null,
    });
  });

  it('keep the cap when the field is left out', () => {
    const tickets = createTestTickets();
    tickets.setMachineSettings({ maxConcurrentRuns: 4 });

    expect(tickets.setMachineSettings({})).toEqual({
      maxConcurrentRuns: 4,
      dailySpendCeilingUsd: null,
    });
  });

  it.each([0, -1, 1.5, Number.NaN])('refuse a cap of %s', (value) => {
    const tickets = createTestTickets();

    expect(
      errorFrom(() => tickets.setMachineSettings({ maxConcurrentRuns: value })),
    ).toEqual(
      new ValidationError({
        maxConcurrentRuns: 'Enter a whole number of at least 1.',
      }),
    );
    expect(tickets.getMachineSettings()).toEqual({
      maxConcurrentRuns: 3,
      dailySpendCeilingUsd: null,
    });
  });

  it('keep the daily spend ceiling optional, settable, kept and clearable', () => {
    const tickets = createTestTickets();

    tickets.setMachineSettings({ dailySpendCeilingUsd: 25 });
    expect(tickets.getMachineSettings().dailySpendCeilingUsd).toBe(25);
    tickets.setMachineSettings({ maxConcurrentRuns: 2 });
    expect(tickets.getMachineSettings().dailySpendCeilingUsd).toBe(25);
    tickets.setMachineSettings({ dailySpendCeilingUsd: null });
    expect(tickets.getMachineSettings().dailySpendCeilingUsd).toBeNull();
  });

  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuse a daily spend ceiling of %s',
    (value) => {
      const tickets = createTestTickets();

      expect(
        errorFrom(() =>
          tickets.setMachineSettings({ dailySpendCeilingUsd: value }),
        ),
      ).toEqual(
        new ValidationError({
          dailySpendCeilingUsd: 'Enter an amount in dollars above 0.',
        }),
      );
    },
  );

  it('announce a machine change', () => {
    const changes = createChangeChannel();
    const seen: unknown[] = [];
    changes.subscribe((change) => seen.push(change));
    const tickets = createTestTickets(changes);

    tickets.setMachineSettings({ maxConcurrentRuns: 2 });

    expect(seen).toEqual([{ type: 'machine' }]);
  });
});
