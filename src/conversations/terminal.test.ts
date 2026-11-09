// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createAutopilot } from '../autopilot/autopilot';
import { createTestConversations } from '../test/conversations';
import { createChangeChannel } from '../tickets/changes';
import { NotAllowedError } from '../tickets/errors';
import { holdsStartRunSlot } from './conversations';

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected a rejection.');
}

const terminalMessage =
  'This Conversation runs in a terminal; answer it there.';

function setup(
  settings: Parameters<
    ReturnType<
      typeof createTestConversations
    >['tickets']['setProjectAgentSettings']
  >[1] = {},
) {
  const changes = createChangeChannel();
  const world = createTestConversations(changes);
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    ...settings,
  });
  const ticket = world.tickets.createTicket({
    projectId: project.id,
    title: 'Fix it',
  });
  return { ...world, changes, project, ticket };
}

describe('Starting a Terminal Conversation (T1237)', () => {
  it('records a running Conversation Started by Terminal and returns what the CLI needs', async () => {
    const { conversations, ticket, project, repositoryDir } = setup({
      runModel: 'sonnet',
    });

    const session = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'start',
    });

    const conversation = conversations.get(session.conversationId);
    expect(conversation).toMatchObject({
      projectId: project.id,
      ticketNumber: ticket.number,
      intent: 'start',
      startedBy: 'terminal',
      state: 'running',
      costUsd: 0,
    });
    expect(session).toMatchObject({
      cwd: repositoryDir,
      firstMessage: `/tandembike:implement T${ticket.number}`,
      runMode: 'auto',
      model: 'sonnet',
    });
    expect(session.brief).toContain(`T${ticket.number}`);
    expect(session.brief).toContain(
      `Your Agent-run ID: ${session.conversationId}`,
    );
    expect(conversations.transcript(session.conversationId)[0]).toMatchObject({
      role: 'user',
      text: session.firstMessage,
    });
  });

  it('sends the Start command for Epics on an Epic and the Project’s own command when set', async () => {
    const { conversations, tickets, project } = setup();
    tickets.setProjectAgentCommands(project.id, {
      triageCommand: '',
      startCommand: '',
      startEpicCommand: '/my:epic',
      retroCommand: '',
      specCommand: '',
      mergeCommand: '',
    });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Big',
      type: 'Epic',
    });

    const session = await conversations.startTerminal({
      ticketNumber: epic.number,
      intent: 'start',
    });

    expect(session.firstMessage).toBe(`/my:epic T${epic.number}`);
  });

  it('makes a worktree and runs the prepare command only with Parallel runs on', async () => {
    const off = setup({ prepareCommand: 'npm ci' });
    const offSession = await off.conversations.startTerminal({
      ticketNumber: off.ticket.number,
      intent: 'start',
    });
    expect(off.worktrees.created).toHaveLength(0);
    expect(offSession.cwd).toBe(off.repositoryDir);

    const on = setup({ parallelRuns: true, prepareCommand: 'npm ci' });
    const onSession = await on.conversations.startTerminal({
      ticketNumber: on.ticket.number,
      intent: 'start',
    });
    expect(on.worktrees.created).toHaveLength(1);
    expect(on.worktrees.prepared).toEqual([
      { path: onSession.cwd, command: 'npm ci' },
    ]);
    expect(onSession.cwd).toMatch(/^\/fake\/worktrees\//);
    expect(onSession.brief).toContain(onSession.cwd);
  });

  it('opens no session when the Prepare command fails, and says why', async () => {
    const { conversations, worktrees, ticket } = setup({
      parallelRuns: true,
      prepareCommand: 'npm ci',
    });
    worktrees.prepareResult = { exitCode: 1, output: 'boom' };

    const error = await failure(
      conversations.startTerminal({
        ticketNumber: ticket.number,
        intent: 'start',
      }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect(error.message).toContain('npm ci');
    expect(
      conversations.list({ ticketNumber: ticket.number })[0],
    ).toMatchObject({
      state: 'stopped',
      hidden: true,
    });
  });

  it('opens Triage in the main checkout even with Parallel runs on', async () => {
    const { conversations, worktrees, ticket, repositoryDir } = setup({
      parallelRuns: true,
    });

    const session = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'triage',
    });

    expect(worktrees.created).toHaveLength(0);
    expect(session.cwd).toBe(repositoryDir);
    expect(session.firstMessage).toBe(`/tandembike:triage T${ticket.number}`);
  });

  it('refuses an unknown or archived Ticket, a Project without a repository and a Ticket with a working Start', async () => {
    const { conversations, tickets, project, ticket } = setup();
    const start = (ticketNumber: number) =>
      failure(conversations.startTerminal({ ticketNumber, intent: 'start' }));

    expect((await start(9999)).message).toMatch(/9999/);

    await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });
    expect((await start(ticket.number)).message).toMatch(/already/);

    const archived = tickets.createTicket({
      projectId: project.id,
      title: 'Old',
    });
    tickets.archiveTicket(archived.number);
    expect((await start(archived.number)).message).toMatch(/archived/);

    const bare = tickets.createProject({ name: 'Bare' });
    const loose = tickets.createTicket({ projectId: bare.id, title: 'X' });
    expect((await start(loose.number)).message).toMatch(/repository path/);
  });
});

