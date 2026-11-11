import { describe, expect, it } from 'vitest';

import { liveConversation } from '../../test/conversation-activity';
import {
  archivedLine,
  blockedByOf,
  type DoneRow,
  doneLine,
  type InFlightRow,
  inFlightLine,
  type NeedRow,
  needLine,
  pullRequestLabel,
  queuedLine,
  type TodoRow,
  yourWorkLine,
} from './board-of';

const now = new Date('2026-11-07T12:00:00.000Z').getTime();
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000);
const pullRequest = 'https://github.com/owner/repo/pull/87';

const row = {
  number: 7,
  title: 'Status line',
  epic: null,
  updatedAt: hoursAgo(3),
  color: null,
  labels: [],
};

const todoRow = (fields: Partial<TodoRow> = {}): TodoRow => ({
  ...row,
  blocked: false,
  blockers: [],
  ...fields,
});

const needRow = (fields: Partial<NeedRow> = {}): NeedRow => ({
  ...row,
  kind: 'stalled',
  live: undefined,
  since: hoursAgo(2),
  pullRequest: null,
  triageLabel: null,
  ...fields,
});

const inFlightRow = (fields: Partial<InFlightRow> = {}): InFlightRow => ({
  ...row,
  section: 'Running',
  live: undefined,
  cost: 0,
  pullRequest: null,
  ...fields,
});

describe('the Board row lines', () => {
  describe('needLine', () => {
    it('says what a row without a live Conversation waits on, and for how long', () => {
      expect(needLine(needRow(), now)).toBe(
        'Stalled · no Claim and no PR · 2h',
      );
      expect(needLine(needRow({ kind: 'review' }), now)).toBe(
        'Review · PR open · 2h',
      );
      expect(needLine(needRow({ kind: 'intake' }), now)).toBe(
        'Intake · to triage · 2h',
      );
    });

    it("says a live Conversation's line in place of what it waits on", () => {
      const live = liveConversation({
        state: 'waiting',
        line: 'Allow Bash: git push?',
      });
      expect(needLine(needRow({ kind: 'waiting', live }), now)).toBe(
        'Waiting · Allow Bash: git push? · 2h',
      );
    });

    it('names an idle, failed or interrupted run by its kind alone', () => {
      expect(needLine(needRow({ kind: 'idle' }), now)).toBe('Idle · 2h');
      expect(needLine(needRow({ kind: 'failed' }), now)).toBe('Failed · 2h');
      expect(needLine(needRow({ kind: 'interrupted' }), now)).toBe(
        'Interrupted · 2h',
      );
    });
  });

  describe('blockedByOf', () => {
    it('names the Blockers it knows, else says blocked', () => {
      expect(blockedByOf(todoRow({ blocked: true, blockers: [3, 4] }))).toBe(
        'blocked by T3, T4',
      );
      expect(blockedByOf(todoRow({ blocked: true }))).toBe('blocked');
    });
  });

  describe('queuedLine', () => {
    it('says its place in the queue, and what blocks it', () => {
      expect(queuedLine(todoRow(), 0)).toBe('Queued #1');
      expect(queuedLine(todoRow({ blocked: true, blockers: [3] }), 2)).toBe(
        'Queued #3 · blocked by T3',
      );
    });
  });

  describe('yourWorkLine', () => {
    it('says how long it has been handed over, and what blocks it', () => {
      expect(yourWorkLine(todoRow(), now)).toBe('ready-for-human · for 3h');
      expect(yourWorkLine(todoRow({ blocked: true, blockers: [3] }), now)).toBe(
        'ready-for-human · for 3h · blocked by T3',
      );
    });
  });

  describe('inFlightLine', () => {
    it('says what its live run does, for how long, and what it has cost', () => {
      const live = liveConversation({
        line: 'Editing board.tsx',
        since: hoursAgo(1).toISOString(),
      });
      expect(inFlightLine(inFlightRow({ live, cost: 1.5 }), now)).toBe(
        'Editing board.tsx · 1h · $1.50',
      );
    });

    it('shows a Terminal run with its elapsed time and no cost (T1237, T1196)', () => {
      const live = liveConversation({
        line: 'Starting',
        since: hoursAgo(1).toISOString(),
        terminal: true,
      });
      expect(inFlightLine(inFlightRow({ live, cost: 1.5 }), now)).toBe(
        'Starting · 1h',
      );
    });

    it('leaves out a cost of nothing', () => {
      const live = liveConversation({
        line: 'Starting',
        since: hoursAgo(1).toISOString(),
      });
      expect(inFlightLine(inFlightRow({ live }), now)).toBe('Starting · 1h');
    });

    it('says a claimed Ticket has no live run', () => {
      expect(inFlightLine(inFlightRow(), now)).toBe('Claimed, no live run');
      expect(inFlightLine(inFlightRow({ cost: 0.4 }), now)).toBe(
        'Claimed, no live run · $0.40',
      );
    });
  });

  describe('doneLine', () => {
    it('says since when it is Done, its pull request and its cost', () => {
      const done: DoneRow = { ...row, cost: 2, pullRequest };
      expect(doneLine(done, now)).toBe('Done 3h ago · PR #87 · $2.00');
      expect(doneLine({ ...done, cost: 0, pullRequest: null }, now)).toBe(
        'Done 3h ago',
      );
    });
  });

  describe('archivedLine', () => {
    it('says it is archived, whether it is an Epic, and since when', () => {
      const archived = { type: 'Ticket' as const, updatedAt: hoursAgo(3) };
      expect(archivedLine(archived, now)).toBe('Archived · Ticket · 3h ago');
      expect(archivedLine({ ...archived, type: 'Epic' }, now)).toBe(
        'Archived · Epic · 3h ago',
      );
    });
  });

  it('labels a pull request by its number', () => {
    expect(pullRequestLabel(pullRequest)).toBe('PR #87');
  });
});
