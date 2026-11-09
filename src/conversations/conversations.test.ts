// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { playbookPath } from '../playbook/playbook';
import { createTestConversations } from '../test/conversations';
import { errorFrom } from '../test/tickets';
import { createChangeChannel } from '../tickets/changes';
import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';
import { maxToolInputLength } from './conversations';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      startedBy: 'user',
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
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'triage',
      prompt: 'Triage this.',
    });

    expect(conversation.projectId).toBe(project.id);
    expect(conversation.ticketNumber).toBe(ticket.number);
    const brief = runner.runs[0].options.systemPrompt;
    expect(brief).toContain(`Agent-run ID: ${conversation.id}`);
    expect(brief).not.toMatch(/claim a Ticket|Use it when/);
    expect(runner.runs[0].options.agentRunId).toBe(String(conversation.id));
    expect(brief).toContain(`T${ticket.number}`);
    expect(brief).toContain('triage');
    expect(brief).toContain('AskUserQuestion');
    expect(brief).not.toContain('ask your questions in your messages');
    expect(brief).not.toContain('worktree');
  });

  it('names a normal Ticket by its number and title alone', async () => {
    const { conversations, runner, tickets, project } = setup();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the footer',
    });

    await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go.',
    });

    expect(runner.runs[0].options.systemPrompt).toContain(
      `This Conversation is about Ticket T${ticket.number}, "Fix the footer".\n`,
    );
  });

  it('says when the Ticket is an Epic', async () => {
    const { conversations, runner, tickets, project } = setup();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Agents',
      type: 'Epic',
    });

    await conversations.start({
      startedBy: 'user',
      ticketNumber: epic.number,
      intent: 'start',
      prompt: 'Go.',
    });

    expect(runner.runs[0].options.systemPrompt).toContain(
      `This Conversation is about Ticket T${epic.number}, "Agents", an Epic.\n`,
    );
  });

  it('points to the Ticket without copying its Status, labels, Epic, Cycle or description, which change while it runs', async () => {
    const { conversations, runner, tickets, project } = setup();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Grouping epic',
      type: 'Epic',
    });
    const cycle = tickets.createCycle({
      projectId: project.id,
      title: 'Spring goal',
    });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the footer',
      description: 'The footer overlaps the drawer.',
      status: 'In progress',
      labels: ['some-label'],
      cycleId: cycle.id,
      epicNumber: epic.number,
    });

    await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go.',
    });

    const brief = runner.runs[0].options.systemPrompt;
    expect(brief).not.toContain('In progress');
    expect(brief).not.toContain('some-label');
    expect(brief).not.toContain('Grouping epic');
    expect(brief).not.toMatch(new RegExp(`T${epic.number}\\b`));
    expect(brief).not.toContain('Spring goal');
    expect(brief).not.toContain('overlaps the drawer');
  });

  it('starts every run with the Playbook plugin, loaded by its local path', async () => {
    const { conversations, runner, project } = setup();

    for (const intent of ['start', 'triage'] as const) {
      await conversations.start({
        projectId: project.id,
        intent,
        prompt: 'Go.',
        startedBy: 'user',
      });
    }

    for (const run of runner.runs) {
      expect(run.options.plugins).toEqual([
        { type: 'local', path: playbookPath },
      ]);
    }
  });

  it("starts every run with the Project's run mode and model", async () => {
    const { conversations, runner, tickets, project } = setup();

    await conversations.start({
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
      startedBy: 'user',
    });
    expect(runner.runs[0].options).toMatchObject({ runMode: 'auto' });
    expect(runner.runs[0].options.model).toBeUndefined();

    tickets.setProjectAgentSettings(project.id, {
      runMode: 'default',
      runModel: 'claude-opus-5-5',
    });
    await conversations.start({
      projectId: project.id,
      intent: 'triage',
      prompt: 'Go.',
      startedBy: 'user',
    });
    expect(runner.runs[1].options).toMatchObject({
      runMode: 'default',
      model: 'claude-opus-5-5',
    });
  });

  it('starts a Start run with Parallel runs on in a worktree Tandembike made, and says so in the brief', async () => {
    const {
      conversations,
      runner,
      tickets,
      project,
      worktrees,
      repositoryDir,
    } = setup();
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });

    const conversation = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });

    const path = `/fake/worktrees/${project.id}/c${conversation.id}`;
    expect(worktrees.created).toEqual([
      {
        repositoryPath: repositoryDir,
        projectId: project.id,
        conversationId: conversation.id,
      },
    ]);
    expect(conversation.worktreePath).toBe(path);
    expect(runner.runs[0].options.cwd).toBe(path);
    const brief = runner.runs[0].options.systemPrompt;
    expect(brief).toContain(
      `You are in a git worktree Tandembike made for this Conversation at ${path}, detached at origin/main.`,
    );
    expect(brief).not.toContain('EnterWorktree');
  });

  it('keeps the main checkout with Parallel runs off and for every other intent', async () => {
    const {
      conversations,
      runner,
      tickets,
      project,
      worktrees,
      repositoryDir,
    } = setup();

    await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });
    for (const intent of ['triage', 'ask'] as const) {
      await conversations.start({
        startedBy: 'user',
        projectId: project.id,
        intent,
        prompt: 'Go.',
      });
    }

    expect(worktrees.created).toEqual([]);
    for (const run of runner.runs) {
      expect(run.options.cwd).toBe(repositoryDir);
      expect(run.options.systemPrompt).not.toContain('worktree');
    }
  });

  it('resumes every later run in the same worktree', async () => {
    const { conversations, runner, tickets, project } = setup();
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });
    const conversation = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });
    runner.runs[0].emit({ type: 'session', sessionId: 's1' });
    runner.runs[0].emit({ type: 'exit' });

    await conversations.reply(conversation.id, 'More.', 'user');

    expect(runner.runs).toHaveLength(2);
    expect(runner.runs[1].options.cwd).toBe(conversation.worktreePath);
    expect(runner.runs[1].options.systemPrompt).toContain(
      'git worktree Tandembike made',
    );
  });

  it('refuses a reply while the worktree is missing, naming the reason', async () => {
    const { conversations, runner, tickets, project, worktrees } = setup();
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });
    const conversation = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });
    runner.runs[0].emit({ type: 'exit' });
    worktrees.states.set(conversation.worktreePath as string, 'missing');

    const error = await failure(
      conversations.reply(conversation.id, 'More.', 'user'),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toContain('worktree');
    expect(runner.runs).toHaveLength(1);
  });

  it('leaves the Conversation interrupted with the message of git when the worktree cannot be created', async () => {
    const { conversations, runner, tickets, project, worktrees } = setup();
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });
    worktrees.failCreateWith = 'fatal: invalid reference: origin/main';

    const conversation = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });

    expect(conversation.state).toBe('interrupted');
    expect(runner.runs).toHaveLength(0);
    const entry = conversations.transcript(conversation.id).at(-1);
    expect(entry).toMatchObject({ role: 'error' });
    expect(entry?.text).toContain('fatal: invalid reference: origin/main');
  });

  it('runs the Prepare command in the new worktree before the run starts', async () => {
    const { conversations, runner, tickets, project, worktrees } = setup();
    tickets.setProjectAgentSettings(project.id, {
      parallelRuns: true,
      prepareCommand: 'npm ci',
    });

    const conversation = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });

    expect(worktrees.prepared).toEqual([
      { path: conversation.worktreePath, command: 'npm ci' },
    ]);
    expect(runner.runs).toHaveLength(1);
    expect(conversation.state).toBe('running');
  });

  it('runs no Prepare command when none is set', async () => {
    const { conversations, runner, tickets, project, worktrees } = setup();
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });

    await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });

    expect(worktrees.prepared).toEqual([]);
    expect(runner.runs).toHaveLength(1);
  });

  it('starts no run and leaves the Conversation interrupted when the Prepare command fails', async () => {
    const { conversations, runner, tickets, project, worktrees } = setup();
    tickets.setProjectAgentSettings(project.id, {
      parallelRuns: true,
      prepareCommand: 'npm ci',
    });
    worktrees.prepareResult = { exitCode: 1, output: 'npm ERR! no lockfile' };

    const conversation = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });

    expect(conversation.state).toBe('interrupted');
    expect(runner.runs).toHaveLength(0);
    const entry = conversations.transcript(conversation.id).at(-1);
    expect(entry).toMatchObject({ role: 'error' });
    expect(entry?.text).toContain('npm ERR! no lockfile');
    expect(entry?.text).toContain('exit code 1');
  });

  it('is refused when the Project has no repository path', async () => {
    const { conversations, tickets, runner } = setup();
    const bare = tickets.createProject({ name: 'Bare' });

    const error = await failure(
      conversations.start({
        projectId: bare.id,
        intent: 'ask',
        prompt: 'Hi',
        startedBy: 'user',
      }),
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
        conversations.start({
          projectId: 999,
          intent: 'ask',
          prompt: 'Hi',
          startedBy: 'user',
        }),
      ),
    ).toBeInstanceOf(NotFoundError);
    expect(
      await failure(
        conversations.start({
          ticketNumber: 999,
          intent: 'ask',
          prompt: 'Hi',
          startedBy: 'user',
        }),
      ),
    ).toBeInstanceOf(NotFoundError);
    expect(
      await failure(
        conversations.start({
          startedBy: 'user',
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
      startedBy: 'user',
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
      startedBy: 'user',
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
    await conversations.reply(id, 'Again', 'user');
    runner.runs[1].emit({ type: 'turn', costUsd: 0.1 });
    expect(conversations.get(id).costUsd).toBeCloseTo(0.6);
  });

  it('waits for the User when the run says so, and works again after', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
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
      startedBy: 'user',
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
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    await conversations.reply(id, 'Also this', 'user');
    runner.runs[0].emit({ type: 'turn', costUsd: 0.1 });
    const after = await conversations.reply(id, 'And that', 'user');

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
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({ type: 'session', sessionId: 'sess-1' });
    runner.runs[0].emit({ type: 'exit', error: 'died' });

    const after = await conversations.reply(id, 'Carry on', 'user');

    expect(after.state).toBe('running');
    expect(runner.runs).toHaveLength(2);
    expect(runner.runs[1].options).toMatchObject({
      cwd: repositoryDir,
      resume: 'sess-1',
      prompt: 'Carry on',
    });
  });

  it('is interrupted, not idle, when its run ends after a finished turn', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({ type: 'turn', costUsd: 0.1 });
    runner.runs[0].emit({ type: 'exit' });

    expect(conversations.get(id).state).toBe('interrupted');
  });

  it('records the Tickets a run created as one transcript entry', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'new_ticket',
      prompt: 'Add coupons',
    });

    runner.runs[0].emit({ type: 'created', numbers: [41, 42] });

    expect(conversations.transcript(id).at(-1)).toMatchObject({
      role: 'created',
      text: 'Created T41, T42',
    });
  });

  it('resumes an idle Conversation whose run has ended', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({ type: 'session', sessionId: 'sess-1' });
    runner.runs[0].emit({ type: 'turn', costUsd: 0.1 });
    runner.runs[0].emit({ type: 'exit' });

    await conversations.reply(id, 'More', 'user');

    expect(runner.runs[1].options.resume).toBe('sess-1');
  });

  it('is refused for an empty reply or an unknown Conversation', async () => {
    const { conversations, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    expect(await failure(conversations.reply(id, ' ', 'user'))).toBeInstanceOf(
      ValidationError,
    );
    expect(
      await failure(conversations.reply(999, 'Hi', 'user')),
    ).toBeInstanceOf(NotFoundError);
  });

  it('resumes a stopped Conversation from its stored SDK session ID', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({ type: 'session', sessionId: 'sess-1' });
    await conversations.stop(id);

    const replied = await conversations.reply(id, 'More', 'user');

    expect(replied.state).toBe('running');
    expect(runner.runs[1].options.resume).toBe('sess-1');
  });

  it('is refused once the Project lost its repository path', async () => {
    const { conversations, runner, tickets, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({ type: 'exit', error: 'died' });
    tickets.setProjectAgentSettings(project.id, { repositoryPath: null });

    expect(await failure(conversations.reply(id, 'Hi', 'user'))).toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('Stopping a Conversation', () => {
  it('interrupts the run, ends it and marks the Conversation stopped', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
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

  it('records the cost the interrupted turn reports after the stop', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    await conversations.stop(id);
    runner.runs[0].emit({ type: 'turn', costUsd: 0.25, error: 'interrupted' });

    const stopped = conversations.get(id);
    expect(stopped.costUsd).toBe(0.25);
    expect(stopped.state).toBe('stopped');
  });

  it('stops a Conversation with no live run too', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
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
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    const stopped = await conversations.start({
      startedBy: 'user',
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
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'One',
    });
    const second = await conversations.start({
      startedBy: 'user',
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

describe('Activity rows', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists every Conversation newest first with its latest entry and run start', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { conversations, tickets, runner, project } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
    const first = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'One',
    });
    vi.setSystemTime(new Date('2026-11-07T10:05:00Z'));
    const second = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Two',
    });
    runner.runs[0].emit({ type: 'exit', error: 'crashed' });
    runner.runs[1].emit({ type: 'agent', text: 'Hi' });

    expect(conversations.activityRows()).toEqual([
      {
        id: second.id,
        ticketNumber: null,
        projectId: project.id,
        state: second.state,
        latest: {
          role: 'agent',
          text: 'Hi',
          permissionRules: null,
          toolName: null,
          toolInput: null,
        },
        startedAt: '2026-11-07T10:05:00.000Z',
        costUsd: 0,
      },
      {
        id: first.id,
        ticketNumber: ticket.number,
        projectId: project.id,
        state: 'interrupted',
        latest: {
          role: 'error',
          text: 'crashed',
          permissionRules: null,
          toolName: null,
          toolInput: null,
        },
        startedAt: '2026-11-07T10:00:00.000Z',
        costUsd: 0,
      },
    ]);
  });

  it("starts the run again at the User's latest message", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { conversations, tickets, runner, project } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
    const { id } = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'One',
    });
    runner.runs[0].emit({ type: 'turn', costUsd: 0.1 });
    vi.setSystemTime(new Date('2026-11-07T11:00:00Z'));
    await conversations.reply(id, 'More', 'user');
    runner.runs
      .at(-1)
      ?.emit({ type: 'tool', text: 'Read {"file_path":"a.ts"}' });

    const [row] = conversations.activityRows();
    expect(row.startedAt).toBe('2026-11-07T11:00:00.000Z');
    expect(row.latest).toEqual({
      role: 'tool',
      text: 'Read {"file_path":"a.ts"}',
      permissionRules: null,
      toolName: null,
      toolInput: null,
    });
  });

  it('carries the name and input of a tool entry', async () => {
    const { conversations, tickets, runner, project } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const { id } = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'One',
    });
    runner.runs[0].emit({
      type: 'tool',
      text: 'Read {"file_path":"/a.ts"}',
      name: 'Read',
      input: { file_path: '/a.ts' },
    });

    const [row] = conversations.activityRows();
    expect(row.latest).toMatchObject({
      role: 'tool',
      toolName: 'Read',
      toolInput: { file_path: '/a.ts' },
    });
    const entry = conversations.transcript(id).at(-1);
    expect(entry).toMatchObject({
      toolName: 'Read',
      toolInput: { file_path: '/a.ts' },
    });
  });

  it('keeps the name but no input when the input is over the cap', async () => {
    const { conversations, tickets, runner, project } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'One',
    });
    runner.runs[0].emit({
      type: 'tool',
      text: 'Write cut',
      name: 'Write',
      input: { file_path: '/a.ts', content: 'x'.repeat(maxToolInputLength) },
    });

    const [row] = conversations.activityRows();
    expect(row.latest).toMatchObject({
      toolName: 'Write',
      toolInput: null,
    });
  });

  it('carries the name and input of a permission request', async () => {
    const { conversations, tickets, runner, project } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'One',
    });
    void runner.runs[0].options.askPermission({
      toolName: 'Bash',
      input: { command: 'ls' },
      rules: [],
    });

    const [row] = conversations.activityRows();
    expect(row.latest).toMatchObject({
      role: 'permission',
      toolName: 'Bash',
      toolInput: { command: 'ls' },
    });
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
      startedBy: 'user',
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
  const request = {
    toolName: 'Bash',
    input: { command: 'npm test' },
    rules: [] as string[],
  };
  const withRules = { ...request, rules: ['Bash(npm test:*)'] };

  async function started() {
    const world = setup();
    const conversation = await world.conversations.start({
      startedBy: 'user',
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

    await conversations.answerPermission(entry?.id ?? 0, 'allow');

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

    await conversations.answerPermission(entry?.id ?? 0, 'deny');

    expect(await pending).toBe('deny');
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      permission: 'denied',
    });
  });

  it('stores the rules a request proposes and returns them in the transcript', async () => {
    const { conversations, conversation, run } = await started();

    void run.options.askPermission(withRules);
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      permissionRules: ['Bash(npm test:*)'],
    });

    void run.options.askPermission(request);
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      permissionRules: null,
    });
  });

  it('lets the run go on after Always allow and records it', async () => {
    const { conversations, conversation, run } = await started();
    const pending = run.options.askPermission(withRules);
    const entry = conversations.transcript(conversation.id).at(-1);

    await conversations.answerPermission(entry?.id ?? 0, 'allow-always');

    expect(await pending).toBe('allow-always');
    expect(conversations.get(conversation.id).state).toBe('running');
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      permission: 'always-allowed',
      permissionRules: ['Bash(npm test:*)'],
    });
  });

  it('refuses Always allow on a request without rules and leaves it waiting', async () => {
    const { conversations, conversation, run } = await started();
    void run.options.askPermission(request);
    const entry = conversations.transcript(conversation.id).at(-1);

    const error = await failure(
      conversations.answerPermission(entry?.id ?? 0, 'allow-always'),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      permission: 'pending',
    });
    await conversations.answerPermission(entry?.id ?? 0, 'allow');
  });

  it.each(['allow', 'allow-always', 'deny'] as const)(
    'refuses %s on an answered request',
    async (choice) => {
      const { conversations, conversation, run } = await started();
      void run.options.askPermission(withRules);
      const entry = conversations.transcript(conversation.id).at(-1);
      await conversations.answerPermission(entry?.id ?? 0, 'deny');

      const error = await failure(
        conversations.answerPermission(entry?.id ?? 0, choice),
      );

      expect(error).toBeInstanceOf(NotAllowedError);
    },
  );

  it.each(['allow', 'allow-always', 'deny'] as const)(
    'refuses %s on an expired request',
    async (choice) => {
      const { conversations, conversation, run, restart } = await started();
      void run.options.askPermission(withRules);
      const entry = conversations.transcript(conversation.id).at(-1);
      const next = restart();
      next.interruptStale();

      const error = await failure(
        next.answerPermission(entry?.id ?? 0, choice),
      );

      expect(error).toBeInstanceOf(NotAllowedError);
    },
  );

  it('refuses an answer that is none of the three', async () => {
    const { conversations, conversation, run } = await started();
    void run.options.askPermission(request);
    const entry = conversations.transcript(conversation.id).at(-1);

    const error = await failure(
      conversations.answerPermission(entry?.id ?? 0, 'maybe' as never),
    );

    expect(error).toBeInstanceOf(ValidationError);
  });

  it('refuses a second answer', async () => {
    const { conversations, run, conversation } = await started();
    void run.options.askPermission(request);
    const entry = conversations.transcript(conversation.id).at(-1);
    await conversations.answerPermission(entry?.id ?? 0, 'allow');

    const error = await failure(
      conversations.answerPermission(entry?.id ?? 0, 'deny'),
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
    const error = await failure(next.answerPermission(entry?.id ?? 0, 'allow'));
    expect(error).toBeInstanceOf(NotAllowedError);
  });
});

