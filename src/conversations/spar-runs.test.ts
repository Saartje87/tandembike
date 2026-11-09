// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { connectMcpClient } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { NotAllowedError } from '../tickets/errors';
import { sparDisallowedTools } from './conversations';

function setup(runMode: 'default' | 'auto' = 'auto') {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    runMode,
    parallelRuns: true,
  });
  return { ...world, project };
}

const sparOn = (world: ReturnType<typeof setup>) =>
  world.conversations.start({
    startedBy: 'user',
    projectId: world.project.id,
    intent: 'spar',
    prompt: '/tandembike:spar',
  });

describe('A Spar run (ADR 0046)', () => {
  it('runs in permission mode default whatever the Project run mode, with file edits and Ticket changes disallowed', async () => {
    const world = setup('auto');

    await sparOn(world);

    const { options } = world.runner.runs[0];
    expect(options.runMode).toBe('default');
    expect(options.disallowedTools).toEqual(
      expect.arrayContaining([
        'Edit',
        'Write',
        'NotebookEdit',
        'mcp__tandembike__file_tickets',
        'mcp__tandembike__update_ticket',
      ]),
    );
    expect(options.disallowedTools).not.toContain('Read');
    expect(options.systemPrompt).toContain('read-only');
  });

  it('keeps the rules on a resumed run', async () => {
    const world = setup('auto');
    const conversation = await sparOn(world);
    world.runner.runs[0].emit({ type: 'session', sessionId: 's' });
    world.runner.runs[0].emit({ type: 'exit' });

    await world.conversations.reply(conversation.id, 'Go on', 'user');

    expect(world.runner.runs[1].options).toMatchObject({
      runMode: 'default',
      disallowedTools: sparDisallowedTools,
    });
  });

  it('disallows every Tandembike tool that is not read-only', async () => {
    const client = await connectMcpClient(createTestTickets());
    const { tools } = await client.listTools();
    await client.close();

    for (const tool of tools) {
      const name = `mcp__tandembike__${tool.name}`;
      expect(sparDisallowedTools.includes(name), name).toBe(
        tool.annotations?.readOnlyHint !== true,
      );
    }
  });

  it('runs in the main checkout, holds no Start run slot and is never limited', async () => {
    const world = setup();
    world.tickets.setProjectAgentSettings(world.project.id, {
      parallelRuns: false,
    });
    await world.conversations.start({
      startedBy: 'user',
      projectId: world.project.id,
      intent: 'start',
      prompt: 'Go',
    });

    const conversation = await sparOn(world);

    expect(conversation.worktreePath).toBeNull();
    expect(world.runner.runs[1].options.cwd).toBe(world.repositoryDir);
    expect(world.conversations.machineSlotsInUse()).toBe(1);
  });

  it('is started only by the User', async () => {
    const world = setup();

    await expect(
      world.conversations.start({
        startedBy: 'autopilot',
        projectId: world.project.id,
        intent: 'spar',
        prompt: 'Go',
      }),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });
});
