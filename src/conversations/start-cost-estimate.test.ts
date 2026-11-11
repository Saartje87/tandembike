import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
  });
  let at = new Date('2026-01-01T10:00:00Z').getTime();
  vi.useFakeTimers();
  const tick = () => {
    at += 60_000;
    vi.setSystemTime(at);
  };

  /** Runs one Start to its end, costing `cost`, finished or not. */
  const runStart = async (
    cost: number,
    { done = true, pr = false, intent = 'start' as 'start' | 'triage' } = {},
  ) => {
    const ticket = world.tickets.createTicket({
      projectId: project.id,
      title: 'Work',
    });
    tick();
    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent,
      prompt: 'Go',
    });
    const run = world.runner.runs[world.runner.runs.length - 1];
    if (done) {
      world.tickets.updateTicket(ticket.number, { status: 'Done' });
    }
    if (pr) {
      world.tickets.updateTicket(ticket.number, { status: 'In progress' });
      world.tickets.addExternalReferences(ticket.number, [
        'https://github.com/acme/site/pull/12',
      ]);
    }
    tick();
    run.emit({ type: 'turn', cost });
    return { conversation, run, ticket };
  };
  return { ...world, project, runStart };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('startCostEstimate', () => {
  it('is null with fewer than 5 qualifying Conversations', async () => {
    const { conversations, project, runStart } = setup();
    for (const cost of [1, 2, 3, 4]) {
      await runStart(cost);
    }
    await runStart(100, { done: false });
    expect(conversations.startCostEstimate(project.id)).toBeNull();
  });

  it('is the median cost of the qualifying Conversations', async () => {
    const { conversations, project, runStart } = setup();
    for (const cost of [9, 1, 5, 3, 7]) {
      await runStart(cost);
    }
    expect(conversations.startCostEstimate(project.id)).toBe(5);
    await runStart(11);
    expect(conversations.startCostEstimate(project.id)).toBe(6);
  });

  it('counts pr_open, and ignores other Stages and unfinished Starts', async () => {
    const { conversations, project, runStart } = setup();
    for (const cost of [1, 2, 3, 4]) {
      await runStart(cost);
    }
    await runStart(5, { done: false, pr: true });
    await runStart(500, { intent: 'triage' });
    expect(conversations.startCostEstimate(project.id)).toBe(3);
  });

  it('sums the runs of a resumed Conversation and counts it once', async () => {
    const { conversations, project, runStart } = setup();
    for (const cost of [1, 1, 1, 1]) {
      await runStart(cost);
    }
    const { conversation, run } = await runStart(2);
    await conversations.reply(conversation.id, 'More', 'user');
    run.emit({ type: 'turn', cost: 12 });
    // Costs 1, 1, 1, 1 and 12 (2 + 10); the median is 1, not an average of runs.
    expect(conversations.startCostEstimate(project.id)).toBe(1);
  });

  it('takes the last 20 by when they ended, however old', async () => {
    const { conversations, project, runStart } = setup();
    for (let i = 0; i < 10; i++) {
      await runStart(100);
    }
    for (let i = 0; i < 20; i++) {
      await runStart(2);
    }
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    expect(conversations.startCostEstimate(project.id)).toBe(2);
  });

  it('reads only its own Project', async () => {
    const { conversations, tickets, runStart } = setup();
    for (let i = 0; i < 5; i++) {
      await runStart(1);
    }
    const other = tickets.createProject({ name: 'Other' });
    expect(conversations.startCostEstimate(other.id)).toBeNull();
  });
});
