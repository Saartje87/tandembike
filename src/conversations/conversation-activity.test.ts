// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { type ActivityRow, conversationActivity } from './conversation-activity';

const row = (
  ticketNumber: number | null,
  state: ActivityRow['state'],
  projectId = 1,
  latestRole: ActivityRow['latestRole'] = 'agent',
) => ({ ticketNumber, state, projectId, latestRole });

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

  it('counts the Conversations that wait for the User per Project', () => {
    const activity = conversationActivity([
      row(4, 'waiting', 1),
      row(null, 'idle', 1),
      row(5, 'waiting', 2),
      row(6, 'running', 2),
    ]);

    expect(activity.needsYouByProject).toEqual({ 1: 2, 2: 1 });
  });

  describe('live', () => {
    const liveOf = (...rows: ReturnType<typeof row>[]) =>
      conversationActivity(rows).live;

    it('reports a running and a waiting Conversation', () => {
      expect(liveOf(row(4, 'running'), row(5, 'waiting'))).toEqual({
        4: { state: 'running' },
        5: { state: 'waiting' },
      });
    });

    it('reports an interrupted Conversation as needing the User', () => {
      expect(liveOf(row(4, 'interrupted'))).toEqual({
        4: { state: 'interrupted' },
      });
    });

    it('reports an idle or interrupted Conversation that ended in an error', () => {
      expect(
        liveOf(
          row(4, 'idle', 1, 'error'),
          row(5, 'interrupted', 1, 'error'),
        ),
      ).toEqual({ 4: { state: 'error' }, 5: { state: 'error' } });
    });

    it('reports nothing for an idle or stopped Conversation', () => {
      expect(liveOf(row(4, 'idle'), row(5, 'stopped'))).toEqual({});
    });

    it('reports nothing for a Conversation on no Ticket', () => {
      expect(liveOf(row(null, 'running'))).toEqual({});
    });

    it('lets the newest live Conversation of a Ticket win', () => {
      expect(
        liveOf(
          row(4, 'waiting'),
          row(4, 'running'),
          row(5, 'stopped'),
          row(5, 'running'),
        ),
      ).toEqual({ 4: { state: 'waiting' }, 5: { state: 'running' } });
    });
  });
});
