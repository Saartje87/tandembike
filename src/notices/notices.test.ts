// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createAutopilot } from '../autopilot/autopilot';
import { createTestConversations } from '../test/conversations';
import { type Change, createChangeChannel } from '../tickets/changes';
import { createNotices } from './notices';

const request = {
  toolName: 'Bash',
  input: { command: 'npm test' },
  rules: [] as string[],
};

function setup() {
  const changes = createChangeChannel();
  const world = createTestConversations(changes);
  const { tickets, conversations } = world;
  const project = tickets.createProject({ name: 'Website' });
  tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
    maxConcurrentRuns: 5,
  });
  const notices = createNotices({ conversations, changes });
  const raised = vi.fn();
  changes.subscribe((change) => {
    if (change.type === 'notice') {
      raised(change.notice);
    }
  });
  const startRun = async (
    title = 'Fix the footer',
    intent: 'start' | 'merge' | 'triage' = 'start',
  ) => {
    const ticket = tickets.createTicket({ projectId: project.id, title });
    tickets.updateTicket(ticket.number, { status: 'In progress' });
    const conversation = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent,
      prompt: 'Go',
    });
    return {
      ticket,
      conversation,
      run: world.runner.runs[world.runner.runs.length - 1],
    };
  };
  return { ...world, changes, project, notices, raised, startRun };
}

describe('Notices', () => {
  it('raises waiting once for a pending permission, with its title, body and path', async () => {
    const world = setup();
    const { run, conversation, ticket } = await world.startRun();
    world.notices.start();

    void run.options.askPermission(request);

    expect(world.raised).toHaveBeenCalledTimes(1);
    const entry = world.conversations.transcript(conversation.id).at(-1);
    expect(world.raised).toHaveBeenCalledWith({
      kind: 'waiting',
      key: `waiting:${conversation.id}:${entry?.id}`,
      projectId: world.project.id,
      ticketNumber: ticket.number,
      conversationId: conversation.id,
      title: `T${ticket.number} is waiting for you`,
      body: 'Fix the footer: Bash {"command":"npm test"}',
      path: `/project/${world.project.id}?conversation=${conversation.id}`,
    });

    // Persisting through further changes raises nothing again.
    run.emit({ type: 'agent', text: 'Still here' });
    world.changes.publish({ type: 'conversation', id: conversation.id });
    expect(world.raised).toHaveBeenCalledTimes(1);
  });

  it('raises again for a new pending entry', async () => {
    const world = setup();
    const { run, conversation } = await world.startRun();
    world.notices.start();

    const first = run.options.askPermission(request);
    const entry = world.conversations.transcript(conversation.id).at(-1);
    await world.conversations.answerPermission(entry?.id ?? 0, 'allow');
    await first;
    void run.options.askPermission(request);

    expect(world.raised).toHaveBeenCalledTimes(2);
    const keys = world.raised.mock.calls.map(([notice]) => notice.key);
    expect(new Set(keys).size).toBe(2);
  });

  it('raises waiting for a question of the Agent', async () => {
    const world = setup();
    const { run } = await world.startRun();
    world.notices.start();

    void run.options.askQuestion([
      {
        question: 'Which colour?',
        header: 'Colour',
        options: [{ label: 'Red', description: 'Red' }],
        multiSelect: false,
      },
    ]);

    expect(world.raised).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'waiting',
        body: 'Fix the footer: Which colour?',
      }),
    );
  });

  it('raises nothing for what already waits when the server starts', async () => {
    const world = setup();
    const { run } = await world.startRun();
    void run.options.askPermission(request);

    world.notices.start();
    world.changes.publish({ type: 'project', id: world.project.id });

    expect(world.raised).not.toHaveBeenCalled();
  });

  it('raises needs_reply once when a Start run ends needing a reply', async () => {
    const world = setup();
    const { run, conversation, ticket } = await world.startRun();
    world.notices.start();

    run.emit({ type: 'turn', costUsd: 0.1 });
    run.emit({ type: 'agent', text: 'late' });
    world.changes.publish({ type: 'conversation', id: conversation.id });

    expect(world.raised).toHaveBeenCalledTimes(1);
    const outcome = world.conversations.latestRunOutcome(conversation.id);
    expect(world.raised).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'needs_reply',
        key: `needs_reply:${conversation.id}:${outcome?.id}`,
        title: `T${ticket.number} needs a reply`,
        body: 'Fix the footer',
        path: `/project/${world.project.id}?conversation=${conversation.id}`,
      }),
    );
  });

  it('raises needs_reply for a substantive failure with its error', async () => {
    const world = setup();
    const { run, ticket } = await world.startRun();
    world.notices.start();

    run.emit({ type: 'turn', costUsd: 0, error: 'Hit the max turns' });
    expect(world.raised).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'needs_reply',
        title: `T${ticket.number} failed`,
        body: 'Fix the footer: Hit the max turns',
      }),
    );
  });

  it('raises nothing for a transient failure, which Autopilot resumes', async () => {
    const world = setup();
    const { run } = await world.startRun();
    world.notices.start();

    run.emit({ type: 'turn', costUsd: 0, error: 'API Error: 529 overloaded' });

    expect(world.raised).not.toHaveBeenCalled();
  });

  it('raises needs_reply for a Merge run but not for a Triage run or a stop', async () => {
    const world = setup();
    const merge = await world.startRun('Merge it', 'merge');
    const triage = await world.startRun('Triage it', 'triage');
    const stopped = await world.startRun('Stop it');
    world.notices.start();

    triage.run.emit({ type: 'turn', costUsd: 0 });
    await world.conversations.stop(stopped.conversation.id);
    expect(world.raised).not.toHaveBeenCalled();

    merge.run.emit({ type: 'turn', costUsd: 0 });
    expect(world.raised).toHaveBeenCalledTimes(1);
  });

  it('raises needs_reply again for a later run end', async () => {
    const world = setup();
    const { run, conversation } = await world.startRun();
    world.notices.start();

    run.emit({ type: 'turn', costUsd: 0 });
    await world.conversations.reply(conversation.id, 'More', 'user');
    world.runner.runs[0].emit({ type: 'turn', costUsd: 0 });

    expect(world.raised).toHaveBeenCalledTimes(2);
  });

  it('raises nothing for a closed Conversation', async () => {
    const world = setup();
    const { run, conversation } = await world.startRun();
    world.notices.start();

    await world.conversations.close(conversation.id);
    run.emit({ type: 'turn', costUsd: 0 });

    expect(world.raised).not.toHaveBeenCalled();
  });

  it('stops raising after the returned function is called', async () => {
    const world = setup();
    const { run } = await world.startRun();
    const stop = world.notices.start();

    stop();
    void run.options.askPermission(request);

    expect(world.raised).not.toHaveBeenCalled();
  });
});

describe('Autopilot and notices', () => {
  it('ignores notice changes', async () => {
    const changes = createChangeChannel();
    const world = createTestConversations(changes);
    const getProject = vi.spyOn(world.tickets, 'getProject');
    const failed = vi.spyOn(console, 'error').mockImplementation(() => {});
    const autopilot = createAutopilot({
      tickets: world.tickets,
      conversations: world.conversations,
      changes,
    });
    autopilot.start();
    await autopilot.idle();
    getProject.mockClear();

    const notice: Change = {
      type: 'notice',
      notice: {
        kind: 'waiting',
        key: 'waiting:1:1',
        projectId: 999,
        ticketNumber: null,
        conversationId: 1,
        title: 't',
        body: 'b',
        path: '/',
      },
    };
    changes.publish(notice);
    await autopilot.idle();

    expect(getProject).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });
});
