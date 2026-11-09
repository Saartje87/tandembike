// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { createChangeChannel } from '../tickets/changes';
import { createAutopilot } from './autopilot';

function setup(options: { autopilot?: boolean; parallel?: number } = {}) {
  const changes = createChangeChannel();
  const world = createTestConversations(changes);
  const { tickets, conversations } = world;
  const project = tickets.createProject({ name: 'Website' });
  tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    ...(options.parallel === undefined
      ? {}
      : { parallelRuns: true, maxConcurrentRuns: options.parallel }),
    ...(options.autopilot === false
      ? {}
      : { autopilot: true, spendCeilingUsd: 50 }),
  });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  const autopilot = createAutopilot({ tickets, conversations, changes });
  const ready = (title: string, extra: { type?: 'Epic' } = {}) =>
    tickets.createTicket({
      projectId: project.id,
      title,
      labels: ['ready-for-agent'],
      cycleId: cycle.id,
      ...extra,
    });
  const started = () =>
    conversations
      .list({ projectId: project.id })
      .reverse()
      .map((conversation) => conversation.ticketNumber);
  return { ...world, changes, project, cycle, autopilot, ready, started };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Autopilot dispatch', () => {
  it('never retries: a Ticket with a stopped Start Conversation waits for the User, until the Conversation is closed', async () => {
    const {
      tickets,
      conversations,
      project,
      cycle,
      autopilot,
      ready,
      started,
    } = setup({ parallel: 9 });
    const a = ready('A');
    tickets.startCycle(cycle.id);
    await autopilot.evaluate(project.id);
    const id = conversations.list({ ticketNumber: a.number })[0].id;

    await conversations.stop(id);
    await autopilot.evaluate(project.id);
    expect(started()).toEqual([a.number]);

    await conversations.close(id);
    await autopilot.evaluate(project.id);
    expect(started()).toEqual([a.number, a.number]);
  });

  it('starts Eligible work in Todo order, up to the free slots, as Autopilot with the Start message', async () => {
    const { tickets, conversations, project, cycle, autopilot, ready, runner } =
      setup({ parallel: 2 });
    const a = ready('A');
    const b = ready('B');
    const c = ready('C');
    tickets.sortLane({
      projectId: project.id,
      status: 'Todo',
      cycleId: cycle.id,
      ticketNumbers: [c.number, a.number, b.number],
    });
    tickets.startCycle(cycle.id);

    await autopilot.evaluate(project.id);

    const list = conversations.list({ projectId: project.id }).reverse();
    expect(list.map((x) => x.ticketNumber)).toEqual([c.number, a.number]);
    expect(list.every((x) => x.startedBy === 'autopilot')).toBe(true);
    expect(list.every((x) => x.intent === 'start')).toBe(true);
    expect(runner.runs[0].options.prompt).toBe(
      `/tandembike:implement T${c.number}`,
    );
  });

  it('starts an Epic again once it is sent Back to Todo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const {
      tickets,
      conversations,
      project,
      cycle,
      autopilot,
      ready,
      started,
    } = setup();
    const epic = ready('Spec', { type: 'Epic' });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic.number,
    });
    tickets.startCycle(cycle.id);
    await autopilot.evaluate(project.id);
    await conversations.stop(
      conversations.list({ ticketNumber: epic.number })[0].id,
    );
    tickets.updateTicket(child.number, { status: 'In progress' });
    vi.setSystemTime(Date.now() + 1000);

    tickets.backToTodo(epic.number);
    await autopilot.evaluate(project.id);

    expect(started()).toEqual([epic.number, epic.number]);
  });

  it('starts an Epic with the Epic command', async () => {
    const { tickets, project, cycle, autopilot, ready, runner } = setup();
    const epic = ready('Spec', { type: 'Epic' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic.number,
    });
    tickets.startCycle(cycle.id);

    await autopilot.evaluate(project.id);

    expect(runner.runs[0].options.prompt).toBe(
      `/tandembike:implement-epic T${epic.number}`,
    );
  });

  it('never starts unready, blocked, claimed, archived or running work, Epic children, or an Epic with no child', async () => {
    const { tickets, project, cycle, autopilot, ready, started } = setup({
      parallel: 10,
    });
    const plain = (title: string) =>
      tickets.createTicket({
        projectId: project.id,
        title,
        cycleId: cycle.id,
      });
    plain('unready');
    const blocker = ready('blocker');
    const blocked = ready('blocked');
    tickets.addBlocker({ blocker: blocker.number, blocked: blocked.number });
    const claimed = ready('claimed');
    tickets.claimTicket(claimed.number, { agentRunId: 'x' });
    const archived = ready('archived');
    tickets.archiveTicket(archived.number);
    const emptyEpic = ready('Empty', { type: 'Epic' });
    const epic = ready('Full', { type: 'Epic' });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic.number,
      labels: ['ready-for-agent'],
      cycleId: cycle.id,
    });
    const doing = ready('doing');
    tickets.startCycle(cycle.id);

    await autopilot.evaluate(project.id);
    await autopilot.evaluate(project.id);

    expect(started().sort()).toEqual(
      [blocker.number, epic.number, doing.number].sort(),
    );
    expect(started()).not.toContain(emptyEpic.number);
    expect(started()).not.toContain(child.number);
    expect(started()).not.toContain(claimed.number);
  });

  it('dispatches nothing with the switch off or without an Active Cycle', async () => {
    const off = setup({ autopilot: false });
    off.ready('A');
    off.tickets.startCycle(off.cycle.id);
    await off.autopilot.evaluate(off.project.id);
    expect(off.started()).toEqual([]);

    const noCycle = setup();
    noCycle.ready('A');
    await noCycle.autopilot.evaluate(noCycle.project.id);
    expect(noCycle.started()).toEqual([]);
  });

  it('never starts the same Ticket twice under a burst of evaluations', async () => {
    const { tickets, project, cycle, autopilot, ready, started, runner } =
      setup({ parallel: 5 });
    const a = ready('A');
    ready('B');
    tickets.startCycle(cycle.id);

    await Promise.all(
      Array.from({ length: 10 }, () => autopilot.evaluate(project.id)),
    );

    expect(started()).toHaveLength(2);
    expect(started()).toContain(a.number);
    expect(runner.runs).toHaveLength(2);
  });

  it('dispatches on its own when the switch flips, a Cycle starts, a Blocker is done, a Ticket is sent Back to Todo or a slot frees', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const world = setup({ autopilot: false, parallel: 9 });
    const {
      tickets,
      conversations,
      project,
      cycle,
      autopilot,
      ready,
      started,
    } = world;
    const stop = autopilot.start();

    const a = ready('A');
    const blocker = ready('Blocker');
    const blocked = ready('Blocked');
    tickets.addBlocker({ blocker: blocker.number, blocked: blocked.number });
    await autopilot.idle();
    expect(started()).toEqual([]);

    tickets.setProjectAgentSettings(project.id, {
      autopilot: true,
      spendCeilingUsd: 10,
    });
    await autopilot.idle();
    expect(started()).toEqual([]);

    tickets.startCycle(cycle.id);
    await autopilot.idle();
    expect(started()).toEqual([a.number, blocker.number]);

    tickets.completeTicket(blocker.number);
    await autopilot.idle();
    expect(started()).toEqual([a.number, blocker.number, blocked.number]);

    // Back to Todo makes a parked Ticket Eligible again.
    await conversations.stop(
      conversations.list({ ticketNumber: a.number })[0].id,
    );
    tickets.updateTicket(a.number, { status: 'In progress' });
    await autopilot.idle();
    vi.setSystemTime(Date.now() + 1000);
    tickets.backToTodo(a.number);
    await autopilot.idle();
    expect(started().filter((n) => n === a.number)).toHaveLength(2);
    stop();
  });

  it('frees a slot for the next Ticket when a run is stopped', async () => {
    const world = setup();
    const {
      tickets,
      conversations,
      project,
      cycle,
      autopilot,
      ready,
      started,
    } = world;
    const a = ready('A');
    const b = ready('B');
    tickets.startCycle(cycle.id);
    const stop = autopilot.start();
    await autopilot.idle();
    expect(started()).toEqual([a.number]);

    // The run claims and moves its Ticket, as an Agent does.
    tickets.updateTicket(a.number, { status: 'In progress' });
    await conversations.stop(
      conversations.list({ projectId: project.id })[0].id,
    );
    await autopilot.idle();
    expect(started()).toEqual([a.number, b.number]);
    stop();
  });

  it('dispatches nothing while a User reply keeps working Starts at or over the limit (T1185)', async () => {
    const {
      tickets,
      conversations,
      project,
      cycle,
      autopilot,
      ready,
      started,
      runner,
    } = setup();
    const a = ready('A');
    const b = ready('B');
    const c = ready('C');
    tickets.startCycle(cycle.id);
    await autopilot.evaluate(project.id);
    // A goes idle waiting for the User, so its slot goes to B.
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    await autopilot.evaluate(project.id);
    expect(started()).toEqual([a.number, b.number]);

    // The User answers A: two Starts work against a limit of one.
    const first = conversations.list({ ticketNumber: a.number })[0];
    await conversations.reply(first.id, 'Go on', 'user');
    await autopilot.evaluate(project.id);
    expect(started()).toEqual([a.number, b.number]);

    // Back at the limit, still nothing; below it, the next Ticket starts.
    runner.runs[1].emit({ type: 'turn', costUsd: 0 });
    await autopilot.evaluate(project.id);
    expect(started()).toEqual([a.number, b.number]);
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    await autopilot.evaluate(project.id);
    expect(started()).toEqual([a.number, b.number, c.number]);
  });

  it('leaves a Ticket in Review alone and gives a working Merge a slot (T1221)', async () => {
    const {
      tickets,
      conversations,
      project,
      cycle,
      autopilot,
      ready,
      started,
    } = setup();
    const review = tickets.createTicket({
      projectId: project.id,
      title: 'Handed off',
    });
    tickets.updateTicket(review.number, { status: 'In progress' });
    tickets.addExternalReferences(review.number, [
      'https://github.com/acme/site/pull/12',
    ]);
    const next = ready('Next');
    tickets.startCycle(cycle.id);
    await conversations.approveMerge({ ticketNumber: review.number });

    await autopilot.evaluate(project.id);
    expect(started()).toEqual([review.number]);

    const merge = conversations.list({ ticketNumber: review.number })[0];
    await conversations.stop(merge.id);
    await autopilot.evaluate(project.id);
    expect(started()).toEqual([review.number, next.number]);
    expect(
      conversations
        .list({ projectId: project.id })
        .filter((conversation) => conversation.intent === 'merge'),
    ).toHaveLength(1);
  });

  it('leaves running runs alone when it is turned off', async () => {
    const world = setup();
    const {
      tickets,
      conversations,
      project,
      cycle,
      autopilot,
      ready,
      started,
    } = world;
    ready('A');
    tickets.startCycle(cycle.id);
    await autopilot.evaluate(project.id);
    tickets.setProjectAgentSettings(project.id, {
      autopilot: false,
      parallelRuns: true,
      maxConcurrentRuns: 5,
    });
    ready('B');
    await autopilot.evaluate(project.id);

    expect(started()).toHaveLength(1);
    expect(conversations.list({ projectId: project.id })[0].state).toBe(
      'running',
    );
  });

  describe('Spend ceiling', () => {
    /** Cycle with A running, spent $1.50 against a $1 ceiling, and B queued. */
    async function overCeiling() {
      const world = setup();
      const { tickets, conversations, runner, project, cycle, ready } = world;
      const a = ready('A');
      const b = ready('B');
      tickets.setProjectAgentSettings(project.id, { spendCeilingUsd: 1 });
      tickets.startCycle(cycle.id);
      const stop = world.autopilot.start();
      await world.autopilot.idle();
      runner.runs[0].emit({ type: 'turn', costUsd: 1.5 });
      tickets.completeTicket(a.number);
      await conversations.stop(
        conversations.list({ projectId: project.id })[0].id,
      );
      await world.autopilot.idle();
      return { ...world, a, b, stop };
    }

    it('starts nothing at or over the ceiling, keeps the switch on and leaves a running run alone', async () => {
      const world = setup({ parallel: 3 });
      const { tickets, conversations, runner, project, cycle, ready } = world;
      tickets.setProjectAgentSettings(project.id, { spendCeilingUsd: 1 });
      const a = ready('A');
      tickets.startCycle(cycle.id);
      await world.autopilot.evaluate(project.id);
      runner.runs[0].emit({ type: 'turn', costUsd: 1 });
      ready('B');

      await world.autopilot.evaluate(project.id);

      expect(world.started()).toEqual([a.number]);
      expect(tickets.getProjectAgentSettings(project.id).autopilot).toBe(true);
      expect(conversations.list({ projectId: project.id })[0].state).toBe(
        'idle',
      );
    });

    it('resumes at once when the ceiling is raised', async () => {
      const { tickets, project, autopilot, started, a, b, stop } =
        await overCeiling();
      expect(started()).toEqual([a.number]);

      tickets.setProjectAgentSettings(project.id, { spendCeilingUsd: 10 });
      await autopilot.idle();

      expect(started()).toEqual([a.number, b.number]);
      stop();
    });

    it('resumes at once when the next Cycle starts, since the spend is per Cycle', async () => {
      const { tickets, project, autopilot, started, a, b, stop } =
        await overCeiling();
      const next = tickets.createCycle({
        projectId: project.id,
        title: 'Next',
      });
      // The open B rolls over into the new Cycle, whose spend starts at zero.
      tickets.startCycle(next.id, { archiveActive: true });
      await autopilot.idle();

      expect(started()).toEqual([a.number, b.number]);
      stop();
    });

    it("does not count hand-started Conversations' cost", async () => {
      const world = setup();
      const { tickets, conversations, runner, project, cycle, ready } = world;
      const a = ready('A');
      ready('B');
      tickets.setProjectAgentSettings(project.id, { spendCeilingUsd: 1 });
      tickets.startCycle(cycle.id);
      await conversations.start({
        startedBy: 'user',
        ticketNumber: a.number,
        intent: 'start',
        prompt: 'Go',
      });
      runner.runs[0].emit({ type: 'turn', costUsd: 5 });
      await conversations.stop(
        conversations.list({ projectId: project.id })[0].id,
      );

      await world.autopilot.evaluate(project.id);

      expect(world.started()).toHaveLength(2);
    });
  });
});

