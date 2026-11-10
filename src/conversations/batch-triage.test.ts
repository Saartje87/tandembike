import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { ValidationError } from '../tickets/errors';

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
  });
  const cycle = world.tickets.createCycle({
    projectId: project.id,
    title: 'Beta',
  });
  return { ...world, project, cycle };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a refusal');
}

describe('A Batch triage Conversation (T1316)', () => {
  it('records its Board and Ticket list, about the Project, in the main checkout', async () => {
    const { conversations, project, cycle } = setup();

    const batch = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
      ticketNumbers: [3, 1, 2],
    });

    expect(batch).toMatchObject({
      projectId: project.id,
      ticketNumber: null,
      intent: 'batch_triage',
      startedBy: 'user',
      batchTriageCycleId: cycle.id,
      batchTriageTickets: [3, 1, 2],
      worktreePath: null,
    });
  });

  it('records the Backlog as no Cycle', async () => {
    const { conversations, project } = setup();

    const batch = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: null,
      ticketNumbers: [1],
    });

    expect(batch.batchTriageCycleId).toBeNull();
    expect(batch.batchTriageTickets).toEqual([1]);
  });

  it('returns the open one for the Board and starts nothing new', async () => {
    const { conversations, runner, project, cycle } = setup();
    const first = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
      ticketNumbers: [1],
    });

    const again = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
      ticketNumbers: [1, 2],
    });

    expect(again.id).toBe(first.id);
    expect(again.batchTriageTickets).toEqual([1]);
    expect(runner.runs).toHaveLength(1);
  });

  it("starts one per Board: the Backlog's is not a Cycle's", async () => {
    const { conversations, runner, project, cycle } = setup();
    const inCycle = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
      ticketNumbers: [1],
    });

    const inBacklog = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: null,
      ticketNumbers: [2],
    });

    expect(inBacklog.id).not.toBe(inCycle.id);
    expect(runner.runs).toHaveLength(2);
    expect(conversations.openBatchTriage(project.id, null)?.id).toBe(
      inBacklog.id,
    );
  });

  it('starts a new one once the open one is closed', async () => {
    const { conversations, project, cycle } = setup();
    const first = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
      ticketNumbers: [1],
    });
    await conversations.close(first.id);

    const next = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
      ticketNumbers: [2],
    });

    expect(next.id).not.toBe(first.id);
    expect(conversations.openBatchTriage(project.id, cycle.id)?.id).toBe(
      next.id,
    );
  });

  it('is refused with no Tickets to triage', async () => {
    const { conversations, project } = setup();

    const error = await failure(
      conversations.startBatchTriage({
        projectId: project.id,
        cycleId: null,
        ticketNumbers: [],
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(conversations.list({ projectId: project.id })).toHaveLength(0);
  });

  it("is refused for another Project's Cycle", async () => {
    const { conversations, tickets, project } = setup();
    const other = tickets.createProject({ name: 'Other' });
    const elsewhere = tickets.createCycle({
      projectId: other.id,
      title: 'Elsewhere',
    });

    const error = await failure(
      conversations.startBatchTriage({
        projectId: project.id,
        cycleId: elsewhere.id,
        ticketNumbers: [1],
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
  });
});

describe('A Batch triage run (T1317)', () => {
  it('starts with a first message naming the Board and its Tickets, and how to triage them', async () => {
    const { conversations, runner, project, cycle } = setup();

    await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
      ticketNumbers: [12, 4],
    });

    const { prompt } = runner.runs[0].options;
    expect(prompt).toContain(
      `Batch triage the Cycle "Beta" (Cycle ${cycle.id})`,
    );
    expect(prompt).toContain('T12, T4');
    expect(prompt).toContain('propose_triage');
    expect(prompt).toContain('duplicateOf');
    expect(prompt).toContain('splits');
    expect(prompt).toMatch(/skip/i);
  });

  it('names the Backlog as its Board', async () => {
    const { conversations, runner, project } = setup();

    await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: null,
      ticketNumbers: [7],
    });

    expect(runner.runs[0].options.prompt).toContain(
      'Batch triage the Backlog: T7.',
    );
  });

  it('disallows update_ticket and file_tickets on every run, the User replies included', async () => {
    const { conversations, runner, project } = setup();
    const batch = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: null,
      ticketNumbers: [7],
    });
    runner.runs[0].emit({ type: 'session', sessionId: 's' });
    runner.runs[0].emit({ type: 'exit' });

    await conversations.reply(batch.id, 'Label them yourself', 'user');

    for (const run of runner.runs) {
      expect(run.options.disallowedTools).toEqual([
        'mcp__tandembike__update_ticket',
        'mcp__tandembike__file_tickets',
      ]);
    }
    expect(runner.runs).toHaveLength(2);
  });

  it("starts on the Project's triage model when set", async () => {
    const { conversations, runner, tickets, project } = setup();
    tickets.setProjectAgentSettings(project.id, {
      runModel: 'claude-opus-5-5',
      triageModel: 'claude-haiku-5',
    });

    await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: null,
      ticketNumbers: [7],
    });

    expect(runner.runs[0].options.model).toBe('claude-haiku-5');
  });

  it('takes no Start run or Machine slot and no worktree, and stays out of the Spend and Triage ceilings', async () => {
    const { conversations, runner, tickets, project, cycle } = setup();
    tickets.setProjectAgentSettings(project.id, {
      parallelRuns: true,
      autoTriage: true,
      triageCeilingUsd: 1,
    });
    tickets.setMachineSettings({ maxConcurrentRuns: 1 });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go.',
    });

    const batch = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
      ticketNumbers: [ticket.number],
    });
    runner.runs.at(-1)?.emit({ type: 'turn', costUsd: 3 });

    expect(batch.worktreePath).toBeNull();
    expect(conversations.machineSlotsInUse()).toBe(1);
    expect(conversations.autopilotTriageSpend(project.id, new Date(0))).toBe(0);
    expect(conversations.triageBudget(project.id, new Date())?.paused).toBe(
      false,
    );
    expect(
      conversations.autopilotSpend({
        projectId: project.id,
        cycleId: cycle.id,
      }),
    ).toBe(0);
  });
});
