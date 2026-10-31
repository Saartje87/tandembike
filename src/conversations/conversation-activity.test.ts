// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { conversationActivity } from './conversation-activity';

const row = (
  ticketNumber: number | null,
  state: Parameters<typeof conversationActivity>[0][number]['state'],
) => ({ ticketNumber, state });

describe('conversationActivity', () => {
  it('lists the Tickets with a running Conversation', () => {
    const activity = conversationActivity([
      row(4, 'running'),
      row(5, 'stopped'),
    ]);

    expect(activity.running).toEqual([4]);
  });

  it('lists the Tickets whose Conversation waits for a permission or a reply', () => {
    const activity = conversationActivity([
      row(4, 'waiting'),
      row(5, 'idle'),
      row(6, 'running'),
      row(7, 'interrupted'),
    ]);

    expect(activity.needsYou).toEqual([4, 5]);
  });

  it('counts every waiting Conversation, including those on no Ticket', () => {
    const activity = conversationActivity([
      row(4, 'waiting'),
      row(4, 'idle'),
      row(null, 'waiting'),
      row(9, 'running'),
    ]);

    expect(activity.needsYouCount).toBe(3);
    expect(activity.needsYou).toEqual([4]);
  });
});