describe('Autopilot startup', () => {
  /**
   * Two Tickets in a started Cycle, each with a run that Autopilot started and
   * one the User started, then a server restart: a new Conversations module
   * and a new Autopilot over the same database, with every run interrupted.
   */
  async function restarted(
    options: {
      autopilot?: boolean;
      parallel?: number;
      ceiling?: number;
      spent?: number;
    } = {},
  ) {
    const world = setup({ parallel: 9 });
    const { tickets, conversations, project, cycle, ready } = world;
    const mine = ready('Autopilot run');
    const yours = ready('User run');
    tickets.startCycle(cycle.id);
    await conversations.start({
      startedBy: 'autopilot',
      ticketNumber: mine.number,
      intent: 'start',
      cycleId: cycle.id,
      prompt: 'Go',
    });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: yours.number,
      intent: 'start',
      prompt: 'Go',
    });
    // The runs claimed and moved their Tickets, as Agents do.
    tickets.updateTicket(mine.number, { status: 'In progress' });
    tickets.updateTicket(yours.number, { status: 'In progress' });
    if (options.spent !== undefined) {
      world.runner.runs[0].emit({ type: 'turn', costUsd: options.spent });
    }
    const fresh = world.restart();
    fresh.interruptStale();
    tickets.setProjectAgentSettings(project.id, {
      parallelRuns: true,
      maxConcurrentRuns: options.parallel ?? 9,
      ...(options.autopilot === undefined
        ? {}
        : { autopilot: options.autopilot }),
      ...(options.ceiling === undefined
        ? {}
        : { spendCeilingUsd: options.ceiling }),
    });
    const autopilot = createAutopilot({
      tickets,
      conversations: fresh,
      changes: world.changes,
    });
    const stateOf = (ticketNumber: number) =>
      fresh.list({ ticketNumber })[0].state;
    return { ...world, fresh, autopilot, mine, yours, stateOf };
  }

  it('resumes its own interrupted Conversations with the fixed reply, sent by Autopilot, and leaves the User ones', async () => {
    const { fresh, autopilot, mine, yours, stateOf } = await restarted();

    const stop = autopilot.start();
    await autopilot.idle();

    expect(stateOf(mine.number)).toBe('running');
    expect(stateOf(yours.number)).toBe('interrupted');
    const conversation = fresh.list({ ticketNumber: mine.number })[0];
    const last = fresh.transcript(conversation.id).at(-1);
    expect(last?.role).toBe('autopilot');
    expect(last?.text).toBe(
      `The server restarted. Continue T${mine.number} from where you left off`,
    );
    stop();
  });

  it('still gives the startup resume its one transient resume when it ends on a transient error', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const { fresh, autopilot, mine, runner } = await restarted({ spent: 1 });
    const stop = autopilot.start();
    await autopilot.idle();

    runner.runs[runner.runs.length - 1].emit({
      type: 'turn',
      costUsd: 1,
      error: 'API Error: 529 overloaded',
    });
    await autopilot.evaluate(mine.projectId);
    await vi.advanceTimersByTimeAsync(60_000);
    await autopilot.idle();

    const conversation = fresh.list({ ticketNumber: mine.number })[0];
    expect(
      fresh
        .transcript(conversation.id)
        .filter((entry) => entry.text.startsWith('The last run ended')),
    ).toHaveLength(1);
    stop();
  });

  it("leaves Autopilot's interrupted Conversations interrupted when their Ticket is Done, archived or not in the Active Cycle", async () => {
    const done = await restarted();
    done.tickets.completeTicket(done.mine.number);
    done.autopilot.start();
    await done.autopilot.idle();
    expect(done.stateOf(done.mine.number)).toBe('interrupted');

    const archived = await restarted();
    archived.tickets.archiveTicket(archived.mine.number);
    archived.autopilot.start();
    await archived.autopilot.idle();
    expect(archived.stateOf(archived.mine.number)).toBe('interrupted');

    const elsewhere = await restarted();
    elsewhere.tickets.unplanTicket({
      cycleId: elsewhere.cycle.id,
      number: elsewhere.mine.number,
    });
    elsewhere.autopilot.start();
    await elsewhere.autopilot.idle();
    expect(elsewhere.stateOf(elsewhere.mine.number)).toBe('interrupted');
  });

  it('resumes before it dispatches new work, and never beyond the cap', async () => {
    const { fresh, autopilot, project, ready, mine, stateOf } = await restarted(
      { parallel: 1 },
    );
    const fresh1 = ready('New');

    const stop = autopilot.start();
    await autopilot.idle();

    expect(stateOf(mine.number)).toBe('running');
    expect(fresh.list({ ticketNumber: fresh1.number })).toEqual([]);
    const working = fresh
      .list({ projectId: project.id })
      .filter((x) => x.state === 'running');
    expect(working).toHaveLength(1);
    stop();
  });

  it('dispatches new work in the slots the resumes leave', async () => {
    const { fresh, autopilot, ready, mine, stateOf } = await restarted({
      parallel: 2,
    });
    const next = ready('New');

    const stop = autopilot.start();
    await autopilot.idle();

    expect(stateOf(mine.number)).toBe('running');
    expect(fresh.list({ ticketNumber: next.number })[0].state).toBe('running');
    stop();
  });

  it('resumes nothing with the switch off, without an Active Cycle, or at the ceiling', async () => {
    const off = await restarted({ autopilot: false });
    off.autopilot.start();
    await off.autopilot.idle();
    expect(off.stateOf(off.mine.number)).toBe('interrupted');

    const over = await restarted({ ceiling: 1, spent: 2 });
    over.autopilot.start();
    await over.autopilot.idle();
    expect(over.stateOf(over.mine.number)).toBe('interrupted');

    const noCycle = await restarted();
    noCycle.tickets.archiveCycle(noCycle.cycle.id);
    noCycle.autopilot.start();
    await noCycle.autopilot.idle();
    expect(noCycle.stateOf(noCycle.mine.number)).toBe('interrupted');
  });
});

