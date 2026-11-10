import { describe, expect, it } from 'vitest';

import type { RunEvent } from './agent-runner';
import {
  type LifecycleInput,
  type LiveRun,
  type RunConversation,
  step,
  type TicketFacts,
} from './run-lifecycle';

const now = new Date('2026-11-10T12:00:00Z');
const startedAt = new Date('2026-11-10T11:00:00Z');

const aRun = (overrides: Partial<LiveRun> = {}): LiveRun => ({
  phase: { name: 'alive', releaseWorktree: false },
  costBefore: 1,
  usageBefore: {},
  model: 'opus',
  ticketStatus: 'In progress',
  pending: {
    startedAt,
    costAtStart: 1,
    command: '/implement',
    startedByAutopilot: false,
    transientResume: false,
  },
  ...overrides,
});

const between = (overrides: Partial<LiveRun> = {}): LiveRun =>
  aRun({ pending: null, ...overrides });

const aConversation = (
  overrides: Partial<RunConversation> = {},
): RunConversation => ({
  projectId: 3,
  ticketNumber: 7,
  intent: 'start',
  state: 'running',
  costUsd: 1,
  worktreePath: null,
  worktreeRemoved: false,
  ...overrides,
});

const aTicket = (overrides: Partial<TicketFacts> = {}): TicketFacts => ({
  status: 'In progress',
  hasPullRequest: false,
  inReview: false,
  claimed: true,
  ...overrides,
});

const event = (
  runEvent: RunEvent,
  overrides: Partial<Extract<LifecycleInput, { type: 'event' }>> = {},
): LifecycleInput => ({
  type: 'event',
  event: runEvent,
  waitsOnUser: false,
  ticket: aTicket(),
  ...overrides,
});

const usage = {
  'claude-opus': { input: 10, output: 5, cacheWrite: 0, cacheRead: 0 },
};

describe('A runner event of a live run', () => {
  it('stores the session and the model the run reports', () => {
    const result = step(
      aRun({ model: null }),
      aConversation(),
      event({ type: 'session', sessionId: 's-1', model: 'opus-x' }),
      now,
    );

    expect(result.run?.model).toBe('opus-x');
    expect(result.patch).toEqual({ sdkSessionId: 's-1' });
    expect(result.effects).toEqual([{ type: 'announce' }]);
  });

  it('keeps the model it had when the session names none', () => {
    const result = step(
      aRun({ model: 'opus' }),
      aConversation(),
      event({ type: 'session', sessionId: 's-1' }),
      now,
    );

    expect(result.run?.model).toBe('opus');
  });

  it('appends what the Agent says, the tools it uses and the Tickets it creates', () => {
    const conversation = aConversation();

    expect(
      step(aRun(), conversation, event({ type: 'agent', text: 'Hi' }), now)
        .effects,
    ).toEqual([
      { type: 'append', role: 'agent', text: 'Hi' },
      { type: 'announce' },
    ]);
    expect(
      step(
        aRun(),
        conversation,
        event({ type: 'tool', text: 'Bash ls', name: 'Bash', input: { a: 1 } }),
        now,
      ).effects,
    ).toEqual([
      {
        type: 'append',
        role: 'tool',
        text: 'Bash ls',
        tool: { name: 'Bash', input: { a: 1 } },
      },
      { type: 'announce' },
    ]);
    expect(
      step(aRun(), conversation, event({ type: 'tool', text: 'old' }), now)
        .effects,
    ).toEqual([
      { type: 'append', role: 'tool', text: 'old' },
      { type: 'announce' },
    ]);
    expect(
      step(
        aRun(),
        conversation,
        event({ type: 'created', numbers: [4, 5] }),
        now,
      ).effects,
    ).toEqual([
      { type: 'append', role: 'created', text: 'Created T4, T5' },
      { type: 'announce' },
    ]);
  });

  it('moves an idle Conversation to running when the Agent acts after its turn (T1261)', () => {
    for (const runEvent of [
      { type: 'agent', text: 'Woke up' },
      { type: 'tool', text: 'Bash ls' },
      { type: 'created', numbers: [4] },
    ] satisfies RunEvent[]) {
      expect(
        step(between(), aConversation({ state: 'idle' }), event(runEvent), now)
          .patch,
      ).toEqual({ state: 'running' });
    }
    expect(
      step(aRun(), aConversation(), event({ type: 'agent', text: 'Hi' }), now)
        .patch,
    ).toEqual({});
  });

  it('moves the Conversation to waiting and back as the run says', () => {
    expect(
      step(
        aRun(),
        aConversation(),
        event({ type: 'waiting', waiting: true }),
        now,
      ).patch,
    ).toEqual({ state: 'waiting' });
    expect(
      step(
        aRun(),
        aConversation({ state: 'waiting' }),
        event({ type: 'waiting', waiting: false }),
        now,
      ).patch,
    ).toEqual({ state: 'running' });
  });
});