describe('Questions of the Agent', () => {
  const questions = [
    {
      question: 'Which library?',
      header: 'Library',
      multiSelect: false,
      options: [
        { label: 'A', description: 'The first' },
        { label: 'B', description: 'The second' },
      ],
    },
    {
      question: 'Which features?',
      header: 'Features',
      multiSelect: true,
      options: [
        { label: 'X', description: 'Ex' },
        { label: 'Y', description: 'Why' },
      ],
    },
  ];

  async function started() {
    const world = setup();
    const conversation = await world.conversations.start({
      startedBy: 'user',
      projectId: world.project.id,
      intent: 'start',
      prompt: 'Go',
    });
    return { ...world, conversation, run: world.runner.runs[0] };
  }

  it('records a question entry with its choices, marks the Conversation waiting and holds the run', async () => {
    const { conversations, conversation, run } = await started();

    let answers: unknown;
    void run.options.askQuestion(questions).then((result) => {
      answers = result;
    });
    await Promise.resolve();

    expect(conversations.get(conversation.id).state).toBe('waiting');
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      role: 'question',
      question: { questions, answers: null, expired: false },
    });
    expect(answers).toBeUndefined();
  });

  it('gives the run the answers and records them', async () => {
    const { conversations, conversation, run } = await started();
    const pending = run.options.askQuestion(questions);
    const entry = conversations.transcript(conversation.id).at(-1);
    const given = { 'Which library?': 'A', 'Which features?': 'X, Y' };

    await conversations.answerQuestion(entry?.id ?? 0, given);

    expect(await pending).toEqual(given);
    expect(conversations.get(conversation.id).state).toBe('running');
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      question: { answers: given },
    });
  });

  it('refuses an answer that leaves a question unanswered', async () => {
    const { conversations, conversation, run } = await started();
    void run.options.askQuestion(questions);
    const entry = conversations.transcript(conversation.id).at(-1);

    const error = await failure(
      conversations.answerQuestion(entry?.id ?? 0, {
        'Which library?': 'A',
        'Which features?': '  ',
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(conversations.get(conversation.id).state).toBe('waiting');
  });

  it('refuses a second answer', async () => {
    const { conversations, conversation, run } = await started();
    void run.options.askQuestion(questions);
    const entry = conversations.transcript(conversation.id).at(-1);
    const given = { 'Which library?': 'A', 'Which features?': 'X' };
    await conversations.answerQuestion(entry?.id ?? 0, given);

    const error = await failure(
      conversations.answerQuestion(entry?.id ?? 0, given),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect((error as Error).message).toBe(
      'This question was already answered.',
    );
  });

  it('resolves empty and expires a pending question when the Conversation is stopped', async () => {
    const { conversations, conversation, run } = await started();
    const pending = run.options.askQuestion(questions);

    await conversations.stop(conversation.id);

    expect(await pending).toEqual({});
    expect(conversations.transcript(conversation.id).at(-1)).toMatchObject({
      question: { answers: null, expired: true },
    });
  });

  it('resolves empty when the Conversation is closed', async () => {
    const { conversations, conversation, run } = await started();
    const pending = run.options.askQuestion(questions);

    await conversations.close(conversation.id);

    expect(await pending).toEqual({});
  });

  it('refuses to answer once the run is gone, and expires pending questions when the server restarts', async () => {
    const { conversations, conversation, run, restart } = await started();
    void run.options.askQuestion(questions);
    const entry = conversations.transcript(conversation.id).at(-1);

    const next = restart();
    next.interruptStale();

    expect(next.transcript(conversation.id).at(-1)).toMatchObject({
      question: { answers: null, expired: true },
    });
    const error = await failure(
      next.answerQuestion(entry?.id ?? 0, { 'Which library?': 'A' }),
    );
    expect(error).toBeInstanceOf(NotAllowedError);
    expect((error as Error).message).toBe(
      'This question is no longer waiting.',
    );
  });
});

describe('The Start run limit', () => {
  const startOn = (
    conversations: ReturnType<typeof setup>['conversations'],
    projectId: number,
    intent: 'start' | 'triage' | 'ask' = 'start',
  ) =>
    conversations.start({
      projectId,
      intent,
      prompt: 'Go.',
      startedBy: 'user',
    });

  it('refuses a second running Start with Parallel runs off, with a reason', async () => {
    const { conversations, project } = setup();
    await startOn(conversations, project.id);

    const error = await failure(startOn(conversations, project.id));

    expect(error).toBeInstanceOf(NotAllowedError);
    expect((error as Error).message).toMatch(/Start run/);
    expect((error as Error).message).toMatch(/Parallel runs/);
    expect(conversations.list({ projectId: project.id })).toHaveLength(1);
  });

  it('does not count a Start that waits idle for a reply', async () => {
    const { conversations, runner, project } = setup();
    await startOn(conversations, project.id);
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });

    await startOn(conversations, project.id);
  });

  it('lets the User reply to an idle Start while the slots are full (T1185)', async () => {
    const { conversations, runner, project } = setup();
    const first = await startOn(conversations, project.id);
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    await startOn(conversations, project.id);

    await conversations.reply(first.id, 'More', 'user');

    expect(conversations.get(first.id).state).toBe('running');
    expect(runner.runs[0].sent).toContain('More');
  });

  it('refuses Autopilot’s reply to an idle Start while the slots are full', async () => {
    const { conversations, runner, project } = setup();
    const first = await startOn(conversations, project.id);
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    await startOn(conversations, project.id);

    const error = await failure(
      conversations.reply(first.id, 'More', 'autopilot'),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect(conversations.get(first.id).state).toBe('idle');
  });

  it('counts a Start that waits for a permission', async () => {
    const { conversations, runner, project } = setup();
    await startOn(conversations, project.id);
    void runner.runs[0].options.askPermission({
      toolName: 'Bash',
      input: {},
      rules: [],
    });

    const error = await failure(startOn(conversations, project.id));

    expect(error).toBeInstanceOf(NotAllowedError);
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
      // A repository belongs to one Project, so Other gets a folder of its own.
      repositoryPath: mkdtempSync(join(tmpdir(), 'other-repo-')),
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

  it('lets the User resume an interrupted Start while the slots are full (T1185)', async () => {
    const { conversations, runner, project } = setup();
    const first = await startOn(conversations, project.id);
    runner.runs[0].emit({ type: 'exit', error: 'died' });
    await startOn(conversations, project.id);

    await conversations.reply(first.id, 'Go on', 'user');

    expect(conversations.get(first.id).state).toBe('running');
    expect(runner.runs).toHaveLength(3);
  });

  it('lets the User reopen a closed Start while the slots are full (T1185)', async () => {
    const { conversations, runner, project } = setup();
    const first = await startOn(conversations, project.id);
    await conversations.close(first.id);
    await startOn(conversations, project.id);

    await conversations.reply(first.id, 'Go on', 'user');

    expect(conversations.get(first.id)).toMatchObject({
      state: 'running',
      hidden: false,
    });
    expect(runner.runs).toHaveLength(3);
  });

  it('refuses Autopilot’s reply that would resume a Start beyond the limit', async () => {
    const { conversations, runner, project } = setup();
    const first = await startOn(conversations, project.id);
    runner.runs[0].emit({ type: 'exit', error: 'died' });
    await startOn(conversations, project.id);

    const error = await failure(
      conversations.reply(first.id, 'Go on', 'autopilot'),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
  });

  it('refuses a new Start by Autopilot while the slots are full', async () => {
    const { conversations, project } = setup();
    await startOn(conversations, project.id);

    const error = await failure(
      conversations.start({
        projectId: project.id,
        intent: 'start',
        prompt: 'Go.',
        startedBy: 'autopilot',
      }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
  });

  it('lets a reply into a live Start through, and resumes Triage at any time', async () => {
    const { conversations, runner, project } = setup();
    const first = await startOn(conversations, project.id);
    const triage = await startOn(conversations, project.id, 'triage');
    runner.runs[1].emit({ type: 'exit', error: 'died' });

    await conversations.reply(first.id, 'More', 'user');
    await conversations.reply(triage.id, 'Again', 'user');
  });
});

describe('New Ticket Conversations', () => {
  it('tells the Agent the field it came from as defaults, and keeps them when it resumes', async () => {
    const { conversations, restart, runner, tickets, project } = setup();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });

    const conversation = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'new_ticket',
      prompt: 'Add a coupon field',
      defaults: { cycleId: 7, epicNumber: epic.number, type: 'Ticket' },
    });

    expect(conversation.ticketNumber).toBeNull();
    expect(runner.runs[0].options.prompt).toBe('Add a coupon field');
    const brief = runner.runs[0].options.systemPrompt;
    expect(brief).toContain('Website');
    expect(brief).toContain('new Ticket');
    expect(brief).toContain('Cycle 7');
    expect(brief).toContain(`Epic T${epic.number}`);
    expect(brief).toContain('type Ticket');

    const resumed = restart();
    await resumed.reply(conversation.id, 'Make it optional', 'user');
    expect(runner.runs[1].options.systemPrompt).toContain('Cycle 7');
  });

  it('gives only the defaults the field has', async () => {
    const { conversations, runner, project } = setup();

    await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'new_ticket',
      prompt: 'Add an Epic',
      defaults: { type: 'Epic' },
    });

    const brief = runner.runs[0].options.systemPrompt;
    expect(brief).toContain('type Epic');
    expect(brief).not.toContain('Cycle');
  });

  it('does not count toward the Start run limit', async () => {
    const { conversations, tickets, project } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });

    await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'new_ticket',
      prompt: 'One',
    });
    await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'new_ticket',
      prompt: 'Two',
    });

    const other = tickets.createTicket({ projectId: project.id, title: 'B' });
    const refusal = await failure(
      conversations.start({
        startedBy: 'user',
        ticketNumber: other.number,
        intent: 'start',
        prompt: 'Go',
      }),
    );
    expect((refusal as Error).message).toContain('a Start run working');
  });
});

