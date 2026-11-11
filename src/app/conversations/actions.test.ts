import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appAutopilot } from '../../autopilot/app-autopilot';
import { createAutopilot } from '../../autopilot/autopilot';
import { appConversations } from '../../conversations/app-conversations';
import { activity, liveConversation } from '../../test/conversation-activity';
import { createTestConversations } from '../../test/conversations';
import { createTestSettings } from '../../test/settings';
import { createChangeChannel } from '../../tickets/changes';
import {
  answerConversationPermission,
  approveMerge,
  closeConversation,
  currentConversationActivity,
  listOpenConversations,
  loadAgentChoices,
  loadConversation,
  removeConversationWorktree,
  reopenConversation,
  replyToConversation,
  startBatchTriage,
  startConversation,
  startPlan,
  startRetro,
  startSetup,
  stopConversation,
} from './actions';

vi.mock('../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../../autopilot/app-autopilot', () => ({ appAutopilot: vi.fn() }));
vi.mock('../../settings/app-settings', () => ({
  appSettings: () => createTestSettings(),
}));

function setup(withRepository = true) {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  if (withRepository) {
    world.tickets.setProjectAgentSettings(project.id, {
      repositoryPath: world.repositoryDir,
    });
  }
  vi.mocked(appConversations).mockReturnValue(world.conversations);
  vi.mocked(appAutopilot).mockReturnValue(
    createAutopilot({
      tickets: world.tickets,
      conversations: world.conversations,
      changes: createChangeChannel(),
    }),
  );
  return { ...world, project };
}