describe('A turn end', () => {
  it('makes the Conversation idle, adds the run cost, writes usage and records the Run outcome', () => {
    const result = step(
      aRun({ costBefore: 2, usageBefore: {} }),
      aConversation({ costUsd: 2 }),
      event({ type: 'turn', costUsd: 0.5, usage }),
      now,
    );

    expect(result.patch).toEqual({ state: 'idle', costUsd: 2.5 });
    expect(result.run?.pending).toBeNull();
    expect(result.run?.phase).toEqual({
      name: 'alive',
      releaseWorktree: false,
    });
    expect(result.effects).toEqual([
      { type: 'writeUsage', before: {}, run: usage },
      {
        type: 'recordOutcome',
        outcome: {
          projectId: 3,
          ticketNumber: 7,
          stage: 'start',
          result: 'needs_reply',
          startedAt,
          endedAt: now,
          costUsd: 1.5,
          model: 'opus',
          command: '/implement',
          startedByAutopilot: false,
          transientResume: false,
        },
      },
      { type: 'announce' },
    ]);
  });

  it('records the outcome under the Stage the run is, such as the merge of Approve merge (ADR 0038)', () => {
    const result = step(
      aRun({
        pending: {
          startedAt,
          costAtStart: 1,
          command: null,
          startedByAutopilot: false,
          transientResume: true,
          stage: 'merge',
        },
      }),
      aConversation(),
      event({ type: 'turn', costUsd: 0 }),
      now,
    );

    expect(result.effects).toContainEqual(
      expect.objectContaining({
        type: 'recordOutcome',
        outcome: expect.objectContaining({
          stage: 'merge',
          transientResume: true,
        }),
      }),
    );
  });

  it('appends its error first and classifies a transient one, so Autopilot resumes it once (ADR 0034)', () => {
    const result = step(
      aRun(),
      aConversation(),
      event({ type: 'turn', costUsd: 0, error: 'API Error: 529 overloaded' }),
      now,
    );

    expect(result.effects[0]).toEqual({
      type: 'append',
      role: 'error',
      text: 'API Error: 529 overloaded',
    });
    expect(result.effects).toContainEqual(
      expect.objectContaining({
        outcome: expect.objectContaining({ result: 'failed_transient' }),
      }),
    );
  });

  it('counts a run that still waits on the User as needing a reply', () => {
    const ask = aConversation({ intent: 'ask', ticketNumber: null });
    const resultOf = (input: LifecycleInput, conversation = ask) =>
      step(aRun(), conversation, input, now).effects.find(
        (effect) => effect.type === 'recordOutcome',
      );

    expect(
      resultOf(event({ type: 'turn', costUsd: 0 }, { ticket: null })),
    ).toMatchObject({ outcome: { result: 'completed' } });
    expect(
      resultOf(
        event(
          { type: 'turn', costUsd: 0 },
          { ticket: null, waitsOnUser: true },
        ),
      ),
    ).toMatchObject({ outcome: { result: 'needs_reply' } });
    expect(
      resultOf(
        event({ type: 'turn', costUsd: 0 }, { ticket: null }),
        aConversation({ intent: 'ask', ticketNumber: null, state: 'waiting' }),
      ),
    ).toMatchObject({ outcome: { result: 'needs_reply' } });
  });

  it('records no outcome when no message was pending', () => {
    const result = step(
      between(),
      aConversation({ state: 'idle' }),
      event({ type: 'turn', costUsd: 0 }),
      now,
    );

    expect(result.effects).toEqual([{ type: 'announce' }]);
  });

  it('remembers the Ticket Status the turn ended on', () => {
    const result = step(
      aRun({ ticketStatus: 'Todo' }),
      aConversation(),
      event({ type: 'turn', costUsd: 0 }, { ticket: aTicket() }),
      now,
    );

    expect(result.run?.ticketStatus).toBe('In progress');
  });

  it('releases the worktree of a Ticket that reached Done during the turn, keeping the run alive (T1232)', () => {
    const result = step(
      aRun({ phase: { name: 'alive', releaseWorktree: true } }),
      aConversation({ intent: 'ask' }),
      event({ type: 'turn', costUsd: 0 }),
      now,
    );

    expect(result.run?.phase).toEqual({
      name: 'alive',
      releaseWorktree: false,
    });
    expect(result.effects.at(-1)).toEqual({ type: 'releaseWorktree' });
    expect(result.effects).not.toContainEqual({
      type: 'endProcess',
      interrupt: false,
    });
  });

  it('ends the process of a Start that handed off: Done, or in Review without a Claim (ADR 0049)', () => {
    for (const ticket of [
      aTicket({ status: 'Done' }),
      aTicket({ inReview: true, claimed: false, hasPullRequest: true }),
    ]) {
      const result = step(
        aRun(),
        aConversation(),
        event({ type: 'turn', costUsd: 0 }, { ticket }),
        now,
      );

      expect(result.run?.phase).toEqual({ name: 'ended' });
      expect(result.effects.slice(-4)).toEqual([
        { type: 'detach' },
        { type: 'expireWaits' },
        { type: 'endProcess', interrupt: false },
        { type: 'announce' },
      ]);
    }
  });

  it('keeps the process of a run that did not hand off', () => {
    for (const [conversation, ticket] of [
      [aConversation(), aTicket({ inReview: true, claimed: true })],
      [aConversation({ intent: 'ask' }), aTicket({ status: 'Done' })],
      [aConversation({ ticketNumber: null }), null],
    ] as const) {
      const result = step(
        aRun(),
        conversation,
        event({ type: 'turn', costUsd: 0 }, { ticket }),
        now,
      );

      expect(result.run?.phase.name).toBe('alive');
      expect(result.effects).not.toContainEqual({ type: 'detach' });
    }
  });

  it('ends the process when its Ticket went Back to Todo or Done mid-turn (ADR 0049)', () => {
    const result = step(
      aRun({ phase: { name: 'endingAfterTurn', releaseWorktree: false } }),
      aConversation(),
      event(
        { type: 'turn', costUsd: 0 },
        { ticket: aTicket({ status: 'Todo' }) },
      ),
      now,
    );

    expect(result.run?.phase).toEqual({ name: 'ended' });
    expect(result.effects).toContainEqual({
      type: 'endProcess',
      interrupt: false,
    });
  });
});

