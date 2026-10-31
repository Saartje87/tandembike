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

  it('gives only Start runs the worktree instruction, and says how to make the worktree', async () => {
    const { conversations, runner, tickets, project } = setup();
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });

    await conversations.start({
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });
    await conversations.start({
      projectId: project.id,
      intent: 'triage',
      prompt: 'Go.',
    });
    await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Go.',
    });

    const start = runner.runs[0].options.systemPrompt;
    expect(start).toContain('EnterWorktree');
    expect(start).toContain('before you change any file');
    expect(start).toContain('branch');
    expect(runner.runs[1].options.systemPrompt).not.toContain('worktree');
    expect(runner.runs[2].options.systemPrompt).not.toContain('worktree');
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

describe('Permission requests', () => {
  const request = { toolName: 'Bash', input: { command: 'npm test' } };

  async function started() {
    const world = setup();
    const conversation = await world.conversations.start({
      projectId: world.project.id,
      intent: 'start',
      prompt: 'Go',
    });
    return { ...world, conversation, run: world.runner.runs[0] };
  }

  it('shows a request in the transcript, marks the Conversation waiting and holds the run until the User answers', async () => {
    const { conversations, conversation, run } = await started();

    let answer: string | undefined;
    void run.options.askPermission(request).then((result) => {
      answer = result;
    });
    await Promise.resolve();

    expect(conversations.get(conversation.id).state).toBe('waiting');
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      role: 'permission',
      text: 'Bash {"command":"npm test"}',
      permission: 'pending',
    });
    expect(answer).toBeUndefined();
  });

  it('lets the run go on after Allow', async () => {
    const { conversations, conversation, run } = await started();
    const pending = run.options.askPermission(request);
    const entry = conversations.transcript(conversation.id).at(-1);

    await conversations.answerPermission(entry?.id ?? 0, true);

    expect(await pending).toBe('allow');
    expect(conversations.get(conversation.id).state).toBe('running');
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      permission: 'allowed',
    });
  });

  it('tells the run no after Deny', async () => {
    const { conversations, conversation, run } = await started();
    const pending = run.options.askPermission(request);
    const entry = conversations.transcript(conversation.id).at(-1);

    await conversations.answerPermission(entry?.id ?? 0, false);

    expect(await pending).toBe('deny');
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      permission: 'denied',
    });
  });

  it('refuses a second answer', async () => {
    const { conversations, run, conversation } = await started();
    void run.options.askPermission(request);
    const entry = conversations.transcript(conversation.id).at(-1);
    await conversations.answerPermission(entry?.id ?? 0, true);

    const error = await failure(
      conversations.answerPermission(entry?.id ?? 0, false),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
  });

  it('denies a pending request when the Conversation is stopped', async () => {
    const { conversations, conversation, run } = await started();
    const pending = run.options.askPermission(request);

    await conversations.stop(conversation.id);

    expect(await pending).toBe('deny');
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      permission: 'expired',
    });
  });

  it('expires pending requests when the server restarts', async () => {
    const { conversations, conversation, run, restart } = await started();
    void run.options.askPermission(request);
    const entry = conversations.transcript(conversation.id).at(-1);

    const next = restart();
    next.interruptStale();

    expect(next.transcript(conversation.id).at(-1)).toMatchObject({
      permission: 'expired',
    });
    const error = await failure(next.answerPermission(entry?.id ?? 0, true));
    expect(error).toBeInstanceOf(NotAllowedError);
  });
});

describe('The Start run limit', () => {
  const startOn = (
    conversations: ReturnType<typeof setup>['conversations'],
    projectId: number,
    intent: 'start' | 'triage' | 'ask' = 'start',
  ) => conversations.start({ projectId, intent, prompt: 'Go.' });

  it('refuses a second running Start with Parallel runs off, with a reason', async () => {
    const { conversations, project } = setup();
    await startOn(conversations, project.id);

    const error = await failure(startOn(conversations, project.id));

    expect(error).toBeInstanceOf(NotAllowedError);
    expect((error as Error).message).toMatch(/Start run/);
    expect((error as Error).message).toMatch(/Parallel runs/);
    expect(conversations.list({ projectId: project.id })).toHaveLength(1);
  });

  it('allows Starts up to the max concurrent Start runs with Parallel runs on', async () => {
    const { conversations, tickets, project } = setup();
    tickets.setProjectAgentSettings(project.id, {
      parallelRuns: true,
      maxConcurrentRuns: 2,
    });
    await startOn(conversations, project.id);
    await startOn(conversations, project.id);

    const error = await failure(startOn(conversations, project.id));

    expect(error).toBeInstanceOf(NotAllowedError);
    expect((error as Error).message).toMatch(/2/);
  });

  it('never refuses Triage or Ask by the limit, and does not count them', async () => {
    const { conversations, project } = setup();
    await startOn(conversations, project.id, 'triage');
    await startOn(conversations, project.id, 'ask');
    await startOn(conversations, project.id, 'start');
    await startOn(conversations, project.id, 'triage');

    expect(conversations.list({ projectId: project.id })).toHaveLength(4);
  });

  it('counts only the Project’s own Start runs', async () => {
    const { conversations, tickets, project } = setup();
    const other = tickets.createProject({ name: 'Other' });
    tickets.setProjectAgentSettings(other.id, {
      repositoryPath: tickets.getProjectAgentSettings(project.id)
        .repositoryPath,
    });
    await startOn(conversations, project.id);

    await startOn(conversations, other.id);
  });

  it('frees the slot when a Start is stopped or its run ends', async () => {
    const { conversations, runner, project } = setup();
    const first = await startOn(conversations, project.id);
    await conversations.stop(first.id);
    await startOn(conversations, project.id);
    runner.runs[1].emit({ type: 'exit' });

    await startOn(conversations, project.id);
  });

  it('refuses a reply that would resume a Start beyond the limit', async () => {
    const { conversations, runner, project } = setup();
    const first = await startOn(conversations, project.id);
    runner.runs[0].emit({ type: 'exit', error: 'died' });
    await startOn(conversations, project.id);

    const error = await failure(conversations.reply(first.id, 'Go on'));

    expect(error).toBeInstanceOf(NotAllowedError);
  });

  it('lets a reply into a live Start through, and resumes Triage at any time', async () => {
    const { conversations, runner, project } = setup();
    const first = await startOn(conversations, project.id);
    const triage = await startOn(conversations, project.id, 'triage');
    runner.runs[1].emit({ type: 'exit', error: 'died' });

    await conversations.reply(first.id, 'More');
    await conversations.reply(triage.id, 'Again');
  });
});
