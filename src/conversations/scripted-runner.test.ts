import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { openDatabase } from '../db/connection';
import { createTickets } from '../tickets/tickets';
import { createConversations } from './conversations';
import {
  createScriptedRunner,
  createScriptedWorktrees,
} from './scripted-runner';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Lets the scripted run's deferred events land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function setup() {
  const db = openDatabase(':memory:');
  const tickets = createTickets(db, 'user');
  const conversations = createConversations({
    db,
    tickets,
    runners: { 'claude-code': createScriptedRunner() },
    worktrees: createScriptedWorktrees(),
    mcpUrl: 'http://localhost:3100/api/mcp',
  });
  const project = tickets.createProject({ name: 'Website' });
  tickets.setProjectAgentSettings(project.id, {
    // Any directory: the scripted worktrees never run git in it.
    repositoryPath: mkdtempSync(join(tmpdir(), 'tandembike-scripted-')),
    parallelRuns: true,
  });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the footer',
  });
  return { conversations, project, ticket };
}

async function startRunning() {
  const world = setup();
  const conversation = await world.conversations.start({
    startedBy: 'user',
    ticketNumber: world.ticket.number,
    intent: 'start',
    prompt: `/tandembike:implement T${world.ticket.number}`,
  });
  await settle();
  return { ...world, conversation };
}

describe('The scripted runner (fake runs on a throwaway server)', () => {
  it('starts through the normal start path and keeps the Conversation running', async () => {
    const { conversations, conversation } = await startRunning();

    expect(conversations.get(conversation.id).state).toBe('running');
    expect(conversations.get(conversation.id).worktreePath).not.toBeNull();
    expect(conversations.transcript(conversation.id)).toContainEqual(
      expect.objectContaining({ role: 'agent' }),
    );
  });

  it('waits for the User on a permission request when a reply says fake:permission, and runs again once answered', async () => {
    const { conversations, conversation } = await startRunning();

    await conversations.reply(conversation.id, 'fake:permission', 'user');
    await settle();

    expect(conversations.get(conversation.id).state).toBe('waiting');
    const request = conversations
      .transcript(conversation.id)
      .find((entry) => entry.role === 'permission');
    expect(request).toBeDefined();

    await conversations.answerPermission(request?.id as number, 'allow');
    await settle();

    expect(conversations.get(conversation.id).state).toBe('running');
  });

  it('waits for the User on a Widget when a reply says fake:widget', async () => {
    const { conversations, conversation } = await startRunning();

    await conversations.reply(conversation.id, 'fake:widget', 'user');
    await settle();

    expect(conversations.get(conversation.id).state).toBe('waiting');
    expect(conversations.transcript(conversation.id)).toContainEqual(
      expect.objectContaining({ role: 'widget' }),
    );
  });

  it('records five tool calls a second apart and keeps running when a reply says fake:tool', async () => {
    const { conversations, conversation } = await startRunning();
    const steps = () =>
      conversations
        .transcript(conversation.id)
        .filter((entry) => entry.role === 'tool');

    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    await conversations.reply(conversation.id, 'fake:tool', 'user');
    await vi.advanceTimersByTimeAsync(10);
    expect(steps()).toHaveLength(1);
    expect(steps()[0]).toMatchObject({
      toolName: 'Bash',
      toolInput: { command: 'echo fake', description: 'Fake step 1' },
    });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(steps().map((step) => step.toolInput?.description)).toEqual([
      'Fake step 1',
      'Fake step 2',
      'Fake step 3',
      'Fake step 4',
      'Fake step 5',
    ]);
    expect(conversations.get(conversation.id).state).toBe('running');
  });

  it('ends its turn when a reply says fake:idle', async () => {
    const { conversations, conversation } = await startRunning();

    await conversations.reply(conversation.id, 'fake:idle', 'user');
    await settle();

    expect(conversations.get(conversation.id).state).toBe('idle');
  });

  it('takes the directive in the first message too, as an Ask', async () => {
    const { conversations, project } = setup();

    const conversation = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Check the tab marker. fake:permission',
    });
    await settle();

    expect(conversations.get(conversation.id).state).toBe('waiting');
  });

  it('ends the run when a reply says fake:exit, and a later reply resumes it', async () => {
    const { conversations, conversation } = await startRunning();

    await conversations.reply(conversation.id, 'fake:exit', 'user');
    await settle();
    expect(conversations.get(conversation.id).state).not.toBe('running');

    await conversations.reply(conversation.id, 'go on', 'user');
    await settle();
    expect(conversations.get(conversation.id).state).toBe('running');
  });
});

describe('The scripted worktrees', () => {
  it('keep a made worktree after a restart, as a fresh module, until it is removed', async () => {
    const made = await createScriptedWorktrees().create({
      repositoryPath: '/tmp',
      projectId: 1,
      conversationId: 7,
    });
    const afterRestart = createScriptedWorktrees();

    expect(await afterRestart.state(made.path)).toBe('clean');
    await afterRestart.remove('/tmp', made.path);
    expect(await afterRestart.state(made.path)).toBe('missing');
    expect(await afterRestart.state('/elsewhere/c7')).toBe('missing');
  });
});
