// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { NotAllowedError } from '../tickets/errors';

const pullRequest = 'https://github.com/acme/site/pull/12';

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
  });
  const inReview = (title = 'Fix it', cycleId?: number) => {
    const ticket = world.tickets.createTicket({
      projectId: project.id,
      title,
      ...(cycleId === undefined ? {} : { cycleId }),
    });
    world.tickets.updateTicket(ticket.number, { status: 'In progress' });
    world.tickets.addExternalReferences(ticket.number, [pullRequest]);
    return ticket;
  };
  /** A Start Conversation that handed off and sits idle. */
  const handedOff = async (
    ticketNumber: number,
    startedBy = 'user' as const,
  ) => {
    const start = await world.conversations.start({
      startedBy,
      ticketNumber,
      intent: 'start',
      prompt: 'Go',
    });
    world.runner.runs[world.runner.runs.length - 1].emit({
      type: 'turn',
      costUsd: 1,
    });
    return start;
  };
  return { ...world, project, inReview, handedOff };
}

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a rejection.');
};

describe('Approve merge', () => {
  it('starts a Merge Conversation in a worktree with the Playbook command when there is no Start Conversation', async () => {
    const {
      conversations,
      runner,
      worktrees,
      repositoryDir,
      project,
      inReview,
    } = setup();
    const ticket = inReview();

    const merge = await conversations.approveMerge({
      ticketNumber: ticket.number,
    });

    const path = `/fake/worktrees/${project.id}/c${merge.id}`;
    expect(merge).toMatchObject({
      intent: 'merge',
      startedBy: 'user',
      ticketNumber: ticket.number,
      worktreePath: path,
    });
    expect(worktrees.created).toEqual([
      {
        repositoryPath: repositoryDir,
        projectId: project.id,
        conversationId: merge.id,
      },
    ]);
    expect(runner.runs[0].options.cwd).toBe(path);
    expect(runner.runs[0].options.prompt).toBe(
      `/tandembike:merge T${ticket.number}`,
    );
    expect(runner.runs[0].options.systemPrompt).toContain('worktree');
    expect(runner.runs[0].options.systemPrompt).toContain('Check command');
  });

  it('sends the Project’s merge command when it set one', async () => {
    const { conversations, runner, tickets, project, inReview } = setup();
    tickets.setProjectAgentCommands(project.id, {
      triageCommand: '',
      startCommand: '',
      startEpicCommand: '',
      retroCommand: '',
      specCommand: '',
      mergeCommand: '/ship',
      planCommand: '',
      sparCommand: '',
    });
    const ticket = inReview();

    await conversations.approveMerge({ ticketNumber: ticket.number });

    expect(runner.runs[0].options.prompt).toBe(`/ship T${ticket.number}`);
  });

  it('resumes an open idle Start Conversation with the fixed reply from the User', async () => {
    const { conversations, runner, inReview, handedOff } = setup();
    const ticket = inReview();
    const start = await handedOff(ticket.number);

    const resumed = await conversations.approveMerge({
      ticketNumber: ticket.number,
    });

    expect(resumed.id).toBe(start.id);
    expect(runner.runs[0].sent).toContain(
      `Approved: merge T${ticket.number} now by the Playbook's merge steps, then finish_work.`,
    );
    expect(conversations.get(start.id).state).toBe('running');
    expect(
      conversations.list({ ticketNumber: ticket.number }).map((c) => c.intent),
    ).toEqual(['start']);
    expect(conversations.transcript(start.id).at(-1)).toMatchObject({
      role: 'user',
    });
  });

  it('starts a Merge Conversation when the Start Conversation is closed', async () => {
    const { conversations, inReview, handedOff } = setup();
    const ticket = inReview();
    const start = await handedOff(ticket.number);
    await conversations.close(start.id);

    const merge = await conversations.approveMerge({
      ticketNumber: ticket.number,
    });

    expect(merge.intent).toBe('merge');
    expect(merge.id).not.toBe(start.id);
  });

  it('works for an Epic in Review', async () => {
    const { conversations, runner, tickets, project } = setup();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Big',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic.number,
    });
    tickets.updateTicket(child.number, { status: 'In progress' });
    tickets.addExternalReferences(epic.number, [pullRequest]);

    await conversations.approveMerge({ ticketNumber: epic.number });

    expect(runner.runs[0].options.prompt).toBe(
      `/tandembike:merge T${epic.number}`,
    );
  });

  it('is refused for a Ticket that is not in Review, with the reason', async () => {
    const { conversations, tickets, project } = setup();
    const todo = tickets.createTicket({ projectId: project.id, title: 'A' });
    const noPr = tickets.createTicket({ projectId: project.id, title: 'B' });
    tickets.updateTicket(noPr.number, { status: 'In progress' });
    const done = tickets.createTicket({ projectId: project.id, title: 'C' });
    tickets.addExternalReferences(done.number, [pullRequest]);
    tickets.updateTicket(done.number, { status: 'Done' });
    const claimed = tickets.createTicket({ projectId: project.id, title: 'D' });
    tickets.updateTicket(claimed.number, { status: 'In progress' });
    tickets.addExternalReferences(claimed.number, [pullRequest]);
    tickets.claimTicket(claimed.number, { agentRunId: '9' });

    const errors = await Promise.all(
      [todo, noPr, done, claimed].map((ticket) =>
        rejection(conversations.approveMerge({ ticketNumber: ticket.number })),
      ),
    );

    for (const error of errors) {
      expect(error).toBeInstanceOf(NotAllowedError);
    }
    expect((errors[0] as Error).message).toMatch(/Review/);
    expect((errors[1] as Error).message).toMatch(/pull request/);
    expect((errors[2] as Error).message).toMatch(/Done/);
    expect((errors[3] as Error).message).toMatch(/Claim|claim/);
    expect(conversations.list({ projectId: project.id })).toEqual([]);
  });

  it('is refused while a Conversation on the Ticket is working', async () => {
    const { conversations, inReview } = setup();
    const ticket = inReview();
    await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'triage',
      prompt: 'Look',
    });

    const error = await rejection(
      conversations.approveMerge({ ticketNumber: ticket.number }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect((error as Error).message).toMatch(/working/);
  });

  it('counts against the Start run limit', async () => {
    const { conversations, inReview } = setup();
    const first = inReview('First');
    const second = inReview('Second');
    await conversations.approveMerge({ ticketNumber: first.number });

    const error = await rejection(
      conversations.approveMerge({ ticketNumber: second.number }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect((error as Error).message).toMatch(/Start run/);
  });

  it('is counted by a running Start run too', async () => {
    const { conversations, project, inReview } = setup();
    const ticket = inReview();
    await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'start',
      prompt: 'Go',
    });

    const error = await rejection(
      conversations.approveMerge({ ticketNumber: ticket.number }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
  });

  it('is never started by Autopilot', async () => {
    const { conversations, inReview } = setup();
    const ticket = inReview();

    const rejected = await rejection(
      conversations.start({
        startedBy: 'autopilot',
        ticketNumber: ticket.number,
        intent: 'merge',
        prompt: 'Merge',
      }),
    );

    expect(rejected).toBeInstanceOf(NotAllowedError);
    expect(conversations.list({ ticketNumber: ticket.number })).toEqual([]);
  });

  it('stays outside the Spend ceiling, also when it resumes a Start Autopilot began', async () => {
    const { conversations, runner, tickets, project, inReview, handedOff } =
      setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });
    const ticket = inReview('Fix it', cycle.id);
    const start = await conversations.start({
      startedBy: 'autopilot',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
      cycleId: cycle.id,
    });
    runner.runs[0].emit({ type: 'turn', costUsd: 2 });
    void handedOff;

    await conversations.approveMerge({ ticketNumber: ticket.number });
    runner.runs[0].emit({ type: 'turn', costUsd: 5 });

    expect(conversations.get(start.id).costUsd).toBe(5);
    expect(
      conversations.autopilotSpend({
        projectId: project.id,
        cycleId: cycle.id,
      }),
    ).toBeCloseTo(2);
  });

  it('leaves the cost of the User’s other replies on an Autopilot Start in the Spend', async () => {
    const { conversations, runner, tickets, project, inReview } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });
    const ticket = inReview('Fix it', cycle.id);
    const start = await conversations.start({
      startedBy: 'autopilot',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
      cycleId: cycle.id,
    });
    runner.runs[0].emit({ type: 'turn', costUsd: 2 });

    await conversations.reply(start.id, 'Also fix the typo', 'user');
    runner.runs[0].emit({ type: 'turn', costUsd: 5 });

    expect(
      conversations.autopilotSpend({
        projectId: project.id,
        cycleId: cycle.id,
      }),
    ).toBeCloseTo(5);
  });

  it('stays outside the Spend ceiling as a Merge Conversation', async () => {
    const { conversations, runner, tickets, project, inReview } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });
    const ticket = inReview('Fix it', cycle.id);

    await conversations.approveMerge({ ticketNumber: ticket.number });
    runner.runs[0].emit({ type: 'turn', costUsd: 3 });

    expect(
      conversations.autopilotSpend({
        projectId: project.id,
        cycleId: cycle.id,
      }),
    ).toBe(0);
  });
});