describe('A run exit', () => {
  it('interrupts the Conversation, expires its waits and records the outcome at its cost', () => {
    const result = step(
      aRun(),
      aConversation({ costUsd: 3 }),
      event({ type: 'exit', error: 'Process died' }),
      now,
    );

    expect(result.run?.phase).toEqual({ name: 'ended' });
    expect(result.run?.pending).toBeNull();
    expect(result.patch).toEqual({ state: 'interrupted' });
    expect(result.effects).toEqual([
      { type: 'detach' },
      { type: 'expireWaits' },
      { type: 'append', role: 'error', text: 'Process died' },
      {
        type: 'recordOutcome',
        outcome: expect.objectContaining({ result: 'failed', costUsd: 2 }),
      },
      { type: 'announce' },
    ]);
  });

  it('releases the worktree a Done Ticket left to release (T1232)', () => {
    const result = step(
      aRun({ phase: { name: 'alive', releaseWorktree: true } }),
      aConversation(),
      event({ type: 'exit' }),
      now,
    );

    expect(result.effects.at(-1)).toEqual({ type: 'releaseWorktree' });
  });
});

describe('A run that no longer speaks for its Conversation', () => {
  const stopped = (costAtStart: number | null) =>
    aRun({
      costBefore: 2,
      pending: null,
      phase: {
        name: 'stopped',
        lateCost: costAtStart === null ? null : { costAtStart },
      },
    });

  it('gives a stopped turn its late cost: the stopped outcome first, then the Conversation (T587)', () => {
    const result = step(
      stopped(2.5),
      aConversation({ state: 'stopped' }),
      event({ type: 'turn', costUsd: 1, usage }),
      now,
    );

    expect(result.run?.phase).toEqual({ name: 'stopped', lateCost: null });
    expect(result.patch).toEqual({ costUsd: 3 });
    expect(result.effects).toEqual([
      { type: 'setStoppedOutcomeCost', costUsd: 0.5 },
      { type: 'writeUsage', before: {}, run: usage },
      { type: 'announce' },
    ]);
  });

  it('back-fills the stopped outcome only once', () => {
    const result = step(
      stopped(null),
      aConversation({ state: 'stopped' }),
      event({ type: 'turn', costUsd: 1 }),
      now,
    );

    expect(result.patch).toEqual({ costUsd: 3 });
    expect(result.effects).toEqual([{ type: 'announce' }]);
  });

  it('ignores everything else a stopped run reports', () => {
    const result = step(
      stopped(2.5),
      aConversation({ state: 'stopped' }),
      event({ type: 'agent', text: 'late' }),
      now,
    );

    expect(result).toEqual({ run: stopped(2.5), patch: {}, effects: [] });
  });

  it('ignores every event of a run whose process ended', () => {
    const ended = aRun({ phase: { name: 'ended' } });
    for (const runEvent of [
      { type: 'turn', costUsd: 9 },
      { type: 'agent', text: 'late' },
      { type: 'exit' },
    ] satisfies RunEvent[]) {
      expect(step(ended, aConversation(), event(runEvent), now)).toEqual({
        run: ended,
        patch: {},
        effects: [],
      });
    }
  });
});

