// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  type ActivityRow,
  conversationActivity,
} from './conversation-activity';

const since = '2026-11-07T10:00:00.000Z';

const row = (
  ticketNumber: number | null,
  state: ActivityRow['state'],
  projectId = 1,
  role: NonNullable<ActivityRow['latest']>['role'] = 'agent',
  text = 'Working on it.',
): ActivityRow => ({
  ticketNumber,
  state,
  projectId,
  latest: { role, text, permissionRules: null },
  startedAt: '2026-11-07T10:00:00.000Z',
  costUsd: 0,
});

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

    expect(activity.waiting).toEqual([4, 5]);
  });

  it('counts every waiting Conversation, including those on no Ticket', () => {
    const activity = conversationActivity([
      row(4, 'waiting'),
      row(4, 'idle'),
      row(null, 'waiting'),
      row(9, 'running'),
    ]);

    expect(activity.waitingCount).toBe(3);
    expect(activity.waiting).toEqual([4]);
  });

  it('counts the Conversations that wait for the User per Project', () => {
    const activity = conversationActivity([
      row(4, 'waiting', 1),
      row(null, 'idle', 1),
      row(5, 'waiting', 2),
      row(6, 'running', 2),
    ]);

    expect(activity.waitingByProject).toEqual({ 1: 2, 2: 1 });
  });

  describe('live', () => {
    const liveOf = (...rows: ReturnType<typeof row>[]) =>
      conversationActivity(rows).live;

    it('reports a running and a waiting Conversation', () => {
      expect(liveOf(row(4, 'running'), row(5, 'waiting'))).toEqual({
        4: { state: 'running', line: 'Working on it.', since, cost: 0 },
        5: { state: 'waiting', line: 'Working on it.', since, cost: 0 },
      });
    });

    it('reports an interrupted Conversation as needing the User', () => {
      expect(liveOf(row(4, 'interrupted'))).toMatchObject({
        4: { state: 'interrupted' },
      });
    });

    it('reports an idle or interrupted Conversation that ended in an error', () => {
      expect(
        liveOf(row(4, 'idle', 1, 'error'), row(5, 'interrupted', 1, 'error')),
      ).toMatchObject({ 4: { state: 'error' }, 5: { state: 'error' } });
    });

    it('carries the status line of the latest entry and the run start', () => {
      const live = liveOf(
        {
          ...row(
            4,
            'running',
            1,
            'tool',
            'Read {"file_path":"/repo/board.tsx"}',
          ),
          startedAt: '2026-11-07T09:00:00.000Z',
        },
        row(5, 'waiting', 1, 'permission', 'Bash {"command":"ls"}'),
      );

      expect(live[4]).toEqual({
        state: 'running',
        line: 'Reading board.tsx',
        since: '2026-11-07T09:00:00.000Z',
        cost: 0,
      });
      expect(live[5].line).toBe('Bash');
    });

    it('says Starting for a Conversation without entries', () => {
      expect(liveOf({ ...row(4, 'running'), latest: null })[4].line).toBe(
        'Starting',
      );
    });

    it("carries the live Conversation's own cost as the running cost", () => {
      expect(liveOf({ ...row(4, 'running'), costUsd: 0.42 })[4].cost).toBe(
        0.42,
      );
    });

    it('reports nothing for an idle or stopped Conversation', () => {
      expect(liveOf(row(4, 'idle'), row(5, 'stopped'))).toEqual({});
    });

    it('ignores an older interrupted or errored Conversation behind a newer idle one', () => {
      expect(
        liveOf(
          row(4, 'idle'),
          row(4, 'interrupted'),
          row(5, 'idle'),
          row(5, 'idle', 1, 'error'),
        ),
      ).toEqual({});
    });

    it('lets an older running Conversation beat a newer idle one', () => {
      expect(liveOf(row(4, 'idle'), row(4, 'running'))).toMatchObject({
        4: { state: 'running' },
      });
    });

    it('reports a newest interrupted or errored Conversation', () => {
      expect(
        liveOf(
          row(4, 'interrupted'),
          row(4, 'stopped'),
          row(5, 'idle', 1, 'error'),
          row(5, 'running'),
        ),
      ).toMatchObject({ 4: { state: 'interrupted' }, 5: { state: 'running' } });
      expect(liveOf(row(6, 'idle', 1, 'error'), row(6, 'idle'))).toMatchObject({
        6: { state: 'error' },
      });
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
      ).toMatchObject({ 4: { state: 'waiting' }, 5: { state: 'running' } });
    });
  });
});

describe('conversationActivity cost', () => {
  it("sums the cost of all of a Ticket's Conversations, live or not", () => {
    const { cost } = conversationActivity([
      { ...row(4, 'running'), costUsd: 0.5 },
      { ...row(4, 'stopped'), costUsd: 1.1 },
      { ...row(5, 'idle'), costUsd: 0.25 },
    ]);

    expect(cost[4]).toBeCloseTo(1.6);
    expect(cost[5]).toBe(0.25);
  });

  it('leaves out Tickets that cost nothing and Conversations without a Ticket', () => {
    const { cost } = conversationActivity([
      row(4, 'running'),
      { ...row(null, 'running'), costUsd: 3 },
    ]);

    expect(cost).toEqual({});
  });
});