describe('Open Conversations', () => {
  it('lists every open Conversation of the app in the order opened, with what a tab needs', async () => {
    const { conversations, tickets, project } = setup();
    const other = tickets.createProject({ name: 'Blog' });
    tickets.setProjectAgentSettings(other.id, {
      repositoryPath: setup().repositoryDir,
    });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the footer',
    });
    const first = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'triage',
      prompt: 'Triage it',
    });
    const second = await conversations.start({
      startedBy: 'user',
      projectId: other.id,
      intent: 'new_ticket',
      prompt: 'Add coupons',
    });

    const open = conversations.listOpen();

    expect(open.map(({ conversation }) => conversation.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(open[0]).toMatchObject({
      ticketTitle: 'Fix the footer',
      projectName: 'Website',
      firstMessage: 'Triage it',
    });
    expect(open[0].conversation).toMatchObject({
      ticketNumber: ticket.number,
      intent: 'triage',
      state: 'running',
      costUsd: 0,
    });
    expect(open[1]).toMatchObject({
      ticketTitle: null,
      projectName: 'Blog',
      firstMessage: 'Add coupons',
    });
  });

  it('closes any Conversation, a Ticket’s too: it stops the run, keeps the transcript and announces it', async () => {
    const changes = createChangeChannel();
    const published = vi.fn();
    changes.subscribe(published);
    const world = createTestConversations(changes);
    const project = world.tickets.createProject({ name: 'Website' });
    world.tickets.setProjectAgentSettings(project.id, {
      repositoryPath: world.repositoryDir,
    });
    const ticket = world.tickets.createTicket({
      projectId: project.id,
      title: 'A',
    });
    const { conversations, runner } = world;
    const about = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'ask',
      prompt: 'On a Ticket',
    });
    const kept = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'new_ticket',
      prompt: 'On a Project',
    });
    published.mockClear();

    const closed = await conversations.close(about.id);

    expect(closed).toMatchObject({ state: 'stopped', hidden: true });
    expect(runner.runs[0].interrupted).toBe(true);
    expect(
      conversations.listOpen().map(({ conversation }) => conversation.id),
    ).toEqual([kept.id]);
    expect(conversations.transcript(about.id)).toHaveLength(1);
    expect(published).toHaveBeenCalledWith({
      type: 'conversation',
      id: about.id,
    });
  });

  it('reopens a closed Conversation, keeping its place in the order opened', async () => {
    const { conversations, project } = setup();
    const first = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'One',
    });
    const second = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Two',
    });
    await conversations.close(first.id);

    const reopened = await conversations.reopen(first.id);

    expect(reopened.hidden).toBe(false);
    expect(reopened.state).toBe('stopped');
    expect(
      conversations.listOpen().map(({ conversation }) => conversation.id),
    ).toEqual([first.id, second.id]);
    expect(await failure(conversations.reopen(999))).toBeInstanceOf(
      NotFoundError,
    );
  });

  it('reopens and resumes a closed Conversation when the User replies', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({ type: 'session', sessionId: 'sess-1' });
    await conversations.close(id);

    const replied = await conversations.reply(id, 'More', 'user');

    expect(replied).toMatchObject({ hidden: false, state: 'running' });
    expect(runner.runs[1].options.resume).toBe('sess-1');
    expect(
      conversations.listOpen().map(({ conversation }) => conversation.id),
    ).toEqual([id]);
  });
});

