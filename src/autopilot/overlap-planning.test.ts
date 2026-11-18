import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { createChangeChannel } from '../tickets/changes';
import { createAutopilot } from './autopilot';
import type { EngineState } from './explanation';

const settleMs = 30_000;

function setup(
  options: { autopilot?: boolean; overlapPlanning?: boolean } = {},
) {
  const changes = createChangeChannel();
  const world = createTestConversations(changes);
  const { tickets, conversations } = world;
  const project = tickets.createProject({ name: 'Website' });
  tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
    spendCeilingUsd: 50,
    autopilot: options.autopilot ?? false,
    overlapPlanning: options.overlapPlanning ?? true,
  });
  tickets.setMachineSettings({ maxConcurrentRuns: 5 });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  const autopilot = createAutopilot({ tickets, conversations, changes });
  const ready = (title: string, cycleId: number | undefined = cycle.id) =>
    tickets.createTicket({
      projectId: project.id,
      title,
      labels: ['ready-for-agent'],
      ...(cycleId === undefined ? {} : { cycleId }),
    });
  const ofIntent = (intent: string) =>
    conversations
      .list({ projectId: project.id })
      .filter((conversation) => conversation.intent === intent)
      .reverse();
  const plannings = () => ofIntent('overlap_planning');
  /** Ends the working Overlap planning run's turn, as a run that is done. */
  const endPlanning = () => {
    const run = world.runner.runs.findLast(
      (candidate) => candidate.options.toolPolicy === 'judgment',
    );
    run?.emit({ type: 'turn', cost: 0.1 });
  };
  const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
  return {
    ...world,
    changes,
    project,
    cycle,
    autopilot,
    ready,
    ofIntent,
    plannings,
    endPlanning,
    later,
  };
}

const reasonTypes = (state: EngineState<{ type: string }>) =>
  state.state === 'running' ? [] : state.reasons.map(({ type }) => type);

afterEach(() => {
  vi.useRealTimers();
});

