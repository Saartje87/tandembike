// @vitest-environment node

import { describe, expect, it } from 'vitest';

import type { TokenUsage } from '../footprint/token-usage';
import { createTestConversations } from '../test/conversations';

const opus = 'claude-opus-5-5';
const haiku = 'claude-haiku-5-5';

/** Tokens with `n` of each type times a small factor, easy to add up. */
const tokens = (n: number): TokenUsage => ({
  input: n,
  output: 2 * n,
  cacheWrite: 3 * n,
  cacheRead: 4 * n,
});

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
  });
  world.tickets.setMachineSettings({ maxConcurrentRuns: 10 });
  const lastRun = () => world.runner.runs[world.runner.runs.length - 1];
  const ask = () =>
    world.conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
  return { ...world, project, lastRun, ask };
}

describe('A Conversation’s token usage (T1176)', () => {
  it('has none before a run reports any', async () => {
    const { conversations, ask } = setup();
    const { id } = await ask();

    expect(conversations.usage(id)).toEqual({});
  });

  it('keeps the running total a run reports with each turn, per model', async () => {
    const { conversations, ask, lastRun } = setup();
    const { id } = await ask();

    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(1) },
    });
    lastRun().emit({
      type: 'turn',
      costUsd: 0.2,
      usage: { [opus]: tokens(5) },
    });

    expect(conversations.usage(id)).toEqual({ [opus]: tokens(5) });
  });

  it('adds a resumed run’s usage to the earlier runs’, as cost adds up', async () => {
    const { conversations, ask, lastRun } = setup();
    const { id } = await ask();
    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(5) },
    });
    lastRun().emit({ type: 'exit', error: 'crashed' });

    await conversations.reply(id, 'Again', 'user');
    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(1) },
    });
    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(2) },
    });

    expect(conversations.usage(id)).toEqual({ [opus]: tokens(7) });
  });

  it('records a row per model when a run switches models', async () => {
    const { conversations, ask, lastRun } = setup();
    const { id } = await ask();

    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(5), [haiku]: tokens(1) },
    });
    lastRun().emit({ type: 'exit' });
    await conversations.reply(id, 'Again', 'user');
    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [haiku]: tokens(2) },
    });

    expect(conversations.usage(id)).toEqual({
      [opus]: tokens(5),
      [haiku]: tokens(3),
    });
  });

  it('keeps the usage a stopped run reports after the stop', async () => {
    const { conversations, ask, lastRun } = setup();
    const { id } = await ask();
    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(1) },
    });

    await conversations.stop(id);
    lastRun().emit({
      type: 'turn',
      costUsd: 0.2,
      error: 'interrupted',
      usage: { [opus]: tokens(4) },
    });

    expect(conversations.usage(id)).toEqual({ [opus]: tokens(4) });
  });

  it('records Autopilot’s Conversations as it does the User’s', async () => {
    const { conversations, tickets, project, lastRun } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const { id } = await conversations.start({
      startedBy: 'autopilot',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });

    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(3) },
    });

    expect(conversations.usage(id)).toEqual({ [opus]: tokens(3) });
  });
});

describe('Usage totals (T1177)', () => {
  /** Starts a Conversation, reporting `n` Opus tokens unless `n` is null. */
  const run = async (
    world: ReturnType<typeof setup>,
    input: {
      ticketNumber?: number;
      startedBy?: 'user' | 'autopilot';
      cycleId?: number;
      n: number | null;
    },
  ) => {
    const conversation = await world.conversations.start({
      startedBy: input.startedBy ?? 'user',
      ...(input.ticketNumber === undefined
        ? { projectId: world.project.id, intent: 'ask' as const }
        : { ticketNumber: input.ticketNumber, intent: 'start' as const }),
      ...(input.cycleId === undefined ? {} : { cycleId: input.cycleId }),
      prompt: 'Go',
    });
    if (input.n !== null) {
      world.lastRun().emit({
        type: 'turn',
        costUsd: 0.1,
        usage: { [opus]: tokens(input.n) },
      });
    }
    return conversation;
  };

  it('sums a Project’s Conversations of all time, hand-started and Autopilot’s alike, and counts the ones not measured', async () => {
    const world = setup();
    const ticket = world.tickets.createTicket({
      projectId: world.project.id,
      title: 'A',
    });
    await run(world, { ticketNumber: ticket.number, n: 1 });
    await run(world, {
      ticketNumber: ticket.number,
      startedBy: 'autopilot',
      n: 2,
    });
    await run(world, { n: 4 });
    await run(world, { n: null });
    const other = world.tickets.createProject({ name: 'Other' });

    expect(
      world.conversations.usageTotal({ projectId: world.project.id }),
    ).toEqual({
      usage: { [opus]: tokens(7) },
      conversations: 4,
      notMeasured: 1,
    });
    expect(world.conversations.usageTotal({ projectId: other.id })).toEqual({
      usage: {},
      conversations: 0,
      notMeasured: 0,
    });
  });

  it('counts a Conversation towards the Cycle Autopilot started it for, else its Ticket’s Cycles', async () => {
    const world = setup();
    const { tickets, project } = world;
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });
    const other = tickets.createCycle({ projectId: project.id, title: 'B' });
    const inCycle = tickets.createTicket({
      projectId: project.id,
      title: 'In A',
      cycleId: cycle.id,
    });
    const inOther = tickets.createTicket({
      projectId: project.id,
      title: 'In B',
      cycleId: other.id,
    });
    // Hand-started on a Ticket of the Cycle.
    await run(world, { ticketNumber: inCycle.number, n: 1 });
    await run(world, { ticketNumber: inCycle.number, n: null });
    // Autopilot started it for the Cycle, though its Ticket is now in B.
    await run(world, {
      ticketNumber: inOther.number,
      startedBy: 'autopilot',
      cycleId: cycle.id,
      n: 2,
    });
    // Hand-started on B's Ticket, and a Project-scoped one: not A's.
    await run(world, { ticketNumber: inOther.number, n: 8 });
    await run(world, { n: 16 });

    expect(
      world.conversations.usageTotal({
        projectId: project.id,
        cycleId: cycle.id,
      }),
    ).toEqual({
      usage: { [opus]: tokens(3) },
      conversations: 3,
      notMeasured: 1,
    });
    expect(
      world.conversations.usageTotal({
        projectId: project.id,
        cycleId: other.id,
      }),
    ).toEqual({
      usage: { [opus]: tokens(8) },
      conversations: 1,
      notMeasured: 0,
    });
  });
});