describe('Setup', () => {
  const startSetup = (
    conversations: ReturnType<typeof setup>['conversations'],
    projectId: number,
  ) =>
    conversations.start({
      startedBy: 'user',
      projectId,
      intent: 'setup',
      prompt: 'Check this repository.',
    });

  it('is about the Project, and the brief lists the checklist and the no-commit rule', async () => {
    const { conversations, runner, project } = setup();

    const conversation = await startSetup(conversations, project.id);

    expect(conversation).toMatchObject({ intent: 'setup', ticketNumber: null });
    const brief = runner.runs[0].options.systemPrompt;
    expect(brief).toContain('Website');
    expect(brief).toContain('CLAUDE.md');
    expect(brief).toContain('AGENTS.md');
    // The Project defaults from the folder, so Setup asks for neither (ADR 0036).
    expect(brief).not.toContain('.mcp.json');
    expect(brief).not.toMatch(/instructions name the Tandembike Project/);
    expect(brief).not.toMatch(/MCP server is configured/);
    expect(brief).toContain('allowlist');
    expect(brief).toMatch(/main checkout/);
    expect(brief).toMatch(/never commit, push or open a pull request/i);
    expect(brief).toContain('added (uncommitted)');
    expect(brief).toContain('skipped by the User');
    expect(brief).toContain('missing');
  });

  it("reports the Project's run mode and a git-blocking hook as advisory items, without suggesting auto", async () => {
    const { conversations, runner, tickets, project } = setup();
    tickets.setProjectAgentSettings(project.id, { runMode: 'default' });
    await startSetup(conversations, project.id);

    const brief = runner.runs[0].options.systemPrompt;
    expect(brief).toMatch(/run mode is default/i);
    expect(brief).toMatch(/hook[^.]*(blocks|block)[^.]*destructive git/i);
    expect(brief).not.toMatch(/consider (turning on|using) auto/i);
    expect(brief).not.toMatch(/recommend[^.]*auto/i);
  });

  it('says the run mode is auto in the Setup brief when the Project uses it', async () => {
    const { conversations, runner, tickets, project } = setup();
    tickets.setProjectAgentSettings(project.id, { runMode: 'auto' });

    await startSetup(conversations, project.id);

    expect(runner.runs[0].options.systemPrompt).toMatch(/run mode is auto/i);
  });

  it('lists the worktree item only with Parallel runs on', async () => {
    const { conversations, tickets, runner, project } = setup();
    const first = await startSetup(conversations, project.id);
    expect(runner.runs[0].options.systemPrompt).not.toContain('worktree');

    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });
    await conversations.stop(first.id);
    await startSetup(conversations, project.id);
    expect(runner.runs[1].options.systemPrompt).toContain('worktree');
  });

  it('refuses a Ticket: Setup is about a Project', async () => {
    const { conversations, tickets, project } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });

    const error = await failure(
      conversations.start({
        startedBy: 'user',
        ticketNumber: ticket.number,
        intent: 'setup',
        prompt: 'Check.',
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
  });

  it('opens the running Setup instead of starting another', async () => {
    const { conversations, runner, project } = setup();
    const first = await startSetup(conversations, project.id);

    const again = await startSetup(conversations, project.id);

    expect(again.id).toBe(first.id);
    expect(runner.runs).toHaveLength(1);
    expect(conversations.list({ projectId: project.id })).toHaveLength(1);
  });

  it('starts a new Setup once the earlier one is stopped, and keeps one per Project', async () => {
    const { conversations, tickets, project } = setup();
    const other = tickets.createProject({ name: 'Other' });
    tickets.setProjectAgentSettings(other.id, {
      // A repository belongs to one Project, so Other gets a folder of its own.
      repositoryPath: mkdtempSync(join(tmpdir(), 'other-repo-')),
    });
    const first = await startSetup(conversations, project.id);
    expect((await startSetup(conversations, other.id)).id).not.toBe(first.id);

    await conversations.stop(first.id);
    const second = await startSetup(conversations, project.id);

    expect(second.id).not.toBe(first.id);
  });

  it('does not count toward the Start run limit', async () => {
    const { conversations, project } = setup();
    await startSetup(conversations, project.id);

    const start = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'start',
      prompt: 'Go.',
    });

    expect(start.intent).toBe('start');
  });
});

