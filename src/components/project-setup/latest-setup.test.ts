import { describe, expect, it } from 'vitest';

import type { Conversation } from '../../conversations/conversations';
import { latestSetup } from './latest-setup';

const conversation = (values: Partial<Conversation>): Conversation => ({
  id: 1,
  projectId: 3,
  ticketNumber: null,
  intent: 'setup',
  state: 'idle',
  sdkSessionId: null,
  costUsd: 0,
  hidden: false,
  defaultCycleId: null,
  defaultEpicNumber: null,
  defaultType: null,
  createdAt: new Date('2026-03-01T09:00:00Z'),
  updatedAt: new Date('2026-03-01T09:00:00Z'),
  ...values,
});

describe('latestSetup', () => {
  it('is none without a Setup', () => {
    expect(latestSetup(3, null, [])).toBeNull();
  });

  it('takes the newest Setup of the Project, loaded or held', () => {
    const loaded = conversation({ id: 4 });
    const newer = conversation({ id: 9 });

    expect(latestSetup(3, loaded, [newer])).toBe(newer);
    expect(latestSetup(3, newer, [loaded])).toBe(newer);
  });

  it('ignores other intents and other Projects', () => {
    const own = conversation({ id: 2 });

    expect(
      latestSetup(3, own, [
        conversation({ id: 8, intent: 'ask' }),
        conversation({ id: 9, projectId: 4 }),
      ]),
    ).toBe(own);
  });
});
