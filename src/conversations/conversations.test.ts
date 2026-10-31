// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { errorFrom } from '../test/tickets';
import { createChangeChannel } from '../tickets/changes';
import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
  });
  return { ...world, project };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a rejection.');
}

describe('Starting a Conversation', () => {
  it('runs the Agent in the repository path, with the Tandembike MCP server and the first message', async () => {
    const { conversations, runner, project, repositoryDir } = setup();

    const conversation = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'What is left to do?',
    });

    expect(conversation).toMatchObject({
      projectId: project.id,
      ticketNumber: null,
      intent: 'ask',
      state: 'running',
      sdkSessionId: null,
      costUsd: 0,
    });
    expect(runner.runs).toHaveLength(1);
    expect(runner.runs[0].options).toMatchObject({
      cwd: repositoryDir,
      mcpUrl: 'http://localhost:4747/api/mcp',
      prompt: 'What is left to do?',
    });
    expect(runner.runs[0].options.resume).toBeUndefined();
    expect(conversations.transcript(conversation.id)).toMatchObject([
      { role: 'user', text: 'What is left to do?' },
    ]);
  });

  it('tells the Agent its situation: the Agent-run ID, the Ticket and the intent', async () => {
    const { conversations, runner, tickets, project } = setup();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the footer',
    });

    const conversation = await conversations.start({
      ticketNumber: ticket.number,
      intent: 'triage',
      prompt: 'Triage this.',
    });

    expect(conversation.projectId).toBe(project.id);
    expect(conversation.ticketNumber).toBe(ticket.number);
    const brief = runner.runs[0].options.systemPrompt;
    expect(brief).toContain(`Agent-run ID: ${conversation.id}`);
    expect(brief).toContain(`T${ticket.number}`);
    expect(brief).toContain('triage');
    expect(brief).not.toContain('worktree');
  });

  it('asks for a git worktree of its own when the Project allows parallel runs', async () => {
    const { conversations, runner, tickets, project } = setup();
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });

    await conversations.start({
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });

    expect(runner.runs[0].options.systemPrompt).toContain('worktree');
  });

  it('is refused when the Project has no repository path', async () => {
    const { conversations, tickets, runner } = setup();
    const bare = tickets.createProject({ name: 'Bare' });

    const error = await failure(
      conversations.start({ projectId: bare.id, intent: 'ask', prompt: 'Hi' }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toHaveProperty(
      'repositoryPath',
    );
    expect(runner.runs).toHaveLength(0);
  });

  it('is refused for an unknown Project or Ticket, or with no message', async () => {
    const { conversations, project } = setup();

    expect(
      await failure(
        conversations.start({ projectId: 999, intent: 'ask', prompt: 'Hi' }),
      ),
    ).toBeInstanceOf(NotFoundError);
    expect(
      await failure(
        conversations.start({ ticketNumber: 999, intent: 'ask', prompt: 'Hi' }),
      ),
    ).toBeInstanceOf(NotFoundError);
    expect(
      await failure(
        conversations.start({
          projectId: project.id,
          intent: 'ask',
          prompt: '   ',
        }),
      ),
    ).toBeInstanceOf(ValidationError);
  });
});

describe('A running Conversation', () => {
  it('stores the SDK session ID, the Agent’s words and tool use in the transcript', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    runner.runs[0].emit({ type: 'session', sessionId: 'sess-1' });
    runner.runs[0].emit({ type: 'tool', text: 'Read README.md' });
    runner.runs[0].emit({ type: 'agent', text: 'Hello!' });

    expect(conversations.get(id).sdkSessionId).toBe('sess-1');
    expect(
      conversations.transcript(id).map(({ role, text }) => [role, text]),
    ).toEqual([
      ['user', 'Hi'],
      ['tool', 'Read README.md'],
      ['agent', 'Hello!'],
    ]);
  });

  it('is idle when a turn ends, and adds the cost of every turn and run', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    runner.runs[0].emit({ type: 'turn', costUsd: 0.25 });
    expect(conversations.get(id)).toMatchObject({
      state: 'idle',
      costUsd: 0.25,
    });

    runner.runs[0].emit({ type: 'turn', costUsd: 0.5 });
    expect(conversations.get(id).costUsd).toBe(0.5);

    // A resumed run starts counting from zero again.
    runner.runs[0].emit({ type: 'exit', error: 'crashed' });
    await conversations.reply(id, 'Again');
    runner.runs[1].emit({ type: 'turn', costUsd: 0.1 });
    expect(conversations.get(id).costUsd).toBeCloseTo(0.6);
  });

  it('waits for the User when the run says so, and works again after', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    runner.runs[0].emit({ type: 'waiting', waiting: true });
    expect(conversations.get(id).state).toBe('waiting');

    runner.runs[0].emit({ type: 'waiting', waiting: false });
    expect(conversations.get(id).state).toBe('running');
  });

  it('is interrupted, with the reason in the transcript, when its run dies', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    runner.runs[0].emit({ type: 'exit', error: 'The process crashed.' });

    expect(conversations.get(id).state).toBe('interrupted');
    expect(conversations.transcript(id).at(-1)).toMatchObject({
      role: 'error',
      text: 'The process crashed.',
    });
  });
});