describe("The User's reply to a live run", () => {
  it('appends it, puts it into the process and starts a pending run from it', () => {
    const result = step(
      between(),
      aConversation({ state: 'idle', costUsd: 4 }),
      {
        type: 'reply',
        text: '/merge now',
        sentBy: 'autopilot',
        transientResume: true,
        stage: 'merge',
      },
      now,
    );

    expect(result.patch).toEqual({ state: 'running' });
    expect(result.run?.pending).toEqual({
      startedAt: now,
      costAtStart: 4,
      command: '/merge',
      startedByAutopilot: true,
      transientResume: true,
      stage: 'merge',
    });
    expect(result.effects).toEqual([
      { type: 'append', role: 'autopilot', text: '/merge now' },
      { type: 'send', text: '/merge now' },
      { type: 'announce' },
    ]);
  });

  it('keeps the pending run of a turn in progress', () => {
    const run = aRun();
    const result = step(
      run,
      aConversation(),
      { type: 'reply', text: 'Also this', sentBy: 'user' },
      now,
    );

    expect(result.run?.pending).toBe(run.pending);
  });
});

describe("The User's stop", () => {
  it('stops a run mid-turn: records its stopped outcome and interrupts its process, waiting for its last cost (T587)', () => {
    const result = step(
      aRun(),
      aConversation({ costUsd: 1.5 }),
      { type: 'stop', keepWorktree: false },
      now,
    );

    expect(result.run?.phase).toEqual({
      name: 'stopped',
      lateCost: { costAtStart: 1 },
    });
    expect(result.run?.pending).toBeNull();
    expect(result.patch).toEqual({ state: 'stopped' });
    expect(result.effects).toEqual([
      { type: 'detach' },
      {
        type: 'recordOutcome',
        outcome: expect.objectContaining({ result: 'stopped', costUsd: 0.5 }),
      },
      { type: 'expireWaits' },
      { type: 'announce' },
      { type: 'endProcess', interrupt: true },
    ]);
  });

  it('records no outcome for a run between turns, so no late cost is waited for', () => {
    const result = step(
      between(),
      aConversation({ state: 'idle' }),
      { type: 'stop', keepWorktree: false },
      now,
    );

    expect(result.run?.phase).toEqual({ name: 'stopped', lateCost: null });
    expect(result.effects).not.toContainEqual(
      expect.objectContaining({ type: 'recordOutcome' }),
    );
  });

  it('releases the worktree a Done Ticket left to release, unless the terminal takes it over', () => {
    const run = aRun({ phase: { name: 'alive', releaseWorktree: true } });

    expect(
      step(
        run,
        aConversation(),
        { type: 'stop', keepWorktree: false },
        now,
      ).effects.at(-1),
    ).toEqual({ type: 'releaseWorktree' });
    expect(
      step(run, aConversation(), { type: 'stop', keepWorktree: true }, now)
        .effects,
    ).not.toContainEqual({ type: 'releaseWorktree' });
  });

  it('stops a Conversation without a live run', () => {
    expect(
      step(
        null,
        aConversation({ state: 'interrupted' }),
        { type: 'stop', keepWorktree: false },
        now,
      ),
    ).toEqual({
      run: null,
      patch: { state: 'stopped' },
      effects: [{ type: 'announce' }],
    });
  });

  it('changes nothing of a stopped Conversation', () => {
    expect(
      step(
        null,
        aConversation({ state: 'stopped' }),
        { type: 'stop', keepWorktree: false },
        now,
      ),
    ).toEqual({ run: null, patch: {}, effects: [] });
  });
});

describe("The User's close", () => {
  it('hides the Conversation, stops its run and releases its worktree', () => {
    const result = step(aRun(), aConversation(), { type: 'close' }, now);

    expect(result.patch).toEqual({ hidden: true, state: 'stopped' });
    expect(result.run?.phase.name).toBe('stopped');
    expect(result.effects.slice(-3)).toEqual([
      { type: 'endProcess', interrupt: true },
      { type: 'announce' },
      { type: 'releaseWorktree' },
    ]);
  });

  it('hides and releases a stopped one', () => {
    expect(
      step(null, aConversation({ state: 'stopped' }), { type: 'close' }, now),
    ).toEqual({
      run: null,
      patch: { hidden: true },
      effects: [{ type: 'announce' }, { type: 'releaseWorktree' }],
    });
  });
});

