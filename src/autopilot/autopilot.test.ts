// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { createChangeChannel } from '../tickets/changes';
import { createAutopilot } from './autopilot';

function setup(options: { autopilot?: boolean; parallel?: number } = {}) {
  const changes = createChangeChannel();
  const world = createTestConversations(changes);
  const { tickets, conversations, runner } = world;
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

describe('Autopilot dispatch', () => {
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
      `/mattpocock-skills:implement T${c.number}`,
    );
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
      `/mattpocock-skills:implement-spec T${epic.number}`,
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
