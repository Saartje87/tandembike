import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { NotAllowedError } from '../tickets/errors';

function setup(runMode: 'default' | 'auto' = 'auto') {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    runMode,
    defaultAgentKind: 'copilot',
  });
  const ticket = world.tickets.createTicket({
    projectId: project.id,
    title: 'Add a coupon field',
  });
  const copilot = world.runners.copilot;
  const ask = () =>
    world.conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'ask',
      prompt: 'What is left?',
    });
  return { ...world, project, ticket, copilot, ask };
}

const fallbackNote =
  'Copilot cannot run in auto mode, so this run runs in default mode: it asks before each tool call the repository has not allowed.';

describe("A runner's capabilities (ADR 0051)", () => {
  it('runs in the Project run mode when its runner supports it, with no note', async () => {
    const world = setup('auto');

    const conversation = await world.ask();

    expect(world.copilot.runs[0].options.runMode).toBe('auto');
    expect(
      world.conversations
        .transcript(conversation.id)
        .filter(({ role }) => role === 'session'),
    ).toEqual([]);
  });

  it('runs in default when its runner lacks the run mode, and says so once in the Conversation', async () => {
    const world = setup('auto');
    world.copilot.capabilities = {
      ...world.copilot.capabilities,
      runModes: ['default'],
    };

    const conversation = await world.ask();
    const first = world.copilot.runs[0];
    first.emit({ type: 'session', sessionId: 's1' });
    first.emit({ type: 'exit' });
    await world.conversations.reply(conversation.id, 'Go on', 'user');

    expect(first.options.runMode).toBe('default');
    expect(world.copilot.runs[1].options.runMode).toBe('default');
    expect(
      world.conversations
        .transcript(conversation.id)
        .filter(({ role }) => role === 'session')
        .map(({ text }) => text),
    ).toEqual([fallbackNote]);
  });

  it('offers Always allow for its permission requests only when its runner can honour it', async () => {
    const world = setup('default');
    world.copilot.capabilities = {
      ...world.copilot.capabilities,
      allowAlways: false,
    };
    const conversation = await world.ask();

    void world.copilot.runs[0].options.askPermission({
      toolName: 'shell',
      input: { command: 'npm test' },
      rules: ['shell(npm test)'],
    });
    const request = world.conversations
      .transcript(conversation.id)
      .find(({ role }) => role === 'permission');

    expect(request?.permissionRules).toBeNull();
    await expect(
      world.conversations.answerPermission(request?.id ?? 0, 'allow-always'),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });

  it('keeps Always allow, with its proposed rules, on a runner that honours it', async () => {
    const world = setup('default');
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'claude-code',
    });
    const conversation = await world.ask();

    const answer = world.runner.runs[0].options.askPermission({
      toolName: 'Bash',
      input: { command: 'npm test' },
      rules: ['Bash(npm test:*)'],
    });
    const request = world.conversations
      .transcript(conversation.id)
      .find(({ role }) => role === 'permission');
    await world.conversations.answerPermission(
      request?.id ?? 0,
      'allow-always',
    );

    expect(request?.permissionRules).toEqual(['Bash(npm test:*)']);
    await expect(answer).resolves.toBe('allow-always');
  });
});