describe('A move of its Ticket', () => {
  const moved = (status: TicketFacts['status']): LifecycleInput => ({
    type: 'ticketMoved',
    status,
  });

  it('ends the process of a Start between turns when its Ticket goes Back to Todo or Done (ADR 0049)', () => {
    for (const status of ['Todo', 'Done'] as const) {
      const result = step(
        between(),
        aConversation({ state: 'idle' }),
        moved(status),
        now,
      );

      expect(result.run?.phase).toEqual({ name: 'ended' });
      expect(result.run?.ticketStatus).toBe(status);
      expect(result.effects).toEqual([
        { type: 'detach' },
        { type: 'expireWaits' },
        { type: 'endProcess', interrupt: false },
        { type: 'announce' },
      ]);
    }
  });

  it('ends a Start mid-turn when its turn ends (ADR 0049)', () => {
    const result = step(aRun(), aConversation(), moved('Todo'), now);

    expect(result.run?.phase).toEqual({
      name: 'endingAfterTurn',
      releaseWorktree: false,
    });
    expect(result.effects).toEqual([]);
  });

  it('only remembers a Status it already saw, or a move to In progress', () => {
    const result = step(
      between({ ticketStatus: 'Todo' }),
      aConversation({ state: 'idle' }),
      moved('In progress'),
      now,
    );
    expect(result.run?.phase.name).toBe('alive');
    expect(result.run?.ticketStatus).toBe('In progress');
    expect(result.effects).toEqual([]);

    expect(
      step(
        between({ ticketStatus: 'Todo' }),
        aConversation({ state: 'idle' }),
        moved('Todo'),
        now,
      ).effects,
    ).toEqual([]);
  });

  it('leaves the process of a Conversation that is not a Start or a Merge', () => {
    const result = step(
      between(),
      aConversation({ intent: 'ask', state: 'idle' }),
      moved('Done'),
      now,
    );

    expect(result.run).toEqual(between());
    expect(result.effects).toEqual([]);
  });

  it('releases the worktree on Done: now between turns, when the turn ends mid-turn (T1232)', () => {
    const withWorktree = aConversation({ intent: 'ask', worktreePath: '/w' });

    expect(step(between(), withWorktree, moved('Done'), now).effects).toEqual([
      { type: 'releaseWorktree' },
    ]);
    expect(step(null, withWorktree, moved('Done'), now).effects).toEqual([
      { type: 'releaseWorktree' },
    ]);
    const midTurn = step(aRun(), withWorktree, moved('Done'), now);
    expect(midTurn.run?.phase).toEqual({
      name: 'alive',
      releaseWorktree: true,
    });
    expect(midTurn.effects).toEqual([]);
  });

  it('releases no worktree it has not got, or already removed, or for another Status', () => {
    for (const [conversation, status] of [
      [aConversation({ intent: 'ask' }), 'Done'],
      [
        aConversation({
          intent: 'ask',
          worktreePath: '/w',
          worktreeRemoved: true,
        }),
        'Done',
      ],
      [aConversation({ intent: 'ask', worktreePath: '/w' }), 'Todo'],
    ] as const) {
      expect(step(null, conversation, moved(status), now).effects).toEqual([]);
    }
  });

  it('ends a Start between turns, then releases its worktree, on Done', () => {
    const result = step(
      between(),
      aConversation({ state: 'idle', worktreePath: '/w' }),
      moved('Done'),
      now,
    );

    expect(result.effects.map((effect) => effect.type)).toEqual([
      'detach',
      'expireWaits',
      'endProcess',
      'announce',
      'releaseWorktree',
    ]);
  });
});

describe('A removed worktree', () => {
  it('ends the process of a run between turns: it would work in a folder that is gone (T1281)', () => {
    const result = step(
      between(),
      aConversation({ state: 'idle' }),
      { type: 'worktreeRemoved' },
      now,
    );

    expect(result.run?.phase).toEqual({ name: 'ended' });
    expect(result.patch).toEqual({});
    expect(result.effects).toEqual([
      { type: 'detach' },
      { type: 'expireWaits' },
      { type: 'endProcess', interrupt: false },
    ]);
  });

  it('leaves a run mid-turn alone', () => {
    const run = aRun();
    expect(
      step(run, aConversation(), { type: 'worktreeRemoved' }, now),
    ).toEqual({ run, patch: {}, effects: [] });
  });
});