describe('Conversation actions', () => {
  beforeEach(() => {
    vi.mocked(appConversations).mockReset();
  });

  it('start a Conversation on a Project', async () => {
    const { project, runner } = setup();

    const result = await startConversation({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    expect(result).toMatchObject({
      ok: true,
      conversation: { projectId: project.id, state: 'running' },
    });
    expect(runner.runs).toHaveLength(1);
  });

  it('approve a merge for a Ticket in Review, and refuse one that is not', async () => {
    const { project, tickets, runner } = setup();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Handed off',
    });

    const refused = await approveMerge({ number: ticket.number });
    tickets.updateTicket(ticket.number, { status: 'In progress' });
    tickets.addExternalReferences(ticket.number, [
      'https://github.com/acme/site/pull/12',
    ]);
    const approved = await approveMerge({ number: ticket.number });

    expect(refused).toMatchObject({ ok: false, error: expect.any(String) });
    expect(approved).toMatchObject({
      ok: true,
      conversation: { intent: 'merge', startedBy: 'user' },
    });
    expect(runner.runs).toHaveLength(1);
  });

  it('refuse a start when the Project has no repository path', async () => {
    const { project, runner } = setup(false);

    const result = await startConversation({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { repositoryPath: expect.any(String) },
    });
    expect(runner.runs).toHaveLength(0);
  });

  it('start a Setup on a Project, and return the running one the second time', async () => {
    const { project, runner } = setup();

    const first = await startSetup({ projectId: project.id });
    const second = await startSetup({ projectId: project.id });

    expect(first).toMatchObject({
      ok: true,
      conversation: { intent: 'setup', ticketNumber: null },
    });
    expect(second).toMatchObject({
      ok: true,
      conversation: { id: first.ok ? first.conversation.id : 0 },
    });
    expect(runner.runs).toHaveLength(1);
  });

  it('refuse a Setup when the Project has no repository path', async () => {
    const { project } = setup(false);

    expect(await startSetup({ projectId: project.id })).toMatchObject({
      ok: false,
    });
  });

  it('start a Retro on a Cycle, and refuse a second one', async () => {
    const { project, tickets, runner } = setup();
    const cycle = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });

    const first = await startRetro({ cycleId: cycle.id });
    const second = await startRetro({ cycleId: cycle.id });

    expect(first).toMatchObject({
      ok: true,
      conversation: { intent: 'retro', retroCycleId: cycle.id },
    });
    expect(second).toMatchObject({ ok: false });
    expect(runner.runs).toHaveLength(1);
  });

  it("startBatchTriage starts a Batch triage of the Board's Batch-triage Tickets, then opens the open one (T1318)", async () => {
    const { project, runner, tickets } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const a = tickets.createTicket({
      projectId: project.id,
      title: 'A',
      cycleId: cycle.id,
    });
    tickets.createTicket({ projectId: project.id, title: 'In the Backlog' });

    const started = await startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
    });
    const again = await startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
    });

    expect(started).toMatchObject({
      ok: true,
      conversation: {
        intent: 'batch_triage',
        batchTriageCycleId: cycle.id,
        batchTriageTickets: [a.number],
      },
    });
    expect(again.ok && started.ok && again.conversation.id).toBe(
      started.ok && started.conversation.id,
    );
    expect(runner.runs).toHaveLength(1);
  });

  it('startBatchTriage refuses a Board with nothing to triage (T1318)', async () => {
    const { project, runner } = setup();

    const result = await startBatchTriage({
      projectId: project.id,
      cycleId: null,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'This Board has nothing to triage.',
    });
    expect(runner.runs).toHaveLength(0);
  });

  it('startPlan starts a Plan on the goal, and refuses a blank one (T1248)', async () => {
    const { project, runner } = setup();

    const blank = await startPlan({ projectId: project.id, goal: ' ' });
    const started = await startPlan({ projectId: project.id, goal: 'Ship' });

    expect(blank).toMatchObject({
      ok: false,
      fieldErrors: { goal: expect.any(String) },
    });
    expect(started).toMatchObject({
      ok: true,
      conversation: { intent: 'plan', startedBy: 'user' },
    });
    expect(runner.runs[0].firstMessage).toBe('/tandembike:plan Ship');
  });

  it('send a reply and stop the run', async () => {
    const { project, runner } = setup();
    const started = await startConversation({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    if (!started.ok) {
      throw new Error('start failed');
    }
    const conversationId = started.conversation.id;

    const replied = await replyToConversation({ conversationId, text: 'More' });
    const stopped = await stopConversation({ conversationId });

    expect(replied).toMatchObject({ ok: true });
    expect(runner.runs[0].sent).toEqual(['More']);
    expect(stopped).toMatchObject({
      ok: true,
      conversation: { state: 'stopped' },
    });
  });

  it('answer a permission request with Always allow and let the run go on', async () => {
    const { project, runner, conversations } = setup();
    const started = await startConversation({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    if (!started.ok) {
      throw new Error('start failed');
    }
    const pending = runner.runs[0].options.askPermission({
      toolName: 'Bash',
      input: {},
      rules: ['Bash(ls:*)'],
    });
    const entry = conversations.transcript(started.conversation.id).at(-1);

    const result = await answerConversationPermission({
      entryId: entry?.id ?? 0,
      answer: 'allow-always',
    });

    expect(result).toMatchObject({ ok: true });
    expect(await pending).toBe('allow-always');
    expect(
      await answerConversationPermission({
        entryId: entry?.id ?? 0,
        answer: 'allow',
      }),
    ).toMatchObject({ ok: false });
  });

  it('return a refusal as an error', async () => {
    setup();

    expect(
      await replyToConversation({ conversationId: 999, text: 'Hi' }),
    ).toEqual({
      ok: false,
      error: 'There is no Conversation with id 999.',
    });
  });

  it('start a New Ticket Conversation with the title field defaults', async () => {
    const { project, runner } = setup();

    const result = await startConversation({
      projectId: project.id,
      intent: 'new_ticket',
      prompt: 'Add a coupon field',
      defaults: { type: 'Epic' },
    });

    expect(result).toMatchObject({ ok: true });
    expect(runner.runs[0].options.systemPrompt).toContain('type Epic');
  });

  it('close a Conversation, stopping its run', async () => {
    const { project, runner } = setup();
    const started = await startConversation({
      projectId: project.id,
      intent: 'new_ticket',
      prompt: 'Hi',
    });
    if (!started.ok) {
      throw new Error('Expected a start.');
    }

    const result = await closeConversation({
      conversationId: started.conversation.id,
    });

    expect(result).toMatchObject({
      ok: true,
      conversation: { state: 'stopped', hidden: true },
    });
    expect(runner.runs[0].interrupted).toBe(true);
  });

  it('refuses to remove a worktree that still holds changes, naming the state', async () => {
    const { project, tickets, worktrees } = setup();
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });
    const started = await startConversation({
      projectId: project.id,
      intent: 'start',
      prompt: 'Go',
    });
    if (!started.ok) {
      throw new Error('Expected a start.');
    }
    const path = started.conversation.worktreePath as string;
    worktrees.states.set(path, 'dirty');

    const refused = await removeConversationWorktree({
      conversationId: started.conversation.id,
    });
    worktrees.states.set(path, 'clean');
    const removed = await removeConversationWorktree({
      conversationId: started.conversation.id,
    });

    expect(refused).toMatchObject({ ok: false });
    expect(refused.ok === false && refused.error).toContain('uncommitted');
    expect(removed).toMatchObject({
      ok: true,
      conversation: { worktreeRemoved: true },
    });
  });

  it('reopen a closed Conversation and list the open ones with a transcript to show', async () => {
    const { project } = setup();
    const started = await startConversation({
      projectId: project.id,
      intent: 'new_ticket',
      prompt: 'Hi',
    });
    if (!started.ok) {
      throw new Error('Expected a start.');
    }
    const conversationId = started.conversation.id;
    await closeConversation({ conversationId });
    expect(await listOpenConversations()).toEqual([]);

    const reopened = await reopenConversation({ conversationId });

    expect(reopened).toMatchObject({
      ok: true,
      conversation: { hidden: false },
    });
    expect(await listOpenConversations()).toMatchObject([
      { conversation: { id: conversationId }, projectName: 'Website' },
    ]);
    expect(await loadConversation({ conversationId })).toMatchObject({
      ok: true,
      conversation: { id: conversationId },
      transcript: [{ role: 'user', text: 'Hi' }],
    });
    expect(await loadConversation({ conversationId: 999 })).toMatchObject({
      ok: false,
    });
  });

  it('load a Conversation with its Footprint, not measured until a run reports tokens (T1176)', async () => {
    const { project, runner } = setup();
    const started = await startConversation({
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    if (!started.ok) throw new Error(started.error);
    const conversationId = started.conversation.id;
    expect(await loadConversation({ conversationId })).toMatchObject({
      footprint: { measured: false },
    });

    runner.runs[0].emit({
      type: 'turn',
      cost: 0.1,
      usage: {
        'claude-opus-5-5': {
          input: 0,
          output: 1_000_000,
          cacheWrite: 0,
          cacheRead: 0,
        },
      },
    });

    // The ADR 0050 defaults: 1,000 Wh per 1M Opus output tokens, 475 g/kWh.
    expect(await loadConversation({ conversationId })).toMatchObject({
      footprint: { measured: true, energyWh: 1000, co2eG: 475 },
    });
  });

  it('report which Tickets have running or waiting Conversations', async () => {
    const { project, tickets, runner } = setup();
    const running = tickets.createTicket({
      projectId: project.id,
      title: 'Running',
    });
    const asking = tickets.createTicket({
      projectId: project.id,
      title: 'Asking',
    });
    await startConversation({
      ticketNumber: running.number,
      intent: 'start',
      prompt: 'Go',
    });
    await startConversation({
      ticketNumber: asking.number,
      intent: 'ask',
      prompt: 'Go',
    });
    runner.runs[1]?.emit({ type: 'turn', cost: 0.1 });

    expect(await currentConversationActivity()).toEqual(
      activity({
        live: {
          [running.number]: liveConversation({
            conversationId: expect.any(Number),
            line: 'Starting',
            since: expect.any(String),
          }),
          // Its turn ended: idle, waiting on the User's reply (T1113).
          [asking.number]: liveConversation({
            conversationId: expect.any(Number),
            state: 'idle',
            // No message yet, and no tool call while not running (T1262).
            line: '',
            since: expect.any(String),
            cost: 0.1,
          }),
        },
        cost: { [asking.number]: 0.1 },
        running: [running.number],
        waiting: [asking.number],
        waitingCount: 1,
        waitingByProject: { [project.id]: 1 },
      }),
    );
  });
});

describe('the agent picker (T1368)', () => {
  beforeEach(() => {
    vi.mocked(appConversations).mockReset();
  });

  it('starts a Conversation, a Plan on the kind the User picked', async () => {
    const world = setup();
    const ticket = world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Work',
    });

    const started = await startConversation({
      ticketNumber: ticket.number,
      intent: 'start',
      stage: { stage: 'start' },
      agentKind: 'copilot',
    });
    const plan = await startPlan({
      projectId: world.project.id,
      goal: 'Ship it',
      agentKind: 'copilot',
    });

    expect(started).toMatchObject({
      ok: true,
      conversation: { agentKind: 'copilot' },
    });
    expect(plan).toMatchObject({
      ok: true,
      conversation: { agentKind: 'copilot' },
    });
  });

  it('refuses a kind that is not one', async () => {
    const world = setup();

    expect(
      await startConversation({
        projectId: world.project.id,
        intent: 'ask',
        prompt: 'Hi',
        agentKind: 'gemini' as never,
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { agentKind: expect.any(String) },
    });
  });

  it("loads the kinds that can be picked, with the Project's default, by Project or Ticket", async () => {
    const world = setup();
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
    });
    world.runners.copilot.availability = () => ({
      available: false,
      reason: 'Copilot is not signed in.',
    });
    const ticket = world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Work',
    });

    const expected = {
      ok: true,
      choices: {
        defaultKind: 'copilot',
        kinds: [
          { kind: 'claude-code', label: 'Claude Code', available: true },
          {
            kind: 'copilot',
            label: 'Copilot',
            available: false,
            reason: 'Copilot is not signed in.',
          },
        ],
      },
    };
    expect(await loadAgentChoices({ projectId: world.project.id })).toEqual(
      expected,
    );
    expect(await loadAgentChoices({ ticketNumber: ticket.number })).toEqual(
      expected,
    );
  });

  it('offers no picker while one Agent kind is registered', async () => {
    const world = createTestConversations(undefined, {
      kinds: ['claude-code'],
    });
    const project = world.tickets.createProject({ name: 'Website' });
    vi.mocked(appConversations).mockReturnValue(world.conversations);

    expect(await loadAgentChoices({ projectId: project.id })).toEqual({
      ok: true,
      choices: null,
    });
  });
});