describe('The brief of a Terminal run', () => {
  it('says the User answers permission prompts and questions in the terminal', async () => {
    const { conversations, ticket } = setup();

    const { brief } = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'start',
    });

    expect(brief).toMatch(/terminal/);
    expect(brief).toMatch(/permission prompts and questions/);
    expect(brief).not.toContain('A human answers in the Tandembike UI');
  });
});

describe('Ending a Terminal Conversation', () => {
  it('stops it with a Session ended entry holding the exit code, once', async () => {
    const { conversations, ticket } = setup();
    const { conversationId } = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'start',
    });

    await conversations.endTerminal(conversationId, { exitCode: 3 });
    await conversations.endTerminal(conversationId, { exitCode: 0 });

    expect(conversations.get(conversationId).state).toBe('stopped');
    const ended = conversations
      .transcript(conversationId)
      .filter((entry) => entry.text.startsWith('Session ended'));
    expect(ended.map((entry) => entry.text)).toEqual([
      'Session ended (exit code 3).',
    ]);
  });

  it('refuses a Conversation that is not a Terminal one', async () => {
    const { conversations, ticket } = setup();
    const ui = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });

    const error = await failure(
      conversations.endTerminal(ui.id, { exitCode: 0 }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect(conversations.get(ui.id).state).toBe('running');
  });

  it('can be closed once it has ended, and not before', async () => {
    const { conversations, ticket } = setup();
    const { conversationId } = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'start',
    });

    expect((await failure(conversations.close(conversationId))).message).toBe(
      terminalMessage,
    );
    await conversations.endTerminal(conversationId, { exitCode: 0 });
    await conversations.close(conversationId);

    expect(conversations.get(conversationId).hidden).toBe(true);
  });
});

describe('A Terminal Conversation and the limits', () => {
  it('holds no Start run slot, adds no Spend and records no Run outcome', async () => {
    const { conversations, tickets, project, ticket } = setup();
    const other = tickets.createTicket({ projectId: project.id, title: 'B' });
    const { conversationId } = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'start',
    });

    expect(holdsStartRunSlot(conversations.get(conversationId))).toBe(false);
    // The limit is 1 with Parallel runs off: a UI Start still fits.
    await conversations.start({
      startedBy: 'user',
      ticketNumber: other.number,
      intent: 'start',
      prompt: 'Go',
    });
    await conversations.endTerminal(conversationId, { exitCode: 0 });

    expect(conversations.latestRunOutcome(conversationId)).toBeNull();
    expect(conversations.runStats(project.id).map((s) => s.runs)).toEqual([]);
  });

  it('keeps its Ticket from being dispatched by Autopilot', async () => {
    const { conversations, tickets, changes, project } = setup({
      autopilot: true,
      spendCeilingUsd: 50,
    });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const ready = tickets.createTicket({
      projectId: project.id,
      title: 'Ready',
      labels: ['ready-for-agent'],
      cycleId: cycle.id,
    });
    tickets.startCycle(cycle.id);
    const autopilot = createAutopilot({ tickets, conversations, changes });
    await conversations.startTerminal({
      ticketNumber: ready.number,
      intent: 'start',
    });

    await autopilot.evaluate(project.id);

    expect(
      conversations
        .list({ ticketNumber: ready.number })
        .filter((c) => c.startedBy === 'autopilot'),
    ).toEqual([]);
  });
});

describe('Answering a Terminal Conversation', () => {
  it('refuses Reply and Stop with the terminal message', async () => {
    const { conversations, ticket } = setup();
    const { conversationId } = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'start',
    });

    const errors = await Promise.all([
      failure(conversations.reply(conversationId, 'Hi', 'user')),
      failure(conversations.stop(conversationId)),
    ]);

    for (const error of errors) {
      expect(error).toBeInstanceOf(NotAllowedError);
      expect(error.message).toBe(terminalMessage);
    }
    expect(conversations.get(conversationId).state).toBe('running');
  });

  it('is left alone when the server restarts', async () => {
    const { conversations, restart, ticket } = setup();
    const { conversationId } = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'start',
    });

    const fresh = restart();
    fresh.interruptStale();

    expect(fresh.get(conversationId).state).toBe('running');
  });
});