describe('Autopilot transient resume (ADR 0034)', () => {
  const resumeText =
    'The last run ended on a transient error. Continue where you left off.';
  const overloaded = {
    type: 'turn',
    costUsd: 1,
    error: 'API Error: 529 overloaded',
  } as const;

  const begin = async (options: Parameters<typeof setup>[0] = {}) => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const world = setup({ parallel: 3, ...options });
    const ticket = world.ready('A');
    world.tickets.startCycle(world.cycle.id);
    await world.autopilot.evaluate(world.project.id);
    const conversation = world.conversations.list({
      ticketNumber: ticket.number,
    })[0];
    const resumes = () =>
      world.conversations
        .transcript(conversation.id)
        .filter((entry) => entry.text === resumeText);
    return { ...world, ticket, conversation, resumes };
  };

  it('resumes a failed_transient Start Conversation once, 60 seconds later, as Autopilot', async () => {
    const { runner, autopilot, project, resumes } = await begin();
    runner.runs[0].emit(overloaded);
    await autopilot.evaluate(project.id);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(resumes()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);
    await autopilot.idle();

    expect(resumes().map((entry) => entry.role)).toEqual(['autopilot']);
  });

  it('does not resume a failed outcome', async () => {
    const { runner, autopilot, project, resumes } = await begin();
    runner.runs[0].emit({ type: 'turn', costUsd: 1, error: 'error_max_turns' });
    await autopilot.evaluate(project.id);
    await vi.advanceTimersByTimeAsync(120_000);
    await autopilot.idle();
    expect(resumes()).toHaveLength(0);
  });

  it('does not resume while Autopilot is off', async () => {
    const { runner, autopilot, project, tickets, resumes } = await begin();
    runner.runs[0].emit(overloaded);
    await autopilot.evaluate(project.id);
    tickets.setProjectAgentSettings(project.id, { autopilot: false });
    await vi.advanceTimersByTimeAsync(120_000);
    await autopilot.idle();
    expect(resumes()).toHaveLength(0);
  });

  it('does not resume over the Spend ceiling', async () => {
    const { runner, autopilot, project, tickets, resumes } = await begin();
    runner.runs[0].emit(overloaded);
    tickets.setProjectAgentSettings(project.id, { spendCeilingUsd: 1 });
    await autopilot.evaluate(project.id);
    await vi.advanceTimersByTimeAsync(120_000);
    await autopilot.idle();
    expect(resumes()).toHaveLength(0);
  });

  it('does not resume beyond the Start run limit', async () => {
    const { runner, autopilot, project, tickets, conversations, resumes } =
      await begin({ parallel: 1 });
    runner.runs[0].emit(overloaded);
    const other = tickets.createTicket({ projectId: project.id, title: 'B' });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: other.number,
      intent: 'start',
      prompt: 'go',
    });
    await autopilot.evaluate(project.id);
    await vi.advanceTimersByTimeAsync(120_000);
    await autopilot.idle();
    expect(resumes()).toHaveLength(0);
  });

  it('resumes a hand-started Conversation while Autopilot is on', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const { tickets, conversations, runner, autopilot, project, cycle } = setup(
      { parallel: 3 },
    );
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Manual',
      cycleId: cycle.id,
    });
    tickets.startCycle(cycle.id);
    const conversation = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'go',
    });
    runner.runs[0].emit(overloaded);
    await autopilot.evaluate(project.id);
    await vi.advanceTimersByTimeAsync(60_000);
    await autopilot.idle();
    expect(
      conversations
        .transcript(conversation.id)
        .filter((entry) => entry.text === resumeText),
    ).toHaveLength(1);
  });

  it('resumes no second time after a transient end of its own resume, until the User replies', async () => {
    const { runner, autopilot, project, conversations, conversation, resumes } =
      await begin();
    runner.runs[0].emit(overloaded);
    await autopilot.evaluate(project.id);
    await vi.advanceTimersByTimeAsync(60_000);
    await autopilot.idle();
    expect(resumes()).toHaveLength(1);

    runner.runs[0].emit(overloaded);
    await autopilot.evaluate(project.id);
    await vi.advanceTimersByTimeAsync(300_000);
    await autopilot.idle();
    expect(resumes()).toHaveLength(1);

    await conversations.reply(conversation.id, 'try again', 'user');
    runner.runs[0].emit(overloaded);
    await autopilot.evaluate(project.id);
    await vi.advanceTimersByTimeAsync(60_000);
    await autopilot.idle();
    expect(resumes()).toHaveLength(2);
  });
});
