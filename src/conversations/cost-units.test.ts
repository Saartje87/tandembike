import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';
import type { AgentKind } from '../tickets/agent-kind';

const midnight = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
};

/** A world whose Copilot runner reports AI credits, as T602's will. */
function setup() {
  const world = createTestConversations();
  world.runners.copilot.capabilities = {
    ...world.runners.copilot.capabilities,
    costUnit: 'ai_credits',
  };
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
    autopilot: true,
    spendCeilingUsd: 5,
    autoTriage: true,
    triageCeilingUsd: 4,
  });
  const cycle = world.tickets.createCycle({
    projectId: project.id,
    title: 'Beta',
  });
  world.tickets.startCycle(cycle.id);
  const ticket = () =>
    world.tickets.createTicket({
      projectId: project.id,
      title: 'Work',
      cycleId: cycle.id,
    });
  /** Starts a Conversation on `kind` and has its run cost `cost`. */
  const run = async (
    kind: AgentKind,
    cost: number,
    {
      intent = 'start' as 'start' | 'triage',
      startedBy = 'autopilot' as 'user' | 'autopilot',
      done = false,
    } = {},
  ) => {
    world.tickets.setProjectAgentSettings(project.id, {
      defaultAgentKind: kind,
    });
    const work = ticket();
    const conversation = await world.conversations.start({
      startedBy,
      ticketNumber: work.number,
      intent,
      prompt: 'Go',
      ...(startedBy === 'autopilot' ? { cycleId: cycle.id } : {}),
    });
    if (done) {
      world.tickets.updateTicket(work.number, { status: 'Done' });
    }
    world.runners[kind].runs.at(-1)?.emit({ type: 'turn', cost });
    return conversation;
  };
  return { ...world, project, cycle, run };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Cost in its unit (ADR 0051)', () => {
  it("stores each Conversation's cost, and each Run outcome's, in its runner's unit", async () => {
    const world = setup();

    const claude = await world.run('claude-code', 1.25);
    const copilot = await world.run('copilot', 30);
    world.runners['claude-code'].runs[0].emit({ type: 'exit' });
    world.runners.copilot.runs[0].emit({ type: 'exit' });

    expect(world.conversations.get(claude.id)).toMatchObject({
      cost: 1.25,
      costUnit: 'usd',
    });
    expect(world.conversations.get(copilot.id)).toMatchObject({
      cost: 30,
      costUnit: 'ai_credits',
    });
    expect(world.conversations.latestRunOutcome(copilot.id)).toMatchObject({
      cost: 30,
      costUnit: 'ai_credits',
    });
  });

  it("checks the Spend ceiling in the unit of the default agent, counting only that unit's spend", async () => {
    const world = setup();
    await world.run('claude-code', 3);
    await world.run('copilot', 50);

    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'claude-code',
    });
    expect(
      world.conversations.spendBudget({
        projectId: world.project.id,
        cycleId: world.cycle.id,
      }),
    ).toEqual({ spend: 3, ceiling: 5, unit: 'usd', paused: false });

    // No ceiling is kept in AI credits yet, so none guards that spend.
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
    });
    expect(
      world.conversations.spendBudget({
        projectId: world.project.id,
        cycleId: world.cycle.id,
      }),
    ).toBeNull();
    expect(
      world.conversations.autopilotSpend({
        projectId: world.project.id,
        cycleId: world.cycle.id,
      }),
    ).toBe(50);
  });

  it('keeps the Triage and Machine ceilings in dollars, counting only dollar spend', async () => {
    const world = setup();
    world.tickets.setMachineSettings({ dailySpendCeilingUsd: 10 });
    await world.run('claude-code', 2, { intent: 'triage' });
    await world.run('copilot', 70, { intent: 'triage' });
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'claude-code',
    });

    expect(world.conversations.triageBudget(world.project.id)).toEqual({
      spend: 2,
      ceiling: 4,
      unit: 'usd',
      paused: false,
    });
    expect(world.conversations.machineBudget()).toEqual({
      spend: 2,
      ceiling: 10,
      unit: 'usd',
      paused: false,
    });
    expect(world.conversations.autopilotSpendToday(midnight(), 'usd')).toBe(2);
    expect(
      world.conversations.autopilotSpendToday(midnight(), 'ai_credits'),
    ).toBe(70);
  });

  it('estimates a Start from Conversations of the same Agent kind only', async () => {
    const world = setup();
    for (const cost of [1, 1, 1, 1, 1]) {
      await world.run('claude-code', cost, { startedBy: 'user', done: true });
    }
    for (const cost of [40, 40, 40, 40, 40]) {
      await world.run('copilot', cost, { startedBy: 'user', done: true });
    }
    for (const run of [
      ...world.runners['claude-code'].runs,
      ...world.runners.copilot.runs,
    ]) {
      run.emit({ type: 'exit' });
    }

    expect(
      world.conversations.startCostEstimate(world.project.id, 'claude-code'),
    ).toBe(1);
    expect(
      world.conversations.startCostEstimate(world.project.id, 'copilot'),
    ).toBe(40);
  });
});
