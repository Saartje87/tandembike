// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appSpars } from '../../spars/app-spars';
import { createTestSpars } from '../../test/spars';
import { startSpar } from './actions';

vi.mock('../../spars/app-spars', () => ({ appSpars: vi.fn() }));

describe('Spar actions', () => {
  beforeEach(() => {
    vi.mocked(appSpars).mockReset();
  });

  it('start a Spar as the User, with its topic and focus', async () => {
    const world = createTestSpars();
    vi.mocked(appSpars).mockReturnValue(world.spars);
    const ticket = world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Idea',
    });

    const result = await startSpar({
      projectId: world.project.id,
      focusTicketNumber: ticket.number,
      topic: 'Think',
    });

    expect(result).toMatchObject({
      ok: true,
      spar: { topic: 'Think', focusTicketNumber: ticket.number },
    });
    expect(
      world.conversations.get(result.ok ? result.spar.id : 0),
    ).toMatchObject({ startedBy: 'user', intent: 'spar' });
  });

  it('return a refusal with its field', async () => {
    const world = createTestSpars();
    vi.mocked(appSpars).mockReturnValue(world.spars);

    const result = await startSpar({
      projectId: world.project.id,
      topic: 'One\nTwo',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Keep the topic to one line.',
      fieldErrors: { topic: 'Keep the topic to one line.' },
    });
  });
});