describe('Overlap planning (ADR 0054)', () => {
  it('starts one run when a Cycle starts, Started by Autopilot for it, listing the candidates in Board order', async () => {
    const world = setup();
    const a = world.ready('A');
    const b = world.ready('B');
    world.tickets.updateTicket(b.number, { before: a.number });
    world.tickets.startCycle(world.cycle.id);

    await world.autopilot.evaluate();

    const [planning] = world.plannings();
    expect(world.plannings()).toHaveLength(1);
    expect(planning).toMatchObject({
      startedBy: 'autopilot',
      ticketNumber: null,
    });
    expect(world.conversations.judgmentRunOf(planning.id)).toMatchObject({
      intent: 'overlap_planning',
      cycleId: world.cycle.id,
    });
    const message = world.runner.runs[0].firstMessage;
    expect(message).toContain(`T${b.number} "B"`);
    expect(message.indexOf(`T${b.number}`)).toBeLessThan(
      message.indexOf(`T${a.number}`),
    );
  });

  it('starts nothing with the switch off', async () => {
    const world = setup({ overlapPlanning: false });
    world.ready('A');
    world.ready('B');
    world.tickets.startCycle(world.cycle.id);

    await world.autopilot.evaluate();

    expect(world.plannings()).toEqual([]);
    expect(
      reasonTypes(world.autopilot.explain(world.project.id).overlapPlanning),
    ).toEqual(['switchedOff']);
  });

  it('starts nothing with fewer than two candidates: claimed, unready and Epic children are none', async () => {
    const world = setup();
    world.ready('A');
    const claimed = world.ready('Claimed');
    world.tickets.claimTicket(claimed.number, { agentRunId: 'run-1' });
    world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Not ready',
      cycleId: world.cycle.id,
    });
    world.tickets.startCycle(world.cycle.id);

    await world.autopilot.evaluate();

    expect(world.plannings()).toEqual([]);
    expect(
      reasonTypes(world.autopilot.explain(world.project.id).overlapPlanning),
    ).toEqual(['noPlanningDue']);
  });

  it('plans a Cycle once: a run that ended is not followed by another without a new trigger', async () => {
    const world = setup();
    world.ready('A');
    world.ready('B');
    world.tickets.startCycle(world.cycle.id);
    await world.autopilot.evaluate();

    world.endPlanning();
    await world.autopilot.evaluate();

    expect(world.plannings()).toHaveLength(1);
  });

  it('plans again, once, when Tickets are planned into the Active Cycle, after the last one settles', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const world = setup();
    world.ready('A');
    world.ready('B');
    world.tickets.startCycle(world.cycle.id);
    await world.autopilot.evaluate();
    world.endPlanning();
    world.later(1000);

    const c = world.ready('C', undefined);
    const d = world.ready('D', undefined);
    world.tickets.planTickets({
      cycleId: world.cycle.id,
      ticketNumbers: [c.number, d.number],
    });
    await world.autopilot.evaluate();

    expect(world.plannings()).toHaveLength(1);
    expect(
      world.autopilot.explain(world.project.id).overlapPlanning,
    ).toMatchObject({
      state: 'paused',
      reasons: [{ type: 'planningSettles' }],
    });

    world.later(settleMs);
    await world.autopilot.evaluate();
    await world.autopilot.evaluate();

    expect(world.plannings()).toHaveLength(2);
  });

  it('plans again when an Active Cycle Ticket is labelled ready-for-agent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const world = setup();
    world.ready('A');
    world.ready('B');
    const triaged = world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Triaged',
      cycleId: world.cycle.id,
    });
    world.tickets.startCycle(world.cycle.id);
    await world.autopilot.evaluate();
    world.endPlanning();
    world.later(1000);

    world.tickets.updateTicket(triaged.number, {
      addLabels: ['ready-for-agent'],
    });
    world.later(settleMs);
    await world.autopilot.evaluate();

    expect(world.plannings()).toHaveLength(2);
    expect(world.runner.runs.at(-1)?.firstMessage).toContain(
      `T${triaged.number}`,
    );
  });

  it('holds Autopilot back while planning is due or working, then lets it dispatch', async () => {
    const world = setup({ autopilot: true });
    world.ready('A');
    world.ready('B');
    world.tickets.startCycle(world.cycle.id);

    await world.autopilot.evaluate();

    expect(world.ofIntent('start')).toEqual([]);
    const [planning] = world.plannings();
    expect(world.autopilot.explain(world.project.id).autopilot).toEqual({
      state: 'paused',
      reasons: [{ type: 'overlapPlanningFirst', conversationId: planning.id }],
    });

    world.endPlanning();
    await world.autopilot.evaluate();

    expect(world.ofIntent('start')).toHaveLength(2);
  });

  it('runs one at a time, and names the working run as its Pause reason', async () => {
    const world = setup();
    world.ready('A');
    world.ready('B');
    world.tickets.startCycle(world.cycle.id);
    await world.autopilot.evaluate();
    const [planning] = world.plannings();

    expect(world.autopilot.explain(world.project.id).overlapPlanning).toEqual({
      state: 'paused',
      reasons: [{ type: 'judgmentRunWorking', conversationId: planning.id }],
    });
  });

  it("pauses on Autopilot's Project reasons: no Active Cycle, no Spend ceiling, over the Spend ceiling", async () => {
    const world = setup();
    world.ready('A');
    world.ready('B');

    expect(
      reasonTypes(world.autopilot.explain(world.project.id).overlapPlanning),
    ).toEqual(['noActiveCycle']);

    world.tickets.startCycle(world.cycle.id);
    world.tickets.setProjectAgentSettings(world.project.id, {
      spendCeilingUsd: null,
    });
    expect(
      reasonTypes(world.autopilot.explain(world.project.id).overlapPlanning),
    ).toEqual(['noSpendCeiling']);

    world.tickets.setProjectAgentSettings(world.project.id, {
      spendCeilingUsd: 0.05,
    });
    await world.autopilot.evaluate();
    world.endPlanning();
    world.ready('C');
    expect(
      reasonTypes(world.autopilot.explain(world.project.id).overlapPlanning),
    ).toContain('overSpendCeiling');
  });

  it('waits for a free Machine slot', async () => {
    const world = setup();
    world.tickets.setMachineSettings({ maxConcurrentRuns: 1 });
    await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ready('Busy', undefined).number,
      intent: 'start',
      prompt: 'Go',
    });
    world.ready('A');
    world.ready('B');
    world.tickets.startCycle(world.cycle.id);

    await world.autopilot.evaluate();

    expect(world.plannings()).toEqual([]);
    expect(
      reasonTypes(world.autopilot.explain(world.project.id).overlapPlanning),
    ).toEqual(['machineCapFull']);
  });
});