describe('Replying to a Conversation', () => {
  it('goes into the same run while it is running or idle', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    await conversations.reply(id, 'Also this');
    runner.runs[0].emit({ type: 'turn', costUsd: 0.1 });
    const after = await conversations.reply(id, 'And that');

    expect(runner.runs).toHaveLength(1);
    expect(runner.runs[0].sent).toEqual(['Also this', 'And that']);
    expect(after.state).toBe('running');
    expect(conversations.transcript(id).map((entry) => entry.text)).toEqual([
      'Hi',
      'Also this',
      'And that',
    ]);
  });

  it('resumes an interrupted Conversation from its stored SDK session ID', async () => {
    const { conversations, runner, project, repositoryDir } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({ type: 'session', sessionId: 'sess-1' });
    runner.runs[0].emit({ type: 'exit', error: 'died' });

    const after = await conversations.reply(id, 'Carry on');

    expect(after.state).toBe('running');
    expect(runner.runs).toHaveLength(2);
    expect(runner.runs[1].options).toMatchObject({
      cwd: repositoryDir,
      resume: 'sess-1',
      prompt: 'Carry on',
    });
  });

  it('resumes an idle Conversation whose run has ended', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({ type: 'session', sessionId: 'sess-1' });
    runner.runs[0].emit({ type: 'turn', costUsd: 0.1 });
    runner.runs[0].emit({ type: 'exit' });

    await conversations.reply(id, 'More');

    expect(runner.runs[1].options.resume).toBe('sess-1');
  });

  it('is refused for a stopped Conversation, an empty reply or an unknown Conversation', async () => {
    const { conversations, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    expect(await failure(conversations.reply(id, ' '))).toBeInstanceOf(
      ValidationError,
    );
    expect(await failure(conversations.reply(999, 'Hi'))).toBeInstanceOf(
      NotFoundError,
    );
    await conversations.stop(id);
    expect(await failure(conversations.reply(id, 'Hi'))).toBeInstanceOf(
      NotAllowedError,
    );
  });

  it('is refused once the Project lost its repository path', async () => {
    const { conversations, runner, tickets, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({ type: 'exit', error: 'died' });
    tickets.setProjectAgentSettings(project.id, { repositoryPath: null });

    expect(await failure(conversations.reply(id, 'Hi'))).toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('Stopping a Conversation', () => {
  it('interrupts the run, ends it and marks the Conversation stopped', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    const stopped = await conversations.stop(id);

    expect(stopped.state).toBe('stopped');
    expect(runner.runs[0].interrupted).toBe(true);
    expect(runner.runs[0].closed).toBe(true);

    // The run's exit after a stop does not turn it into interrupted.
    runner.runs[0].emit({ type: 'exit' });
    expect(conversations.get(id).state).toBe('stopped');
  });

  it('stops a Conversation with no live run too', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({ type: 'exit', error: 'died' });

    expect((await conversations.stop(id)).state).toBe('stopped');
  });
});

describe('Restarting the server', () => {
  it('marks the Conversations whose run was alive as interrupted', async () => {
    const { conversations, runner, project, restart } = setup();
    const running = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    const stopped = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    await conversations.stop(stopped.id);
    runner.runs[0].emit({ type: 'turn', costUsd: 0.1 });

    // A new server process has no runs, but the database still says so.
    const fresh = restart();
    expect(fresh.interruptStale()).toBe(1);

    expect(fresh.get(running.id).state).toBe('interrupted');
    expect(fresh.get(stopped.id).state).toBe('stopped');
  });
});

describe('Reading Conversations', () => {
  it('lists the Conversations of a Project or a Ticket, newest first', async () => {
    const { conversations, tickets, project } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const first = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'One',
    });
    const second = await conversations.start({
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Two',
    });

    expect(
      conversations.list({ projectId: project.id }).map(({ id }) => id),
    ).toEqual([second.id, first.id]);
    expect(
      conversations.list({ ticketNumber: ticket.number }).map(({ id }) => id),
    ).toEqual([second.id]);
    expect(errorFrom(() => conversations.get(999))).toEqual(
      new NotFoundError('There is no Conversation with id 999.'),
    );
  });
});

describe('Live updates', () => {
  it('announce every change to a Conversation and its transcript', async () => {
    const changes = createChangeChannel();
    const seen = vi.fn();
    changes.subscribe(seen);
    const { conversations, runner, tickets, repositoryDir } =
      createTestConversations(changes);
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, {
      repositoryPath: repositoryDir,
    });
    seen.mockClear();

    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    expect(seen).toHaveBeenCalledWith({ type: 'conversation', id });

    seen.mockClear();
    runner.runs[0].emit({ type: 'agent', text: 'Hello' });
    expect(seen).toHaveBeenCalledWith({ type: 'conversation', id });

    seen.mockClear();
    runner.runs[0].emit({ type: 'turn', costUsd: 0.2 });
    expect(seen).toHaveBeenCalledWith({ type: 'conversation', id });

    seen.mockClear();
    await conversations.stop(id);
    expect(seen).toHaveBeenCalledWith({ type: 'conversation', id });
  });
});