describe('Terminal Spec (T1240)', () => {
  it('opens Spec on an Intake idea and on an Epic without children, in the main checkout', async () => {
    const { conversations, tickets, project, ticket, repositoryDir } = setup({
      parallelRuns: true,
    });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Big',
      type: 'Epic',
    });

    const idea = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'spec',
    });
    const empty = await conversations.startTerminal({
      ticketNumber: epic.number,
      intent: 'spec',
    });

    expect(idea.cwd).toBe(repositoryDir);
    expect(idea.firstMessage).toBe(`/tandembike:spec T${ticket.number}`);
    expect(empty.firstMessage).toBe(`/tandembike:spec T${epic.number}`);
    expect(conversations.get(idea.conversationId)).toMatchObject({
      intent: 'spec',
      startedBy: 'terminal',
    });
  });

  it('refuses a Ticket that is not an Intake idea or a childless Epic', async () => {
    const { conversations, tickets, project, ticket } = setup();
    const spec = (ticketNumber: number) =>
      failure(conversations.startTerminal({ ticketNumber, intent: 'spec' }));
    const queued = tickets.createTicket({
      projectId: project.id,
      title: 'Queued',
      labels: ['ready-for-agent'],
    });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic.number,
    });
    tickets.updateTicket(ticket.number, { status: 'In progress' });

    for (const number of [ticket.number, queued.number, epic.number]) {
      const error = await spec(number);
      expect(error).toBeInstanceOf(NotAllowedError);
      expect(error.message).toBe(
        `T${number} is not an idea in Intake or an Epic without children, so it cannot be specced.`,
      );
    }
    expect(conversations.list({ ticketNumber: queued.number })).toHaveLength(0);
  });
});

describe('Terminal next (T1240)', () => {
  const nextSetup = () => {
    const world = setup();
    const cycle = world.tickets.createCycle({
      projectId: world.project.id,
      title: 'Beta',
    });
    const ready = (title: string) =>
      world.tickets.createTicket({
        projectId: world.project.id,
        title,
        labels: ['ready-for-agent'],
        cycleId: cycle.id,
      });
    return { ...world, cycle, ready };
  };

  it('starts the top Eligible item of the Active Cycle of the Project that holds the folder', async () => {
    const { conversations, tickets, cycle, ready, repositoryDir } = nextSetup();
    const first = ready('First');
    ready('Second');
    tickets.startCycle(cycle.id);

    const next = await conversations.startTerminalNext(repositoryDir);

    expect(next).toMatchObject({
      started: true,
      session: { firstMessage: `/tandembike:implement T${first.number}` },
    });
  });

  it('returns next_work’s reason when there is no work', async () => {
    const { conversations, tickets, cycle, repositoryDir } = nextSetup();
    expect(await conversations.startTerminalNext(repositoryDir)).toEqual({
      started: false,
      reason: 'no-active-cycle',
    });
    tickets.startCycle(cycle.id);
    expect(await conversations.startTerminalNext(repositoryDir)).toEqual({
      started: false,
      reason: 'nothing-ready',
    });
  });

  it('refuses a folder in no Project’s repository, naming the known Projects', async () => {
    const { conversations, tickets } = nextSetup();
    tickets.createProject({ name: 'Blog' });

    const error = await failure(conversations.startTerminalNext('/nowhere'));

    expect(error.message).toContain('/nowhere');
    expect(error.message).toContain('"Website"');
    expect(error.message).toContain('"Blog"');
  });
});

describe('Idle Terminal Conversations (T1239)', () => {
  const minute = 60 * 1000;

  async function started() {
    const world = setup();
    const { conversationId } = await world.conversations.startTerminal({
      ticketNumber: world.ticket.number,
      intent: 'start',
    });
    const activeAt = () =>
      world.conversations.get(conversationId).updatedAt.getTime();
    return { ...world, conversationId, activeAt };
  }

  it('a heartbeat refreshes its last activity', async () => {
    const { conversations, conversationId, activeAt } = await started();
    const before = activeAt();

    conversations.heartbeatTerminal(conversationId, new Date(before + minute));

    expect(activeAt()).toBe(before + minute);
  });

  it('ends only the ones idle for more than 5 minutes', async () => {
    const { conversations, conversationId, activeAt } = await started();
    const last = activeAt();

    expect(conversations.endIdleTerminals(new Date(last + 5 * minute))).toBe(0);
    expect(conversations.get(conversationId).state).toBe('running');

    expect(
      conversations.endIdleTerminals(new Date(last + 5 * minute + 1000)),
    ).toBe(1);
    expect(conversations.get(conversationId).state).toBe('stopped');
  });

  it('keeps one alive while heartbeats arrive', async () => {
    const { conversations, conversationId, activeAt } = await started();
    const last = activeAt();
    conversations.heartbeatTerminal(
      conversationId,
      new Date(last + 4 * minute),
    );

    conversations.endIdleTerminals(new Date(last + 8 * minute));

    expect(conversations.get(conversationId).state).toBe('running');
  });

  it('says in the transcript that it timed out, once', async () => {
    const { conversations, conversationId, activeAt } = await started();
    const later = new Date(activeAt() + 6 * minute);

    conversations.endIdleTerminals(later);
    conversations.endIdleTerminals(later);

    const entries = conversations
      .transcript(conversationId)
      .filter((entry) => entry.role === 'session');
    expect(entries.map((entry) => entry.text)).toEqual([
      'Session timed out (no activity for 5 minutes).',
    ]);
  });

  it('leaves other Conversations and ended ones alone', async () => {
    const { conversations, ticket, conversationId, activeAt } = await started();
    const ui = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'triage',
      prompt: 'Go',
    });
    await conversations.endTerminal(conversationId, { exitCode: 0 });

    const count = conversations.endIdleTerminals(
      new Date(activeAt() + 60 * minute),
    );

    expect(count).toBe(0);
    expect(conversations.get(ui.id).state).toBe('running');
  });
});
