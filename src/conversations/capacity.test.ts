import { describe, expect, it } from 'vitest';

import {
  type CapacityConversation,
  type CapacitySnapshot,
  capacityOf,
  refusalOf,
  verdictOf,
} from './capacity';

let nextId = 1;

const run = (
  fields: Partial<CapacityConversation> = {},
): CapacityConversation => ({
  id: nextId++,
  projectId: 1,
  ticketNumber: null,
  intent: 'start',
  state: 'running',
  startedBy: 'user',
  ...fields,
});

const snapshot = (
  conversations: CapacityConversation[],
  fields: Partial<Omit<CapacitySnapshot, 'conversations'>> = {},
): CapacitySnapshot => ({
  conversations,
  machineCap: 3,
  parallelRuns: false,
  ...fields,
});

describe('capacityOf', () => {
  it('counts a Project’s live Start and Merge runs as its Start run slots, idle ones included', () => {
    const capacity = capacityOf(
      snapshot([
        run({ intent: 'start', state: 'running' }),
        run({ intent: 'merge', state: 'idle' }),
        run({ intent: 'start', state: 'running', projectId: 2 }),
        run({ intent: 'ask', state: 'running' }),
      ]),
      1,
    );

    expect(capacity.project.slotsHeld).toBe(2);
    expect(capacity.project.limit).toBe(1);
  });

  it('makes the Machine cap the Project’s Start run limit with Parallel runs on', () => {
    const capacity = capacityOf(
      snapshot([], { machineCap: 4, parallelRuns: true }),
      1,
    );

    expect(capacity.project.limit).toBe(4);
  });

  it('counts Machine slots across Projects: live Starts and Merges, and working Triage runs Autopilot started', () => {
    const capacity = capacityOf(
      snapshot([
        run({ projectId: 1 }),
        run({ projectId: 2, intent: 'merge', state: 'idle' }),
        run({ intent: 'triage', startedBy: 'autopilot', state: 'waiting' }),
        run({ intent: 'triage', startedBy: 'autopilot', state: 'idle' }),
        run({ intent: 'triage', startedBy: 'user', state: 'running' }),
        run({ intent: 'start', startedBy: 'terminal', state: 'running' }),
        run({ intent: 'spec', state: 'running' }),
      ]),
    );

    expect(capacity.machine.slotsHeld).toBe(3);
    expect(capacity.machine.cap).toBe(3);
    expect(capacity.project).toBeNull();
  });

  it('counts every live Agent process for Autopilot’s headroom, split into working and waiting on the User', () => {
    const capacity = capacityOf(
      snapshot([
        run({ intent: 'start', state: 'running' }),
        run({ intent: 'start', state: 'idle' }),
        run({ intent: 'spec', state: 'waiting' }),
        run({ intent: 'ask', state: 'running' }),
        // A Terminal session counts as working, whatever its state.
        run({ intent: 'start', startedBy: 'terminal', state: 'idle' }),
        // A Triage Autopilot started counts only while it works.
        run({ intent: 'triage', startedBy: 'autopilot', state: 'idle' }),
        run({ intent: 'triage', startedBy: 'autopilot', state: 'running' }),
      ]),
    );

    expect(capacity.liveProcesses).toEqual({ working: 4, waiting: 2 });
    expect(capacity.liveProcessCount).toBe(6);
  });

  it('names the holders oldest first, marking those waiting on the User', () => {
    const capacity = capacityOf(
      snapshot([
        run({ id: 9, ticketNumber: 12, state: 'idle' }),
        run({ id: 4, ticketNumber: null, state: 'running' }),
        run({ id: 7, ticketNumber: 3, state: 'waiting', projectId: 2 }),
      ]),
      1,
    );

    expect(capacity.project.holders).toEqual([
      { id: 4, ticketNumber: null, waitingOnUser: false },
      { id: 9, ticketNumber: 12, waitingOnUser: true },
    ]);
    expect(capacity.machine.holders.map((holder) => holder.id)).toEqual([
      4, 7, 9,
    ]);
  });

  it('says which Triage run of the Project works, the newest when several do', () => {
    const capacity = capacityOf(
      snapshot([
        run({ id: 20, intent: 'triage', state: 'idle' }),
        run({ id: 21, intent: 'triage', state: 'running' }),
        run({
          id: 22,
          intent: 'triage',
          state: 'waiting',
          startedBy: 'terminal',
        }),
        run({ id: 23, intent: 'triage', state: 'running', projectId: 2 }),
      ]),
      1,
    );

    expect(capacity.project.triageRunning).toBe(22);
    expect(
      capacityOf(snapshot([run({ intent: 'triage', state: 'idle' })]), 1)
        .project.triageRunning,
    ).toBeNull();
  });
});

