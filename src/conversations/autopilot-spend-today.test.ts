import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';

const pullRequest = 'https://github.com/acme/site/pull/12';

const midnight = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
};

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
  });
  const ticket = (title: string) =>
    world.tickets.createTicket({ projectId: project.id, title });
  const start = (ticketNumber: number, startedBy: 'user' | 'autopilot') =>
    world.conversations.start({
      startedBy,
      ticketNumber,
      intent: 'start',
      prompt: 'Go',
    });
  const finish = (cost: number) =>
    world.runner.runs[world.runner.runs.length - 1].emit({
      type: 'turn',
      cost,
    });
  return { ...world, project, ticket, start, finish };
}

describe('autopilotSpendToday', () => {
  it('sums the Autopilot runs that ended today and leaves out the User’s', async () => {
    const { conversations, ticket, start, finish } = setup();
    await start(ticket('A').number, 'autopilot');
    finish(2);
    await start(ticket('B').number, 'autopilot');
    finish(3);
    await start(ticket('C').number, 'user');
    finish(9);

    expect(conversations.autopilotSpendToday(midnight())).toBe(5);
  });

  it('leaves out runs that ended before the day began', async () => {
    const { conversations, ticket, start, finish } = setup();
    await start(ticket('A').number, 'autopilot');
    finish(2);

    expect(
      conversations.autopilotSpendToday(new Date(Date.now() + 60_000)),
    ).toBe(0);
  });

  it('leaves out a merge the User approved on an Autopilot Conversation', async () => {
    const { conversations, tickets, ticket, start, finish } = setup();
    const a = ticket('A');
    tickets.updateTicket(a.number, { status: 'In progress' });
    tickets.addExternalReferences(a.number, [pullRequest]);
    await start(a.number, 'autopilot');
    finish(1);
    await conversations.approveMerge({ ticketNumber: a.number });
    finish(4);

    expect(conversations.autopilotSpendToday(midnight())).toBe(1);
  });

  it('reports no budget without a ceiling and paused at it', async () => {
    const { conversations, tickets, ticket, start, finish } = setup();
    await start(ticket('A').number, 'autopilot');
    finish(2);

    expect(conversations.machineBudget()).toBeNull();
    tickets.setMachineSettings({ dailySpendCeilingUsd: 2 });
    expect(conversations.machineBudget()).toEqual({
      spend: 2,
      ceiling: 2,
      unit: 'usd',
      paused: true,
    });
    tickets.setMachineSettings({ dailySpendCeilingUsd: 3 });
    expect(conversations.machineBudget()?.paused).toBe(false);
  });
});
