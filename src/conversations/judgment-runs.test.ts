import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { connectMcpClient } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { NotAllowedError } from '../tickets/errors';
import { claudeDisallowedTools } from './claude-tool-policy';
import { judgmentIntents } from './conversation-state';
import { copilotToolFilters } from './copilot-tool-policy';

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: false,
  });
  const cycle = world.tickets.createCycle({
    projectId: project.id,
    title: 'Ship it',
  });
  world.tickets.startCycle(cycle.id);
  return { ...world, project, cycle };
}

describe.each(judgmentIntents)('A %s run (ADR 0054)', (intent) => {
  const startJudgment = (world: ReturnType<typeof setup>) =>
    world.conversations.start({
      startedBy: 'autopilot',
      projectId: world.project.id,
      intent,
      cycleId: world.cycle.id,
      prompt: 'Judge it',
    });

  it('is started only by Autopilot', async () => {
    const world = setup();

    await expect(
      world.conversations.start({
        startedBy: 'user',
        projectId: world.project.id,
        intent,
        prompt: 'Judge it',
      }),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });

  it('runs in the main checkout under the judgment tool policy, on every run', async () => {
    const world = setup();
    const conversation = await startJudgment(world);
    world.runner.runs[0].emit({ type: 'session', sessionId: 's' });
    world.runner.runs[0].emit({ type: 'exit' });

    await world.conversations.reply(conversation.id, 'Go on', 'user');

    expect(conversation.worktreePath).toBeNull();
    for (const run of world.runner.runs) {
      expect(run.options.cwd).toBe(world.repositoryDir);
      expect(run.options.toolPolicy).toBe('judgment');
    }
  });

  it('holds a Machine slot but no Start run slot, so a Start can still start', async () => {
    const world = setup();
    await startJudgment(world);
    const ticket = world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Build it',
    });

    await world.conversations.start({
      startedBy: 'autopilot',
      ticketNumber: ticket.number,
      intent: 'start',
      cycleId: world.cycle.id,
      prompt: 'Go',
    });

    const capacity = world.conversations.capacity(world.project.id);
    expect(capacity.machine.slotsHeld).toBe(2);
    expect(capacity.project.slotsHeld).toBe(1);
  });

  it("counts its cost against the Active Cycle's Spend ceiling and the Machine ceiling", async () => {
    const world = setup();
    await startJudgment(world);

    world.runner.runs[0].emit({ type: 'turn', cost: 0.4 });

    expect(
      world.conversations.autopilotSpend({
        projectId: world.project.id,
        cycleId: world.cycle.id,
      }),
    ).toBeCloseTo(0.4);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(world.conversations.autopilotSpendToday(midnight)).toBeCloseTo(0.4);
  });
});

describe('The judgment tool policy (ADR 0054)', () => {
  it('disallows on Claude Code file edits, the shell, every Widget and every Tandembike tool that writes', async () => {
    const client = await connectMcpClient(createTestTickets());
    const { tools } = await client.listTools();
    await client.close();
    const disallowed = claudeDisallowedTools('judgment');

    expect(disallowed).toEqual(
      expect.arrayContaining([
        'Edit',
        'Write',
        'NotebookEdit',
        'Bash',
        'AskUserQuestion',
        'mcp__widgets__ask_choice',
      ]),
    );
    expect(disallowed).not.toContain('Read');
    for (const tool of tools) {
      const name = `mcp__tandembike__${tool.name}`;
      expect(disallowed.includes(name), name).toBe(
        tool.annotations?.readOnlyHint !== true &&
          !['add_overlap_blocker', 'reply_to_question'].includes(tool.name),
      );
    }
  });

  it('keeps on Copilot only reading and the MCP tools, excluding every Tandembike tool that writes', async () => {
    const client = await connectMcpClient(createTestTickets());
    const { tools } = await client.listTools();
    await client.close();
    const { availableTools = [], excludedTools = [] } =
      copilotToolFilters('judgment');

    expect(availableTools).toEqual([
      'builtin:view',
      'builtin:grep',
      'builtin:glob',
      'mcp:*',
    ]);
    for (const tool of tools) {
      const name = `mcp:tandembike-${tool.name}`;
      expect(excludedTools.includes(name), name).toBe(
        tool.annotations?.readOnlyHint !== true &&
          !['add_overlap_blocker', 'reply_to_question'].includes(tool.name),
      );
    }
  });
});