describe('Started by', () => {
  it('records who started a Conversation and lists it', async () => {
    const { conversations, project } = setup();

    const byUser = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hello',
      startedBy: 'user',
    });
    const byAutopilot = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hello',
      startedBy: 'autopilot',
    });

    expect(byUser.startedBy).toBe('user');
    expect(byAutopilot.startedBy).toBe('autopilot');
    expect(
      conversations.list({ projectId: project.id }).map((c) => c.startedBy),
    ).toEqual(expect.arrayContaining(['user', 'autopilot']));
  });

  it('records an Autopilot reply in the transcript with its own role, apart from the User', async () => {
    const { conversations, runner, project } = setup();
    const { id } = await conversations.start({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hello',
      startedBy: 'autopilot',
    });
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    await conversations.reply(id, 'Continue T42', 'autopilot');
    await conversations.reply(id, 'Thanks', 'user');

    expect(
      conversations.transcript(id).filter((e) => e.role !== 'agent'),
    ).toMatchObject([
      { role: 'autopilot', text: 'Hello' },
      { role: 'autopilot', text: 'Continue T42' },
      { role: 'user', text: 'Thanks' },
    ]);
  });
});

describe('Autopilot spend', () => {
  it("sums the cost of the Autopilot-started Conversations of the Cycle they were started for, resumes included, not hand-started ones or other Cycles'", async () => {
    const { conversations, runner, tickets, project } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });
    const other = tickets.createCycle({ projectId: project.id, title: 'B' });
    const ticket = (title: string, cycleId: number) =>
      tickets.createTicket({ projectId: project.id, title, cycleId });
    const first = ticket('First', cycle.id);
    const second = ticket('Second', cycle.id);
    const elsewhere = ticket('Elsewhere', other.id);
    const startFor = async (
      ticketNumber: number,
      startedBy: 'user' | 'autopilot',
      costUsd: number,
      cycleId?: number,
    ) => {
      const started = await conversations.start({
        startedBy,
        ticketNumber,
        intent: 'start',
        prompt: 'Go',
        ...(cycleId === undefined ? {} : { cycleId }),
      });
      runner.runs[runner.runs.length - 1].emit({ type: 'turn', costUsd });
      return started;
    };

    const run = await startFor(first.number, 'autopilot', 0.5, cycle.id);
    await startFor(second.number, 'autopilot', 0.25, cycle.id);
    await startFor(second.number, 'user', 4);
    await startFor(elsewhere.number, 'autopilot', 8, other.id);
    // A resume adds to the same Conversation, so it stays with its Cycle.
    await conversations.stop(run.id);
    await conversations.reply(run.id, 'Go on', 'autopilot');
    runner.runs[runner.runs.length - 1].emit({ type: 'turn', costUsd: 1 });

    expect(
      conversations.autopilotSpend({
        projectId: project.id,
        cycleId: cycle.id,
      }),
    ).toBeCloseTo(1.75);
    expect(
      conversations.autopilotSpend({
        projectId: project.id,
        cycleId: other.id,
      }),
    ).toBeCloseTo(8);
  });

  it("counts what Autopilot's replies cost on a hand-started Conversation of the Cycle, for those runs only", async () => {
    const { conversations, runner, tickets, project } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });
    const other = tickets.createCycle({ projectId: project.id, title: 'B' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Manual',
      cycleId: cycle.id,
    });
    const elsewhere = tickets.createTicket({
      projectId: project.id,
      title: 'Elsewhere',
      cycleId: other.id,
    });
    const hand = async (ticketNumber: number) => {
      const started = await conversations.start({
        startedBy: 'user',
        ticketNumber,
        intent: 'start',
        prompt: 'Go',
      });
      runner.runs[runner.runs.length - 1].emit({ type: 'turn', costUsd: 4 });
      await conversations.reply(started.id, 'Resume', 'autopilot');
      // The live run reports its running total.
      runner.runs[runner.runs.length - 1].emit({ type: 'turn', costUsd: 5.5 });
      return started;
    };
    const manual = await hand(ticket.number);
    await hand(elsewhere.number);
    // The User's own reply adds nothing.
    await conversations.reply(manual.id, 'Thanks', 'user');
    runner.runs[runner.runs.length - 1].emit({ type: 'turn', costUsd: 8 });

    expect(
      conversations.autopilotSpend({
        projectId: project.id,
        cycleId: cycle.id,
      }),
    ).toBeCloseTo(1.5);
  });
});