describe('verdictOf', () => {
  it('blocks a Start when the Project’s one Start run slot is held, with Parallel runs off', () => {
    const holder = run({ ticketNumber: 5 });
    const verdict = verdictOf(capacityOf(snapshot([holder]), 1), 'start');

    expect(verdict).toEqual({
      ok: false,
      by: 'projectSlot',
      holders: [{ id: holder.id, ticketNumber: 5, waitingOnUser: false }],
    });
  });

  it('blocks a Merge at the Machine cap, across Projects', () => {
    const verdict = verdictOf(
      capacityOf(
        snapshot([run({ projectId: 2 }), run({ projectId: 3 })], {
          machineCap: 2,
        }),
        1,
      ),
      'merge',
    );

    expect(verdict).toMatchObject({ ok: false, by: 'machineCap', cap: 2 });
  });

  it('leaves the Project’s own limit to the Machine cap with Parallel runs on', () => {
    const capacity = capacityOf(
      snapshot([run(), run()], { parallelRuns: true }),
      1,
    );

    expect(verdictOf(capacity, 'start')).toEqual({ ok: true });
  });

  it('does not count the Conversation about to work against itself', () => {
    const self = run();
    const capacity = capacityOf(snapshot([self], { machineCap: 1 }), 1);

    expect(verdictOf(capacity, 'start', self.id)).toEqual({ ok: true });
    expect(verdictOf(capacity, 'start')).toMatchObject({ ok: false });
  });

  it('never refuses the User’s reply (ADR 0031)', () => {
    const capacity = capacityOf(
      snapshot([run(), run(), run()], { machineCap: 1 }),
      1,
    );

    expect(verdictOf(capacity, 'reply')).toEqual({ ok: true });
  });

  it('never limits interactive intents', () => {
    const capacity = capacityOf(
      snapshot([run(), run(), run()], { machineCap: 1 }),
      1,
    );

    for (const intent of ['ask', 'spec', 'triage', 'batch_triage'] as const) {
      expect(verdictOf(capacity, intent)).toEqual({ ok: true });
    }
  });

  it('blocks Auto-triage while a Triage run of the Project works', () => {
    const working = run({ intent: 'triage', state: 'running' });
    const capacity = capacityOf(snapshot([working]), 1);

    expect(verdictOf(capacity, 'autoTriage')).toEqual({
      ok: false,
      by: 'triageRunning',
      conversationId: working.id,
    });
    expect(verdictOf(capacityOf(snapshot([]), 1), 'autoTriage')).toEqual({
      ok: true,
    });
  });
});

describe('refusalOf', () => {
  it('names the Project’s slot holders in the Start run refusal', () => {
    const capacity = capacityOf(
      snapshot([run({ ticketNumber: 12, state: 'idle' })]),
      1,
    );

    expect(refusalOf(verdictOf(capacity, 'start'))).toBe(
      'This Project already has a Start run working: T12 (waiting on you). Answer, stop or close it first, or turn on Parallel runs in the Project settings to allow more.',
    );
  });

  it('names the cap and its holders in the Machine cap refusal', () => {
    const capacity = capacityOf(
      snapshot(
        [
          run({ id: 101, projectId: 2, ticketNumber: 4 }),
          run({ id: 102, projectId: 2, ticketNumber: null, state: 'waiting' }),
          run({ id: 103, projectId: 3, ticketNumber: 9 }),
        ],
        { machineCap: 3, parallelRuns: true },
      ),
      1,
    );

    expect(refusalOf(verdictOf(capacity, 'start'))).toBe(
      'The machine runs its cap of 3 runs, held by T4, Conversation 102 (waiting on you) and T9. Wait for one to finish, answer or close one, or raise the cap in Settings.',
    );
    const one = capacityOf(
      snapshot([run({ ticketNumber: 4 })], {
        machineCap: 1,
        parallelRuns: true,
      }),
      1,
    );
    expect(refusalOf(verdictOf(one, 'start'))).toBe(
      'The machine runs its cap of 1 run, held by T4. Wait for one to finish, answer or close one, or raise the cap in Settings.',
    );
  });

  it('is null when nothing blocks', () => {
    expect(refusalOf({ ok: true })).toBeNull();
  });
});
