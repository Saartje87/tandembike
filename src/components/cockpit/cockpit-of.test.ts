import { describe, expect, it } from 'vitest';

import { activity, liveConversation } from '../../test/conversation-activity';
import type { Ticket } from '../../tickets/tickets';
import { cockpitOf } from './cockpit-of';

const ticket = (fields: Partial<Ticket> & Pick<Ticket, 'number'>): Ticket => ({
  title: `Ticket ${fields.number}`,
  description: '',
  status: 'Todo',
  projectId: 1,
  position: 0,
  archived: false,
  labels: [],
  externalReferences: [],
  attachments: [],
  blockedBy: [],
  blocked: false,
  type: 'Ticket',
  color: null,
  epic: null,
  children: [],
  origin: null,
  splitOff: [],
  cycle: null,
  claim: null,
  acceptanceCriteria: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...fields,
});

const claim = { agentRunId: 'run-1', agentName: null };
const pullRequest = (n: number) => `https://github.com/owner/repo/pull/${n}`;
const numbers = (rows: { number: number }[]) =>
  rows.map(({ number }) => number);

describe('cockpitOf', () => {
  it('puts In progress Tickets In flight, in Board order', () => {
    const cockpit = cockpitOf(
      [
        ticket({ number: 2, status: 'In progress', position: 2, claim }),
        ticket({ number: 1, status: 'In progress', position: 1, claim }),
      ],
      activity(),
    );

    expect(numbers(cockpit.inFlight)).toEqual([1, 2]);
  });

  it("gives an In flight row its section, live line, run start and the Ticket's total cost", () => {
    const live = liveConversation({
      line: 'Editing board.tsx',
      since: '2026-11-07T10:00:00.000Z',
      cost: 0.4,
    });
    const [row] = cockpitOf(
      [
        ticket({
          number: 7,
          title: 'Status line',
          status: 'In progress',
          claim,
        }),
      ],
      activity({ live: { 7: live }, cost: { 7: 1.25 } }),
    ).inFlight;

    expect(row).toMatchObject({
      number: 7,
      title: 'Status line',
      section: 'Running',
      live,
      cost: 1.25,
      pullRequest: null,
    });
  });

  it('keeps only Running Tickets In flight; Action needed and Review need you', () => {
    const cockpit = cockpitOf(
      [
        ticket({ number: 1, status: 'In progress', claim }),
        ticket({
          number: 2,
          status: 'In progress',
          externalReferences: [pullRequest(10)],
        }),
        ticket({ number: 3, status: 'In progress' }),
        ticket({ number: 4, status: 'In progress', claim }),
      ],
      activity({ live: { 4: liveConversation({ state: 'waiting' }) } }),
    );

    expect(numbers(cockpit.inFlight)).toEqual([1]);
    expect(numbers(cockpit.needsYou.actionNeeded)).toEqual([3, 4]);
    expect(numbers(cockpit.needsYou.review)).toEqual([2]);
  });

  it('says what each Action needed Ticket waits on', () => {
    const { actionNeeded } = cockpitOf(
      [
        ticket({ number: 1, status: 'In progress', claim }),
        ticket({ number: 2, status: 'In progress', claim }),
        ticket({ number: 3, status: 'In progress', claim }),
        ticket({ number: 4, status: 'In progress' }),
        ticket({ number: 5, status: 'In progress', claim }),
      ],
      activity({
        live: {
          1: liveConversation({
            state: 'waiting',
            since: '2026-11-07T10:01:00Z',
          }),
          2: liveConversation({
            state: 'error',
            since: '2026-11-07T10:02:00Z',
          }),
          3: liveConversation({
            state: 'interrupted',
            since: '2026-11-07T10:03:00Z',
          }),
          5: liveConversation({ state: 'idle', since: '2026-11-07T10:04:00Z' }),
        },
      }),
    ).needsYou;

    expect(actionNeeded.map(({ number, kind }) => [number, kind])).toEqual([
      [4, 'stalled'],
      [1, 'waiting'],
      [2, 'failed'],
      [3, 'interrupted'],
      [5, 'idle'],
    ]);
  });

  it('puts the longest waiting first within a group', () => {
    const { actionNeeded, review } = cockpitOf(
      [
        ticket({
          number: 1,
          status: 'In progress',
          claim,
          position: 0,
        }),
        ticket({
          number: 2,
          status: 'In progress',
          position: 1,
          updatedAt: new Date('2026-11-07T09:00:00Z'),
        }),
        ticket({
          number: 3,
          status: 'In progress',
          externalReferences: [pullRequest(30)],
          updatedAt: new Date('2026-11-07T12:00:00Z'),
        }),
        ticket({
          number: 4,
          status: 'In progress',
          externalReferences: [pullRequest(40)],
          updatedAt: new Date('2026-11-07T08:00:00Z'),
        }),
      ],
      activity({
        live: {
          1: liveConversation({
            state: 'waiting',
            since: '2026-11-07T11:00:00Z',
          }),
        },
      }),
    ).needsYou;

    expect(actionNeeded.map(({ number, since }) => [number, since])).toEqual([
      [2, new Date('2026-11-07T09:00:00Z')],
      [1, new Date('2026-11-07T11:00:00Z')],
    ]);
    expect(
      review.map(({ number, pullRequest }) => [number, pullRequest]),
    ).toEqual([
      [4, 'https://github.com/owner/repo/pull/40'],
      [3, 'https://github.com/owner/repo/pull/30'],
    ]);
  });

  it("lists Intake after Review, from this Board and another Board's Intake, longest waiting first", () => {
    const cockpit = cockpitOf(
      [
        ticket({
          number: 1,
          labels: ['needs-triage'],
          createdAt: new Date('2026-11-05'),
        }),
        ticket({ number: 2, createdAt: new Date('2026-11-03') }),
        ticket({ number: 3, labels: ['ready-for-agent'] }),
      ],
      activity(),
      [
        ticket({
          number: 4,
          labels: ['needs-info', 'bug'],
          createdAt: new Date('2026-11-04'),
        }),
        ticket({ number: 5, labels: ['ready-for-agent'] }),
        ticket({ number: 6, status: 'In progress' }),
        ticket({ number: 7, status: 'Done' }),
        ticket({ number: 8, labels: ['ready-for-human'] }),
      ],
    );

    expect(
      cockpit.needsYou.intake.map(({ number, kind, triageLabel, since }) => [
        number,
        kind,
        triageLabel,
        since,
      ]),
    ).toEqual([
      [2, 'intake', null, new Date('2026-11-03')],
      [4, 'intake', 'needs-info', new Date('2026-11-04')],
      [1, 'intake', 'needs-triage', new Date('2026-11-05')],
    ]);
    expect(numbers(cockpit.queued)).toEqual([3]);
    expect(numbers(cockpit.inFlight)).toEqual([]);
    expect(numbers(cockpit.done)).toEqual([]);
    expect(numbers(cockpit.yourWork)).toEqual([]);
    expect(cockpit.needsYou.count).toBe(3);
  });

  it("leaves another Board's Epics and archived Intake out", () => {
    const cockpit = cockpitOf([], activity(), [
      ticket({ number: 1, type: 'Epic', labels: ['needs-triage'] }),
      ticket({ number: 2, labels: ['needs-triage'], archived: true }),
    ]);

    expect(cockpit.needsYou.intake).toEqual([]);
  });

  it('counts every Ticket that needs you', () => {
    const cockpit = cockpitOf(
      [
        ticket({ number: 1, status: 'In progress' }),
        ticket({
          number: 2,
          status: 'In progress',
          externalReferences: [pullRequest(10)],
        }),
        ticket({ number: 3, status: 'In progress', claim }),
      ],
      activity(),
    );

    expect(cockpit.needsYou.count).toBe(2);
  });

  it("shows the Ticket's latest pull request", () => {
    const [row] = cockpitOf(
      [
        ticket({
          number: 1,
          status: 'In progress',
          externalReferences: [pullRequest(10), 'ABC-3', pullRequest(12)],
        }),
      ],
      activity(),
    ).needsYou.review;

    expect(row.pullRequest).toBe(pullRequest(12));
  });

  it('lists ready-for-human Todo Tickets as Your work, in Board order', () => {
    const cockpit = cockpitOf(
      [
        ticket({ number: 1, labels: ['ready-for-human'], position: 2 }),
        ticket({ number: 2, labels: ['ready-for-human'], position: 1 }),
        ticket({ number: 3, labels: ['ready-for-agent'] }),
      ],
      activity(),
    );

    expect(numbers(cockpit.yourWork)).toEqual([2, 1]);
  });

  it('queues ready-for-agent Todo Tickets in the Todo Lane order', () => {
    const cockpit = cockpitOf(
      [
        ticket({ number: 1, labels: ['ready-for-agent'], position: 3 }),
        ticket({ number: 2, labels: ['ready-for-agent'], position: 1 }),
        ticket({ number: 3, labels: ['needs-triage'], position: 0 }),
        ticket({ number: 4, labels: ['ready-for-agent'], position: 2 }),
      ],
      activity(),
    );

    expect(numbers(cockpit.queued)).toEqual([2, 4, 1]);
  });

  it('names the unresolved Blockers of a queued Ticket it knows of', () => {
    const cockpit = cockpitOf(
      [
        ticket({
          number: 1,
          labels: ['ready-for-agent'],
          blockedBy: [2, 3, 9],
          blocked: true,
        }),
        ticket({ number: 2, status: 'Done' }),
        ticket({ number: 3, status: 'In progress', claim }),
        ticket({ number: 4, labels: ['ready-for-agent'], blockedBy: [2] }),
      ],
      activity(),
    );

    expect(cockpit.queued).toMatchObject([
      { number: 1, blocked: true, blockers: [3, 9] },
      { number: 4, blocked: false, blockers: [] },
    ]);
  });

  it('lists Done Tickets most recently changed first, with their cost and pull request', () => {
    const cockpit = cockpitOf(
      [
        ticket({
          number: 1,
          status: 'Done',
          updatedAt: new Date('2026-11-01'),
        }),
        ticket({
          number: 2,
          status: 'Done',
          updatedAt: new Date('2026-11-05'),
          externalReferences: [pullRequest(20)],
        }),
      ],
      activity({ cost: { 2: 3.5 } }),
    );

    expect(cockpit.done).toMatchObject([
      { number: 2, cost: 3.5, pullRequest: pullRequest(20) },
      { number: 1, cost: 0, pullRequest: null },
    ]);
  });

  it('leaves out Epics, archived Tickets and Intake', () => {
    const cockpit = cockpitOf(
      [
        ticket({ number: 1, type: 'Epic', status: 'In progress' }),
        ticket({ number: 2, status: 'In progress', archived: true }),
        ticket({ number: 3, labels: ['needs-triage'] }),
        ticket({ number: 4 }),
      ],
      activity(),
    );

    expect(cockpit).toMatchObject({
      inFlight: [],
      yourWork: [],
      queued: [],
      done: [],
    });
  });

  it("keeps a child's Epic on its row", () => {
    const epic = { number: 50, title: 'Cockpit', color: 'teal' as const };
    const [row] = cockpitOf(
      [ticket({ number: 1, labels: ['ready-for-agent'], epic })],
      activity(),
    ).queued;

    expect(row.epic).toEqual(epic);
  });

  it('counts the Tickets done of all, without Epics or archived ones', () => {
    const cockpit = cockpitOf(
      [
        ticket({ number: 1, status: 'Done' }),
        ticket({ number: 2, status: 'Done' }),
        ticket({ number: 3, labels: ['needs-triage'] }),
        ticket({ number: 4, status: 'In progress', claim }),
        ticket({ number: 5, type: 'Epic', status: 'Done' }),
        ticket({ number: 6, status: 'Done', archived: true }),
      ],
      activity(),
    );

    expect(cockpit.progress).toEqual({ done: 2, total: 4 });
  });
});