describe('A Spec Conversation (T1222)', () => {
  it('runs in the main checkout and is not counted against the Start run limit', async () => {
    const { conversations, runner, tickets, project } = setup();
    const idea = tickets.createTicket({ projectId: project.id, title: 'Idea' });
    const other = tickets.createTicket({ projectId: project.id, title: 'B' });

    const spec = await conversations.start({
      startedBy: 'user',
      ticketNumber: idea.number,
      intent: 'spec',
      prompt: `/tandembike:spec T${idea.number}`,
    });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: other.number,
      intent: 'start',
      prompt: 'Go',
    });

    expect(spec).toMatchObject({ intent: 'spec', worktreePath: null });
    expect(runner.runs).toHaveLength(2);
    expect(runner.runs[0].options.prompt).toBe(
      `/tandembike:spec T${idea.number}`,
    );
    expect(runner.runs[0].options.systemPrompt).toContain('Spec');
  });

  it('is refused when Autopilot starts it', async () => {
    const { conversations, tickets, project } = setup();
    const idea = tickets.createTicket({ projectId: project.id, title: 'Idea' });

    const error = await failure(
      conversations.start({
        startedBy: 'autopilot',
        ticketNumber: idea.number,
        intent: 'spec',
        prompt: 'Go',
      }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect(conversations.list({ projectId: project.id })).toHaveLength(0);
  });

  it('is refused without a Ticket', async () => {
    const { conversations, project } = setup();

    const error = await failure(
      conversations.start({
        startedBy: 'user',
        projectId: project.id,
        intent: 'spec',
        prompt: 'Go',
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
  });
});

describe('A Retro Conversation', () => {
  it('records its Cycle and the User, and sends the Playbook Retro command when the Retro command is blank', async () => {
    const { conversations, runner, tickets, project } = setup();
    tickets.setProjectAgentCommands(project.id, {
      triageCommand: '',
      startCommand: '',
      startEpicCommand: '',
      retroCommand: '',
      specCommand: '',
      mergeCommand: '',
    });
    const cycle = tickets.createCycle({
      projectId: project.id,
      title: 'Launch the beta',
    });

    const retro = await conversations.startRetro({ cycleId: cycle.id });

    expect(retro).toMatchObject({
      projectId: project.id,
      ticketNumber: null,
      intent: 'retro',
      startedBy: 'user',
      retroCycleId: cycle.id,
    });
    expect(runner.runs[0].options.prompt).toBe(
      `/tandembike:retro "Launch the beta" (Cycle ${cycle.id})`,
    );
    expect(runner.runs[0].options.systemPrompt).toContain(
      `"Launch the beta" (Cycle ${cycle.id})`,
    );
    expect(conversations.transcript(retro.id)).toMatchObject([
      {
        role: 'user',
        text: `/tandembike:retro "Launch the beta" (Cycle ${cycle.id})`,
      },
    ]);
  });

  it('sends the Retro command with the Cycle’s title and id when it is set', async () => {
    const { conversations, runner, tickets, project } = setup();
    tickets.setProjectAgentCommands(project.id, {
      triageCommand: '',
      startCommand: '',
      startEpicCommand: '',
      retroCommand: 'retro',
      specCommand: '/spec',
      mergeCommand: 'merge',
    });
    const cycle = tickets.createCycle({
      projectId: project.id,
      title: 'Launch the beta',
    });

    const retro = await conversations.startRetro({ cycleId: cycle.id });

    const message = `/retro "Launch the beta" (Cycle ${cycle.id})`;
    expect(runner.runs[0].options.prompt).toBe(message);
    expect(conversations.transcript(retro.id)).toMatchObject([
      { role: 'user', text: message },
    ]);
  });

  it('refuses a Retro without a Cycle, with another Project’s Cycle, or a second one', async () => {
    const { conversations, tickets, project } = setup();
    const other = tickets.createProject({ name: 'Other' });
    const foreign = tickets.createCycle({ projectId: other.id, title: 'X' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });

    const missing = await failure(
      conversations.start({
        startedBy: 'user',
        projectId: project.id,
        intent: 'retro',
        prompt: 'Retro',
      }),
    );
    expect(missing).toBeInstanceOf(ValidationError);
    expect(Object.keys((missing as ValidationError).fieldErrors)).toEqual([
      'retroCycleId',
    ]);
    const wrongProject = await failure(
      conversations.start({
        startedBy: 'user',
        projectId: project.id,
        intent: 'retro',
        prompt: 'Retro',
        retroCycleId: foreign.id,
      }),
    );
    expect(wrongProject).toBeInstanceOf(ValidationError);
    expect(Object.keys((wrongProject as ValidationError).fieldErrors)).toEqual([
      'retroCycleId',
    ]);
    await conversations.startRetro({ cycleId: cycle.id });
    expect(
      await failure(conversations.startRetro({ cycleId: cycle.id })),
    ).toBeInstanceOf(NotAllowedError);
  });

  it('is found for its Cycle, also once closed or the Cycle is archived', async () => {
    const { conversations, tickets, project } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });
    const other = tickets.createCycle({ projectId: project.id, title: 'B' });
    expect(conversations.retroOf(cycle.id)).toBeNull();

    const retro = await conversations.startRetro({ cycleId: cycle.id });
    await conversations.close(retro.id);
    tickets.startCycle(cycle.id);
    tickets.archiveCycle(cycle.id);

    expect(conversations.retroOf(cycle.id)?.id).toBe(retro.id);
    expect(conversations.retroOf(other.id)).toBeNull();
  });

  it('keeps its tab in the dialog after its Cycle is archived', async () => {
    const { conversations, tickets, project } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });
    const retro = await conversations.startRetro({ cycleId: cycle.id });

    tickets.startCycle(cycle.id);
    tickets.archiveCycle(cycle.id);

    expect(
      conversations.listOpen().map(({ conversation }) => conversation.id),
    ).toContain(retro.id);
  });

  it('does not count in Autopilot’s spend', async () => {
    const { conversations, runner, tickets, project } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });

    await conversations.startRetro({ cycleId: cycle.id });
    runner.runs[0].emit({ type: 'turn', costUsd: 3 });

    expect(
      conversations.autopilotSpend({
        projectId: project.id,
        cycleId: cycle.id,
      }),
    ).toBe(0);
  });
});
