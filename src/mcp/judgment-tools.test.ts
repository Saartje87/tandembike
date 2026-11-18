import { describe, expect, it } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import type { JudgmentRun, JudgmentTools } from './judgment-tools';

function setup() {
  const tickets = createTestTickets(undefined, 'agent');
  const project = tickets.createProject({ name: 'Website' });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Ship' });
  const [first, second] = ['First', 'Second'].map((title) =>
    tickets.createTicket({
      projectId: project.id,
      title,
      labels: ['ready-for-agent'],
    }),
  );
  for (const ticket of [first, second]) {
    tickets.planTicket({ cycleId: cycle.id, number: ticket.number });
  }
  tickets.startCycle(cycle.id);
  const runs = new Map<number, JudgmentRun>([
    [
      7,
      {
        conversationId: 7,
        intent: 'overlap_planning',
        projectId: project.id,
        cycleId: cycle.id,
      },
    ],
    [
      8,
      {
        conversationId: 8,
        intent: 'auto_reply',
        projectId: project.id,
        cycleId: cycle.id,
      },
    ],
  ]);
  const judgment: JudgmentTools = {
    judgmentRunOf: (id) => runs.get(id) ?? null,
  };
  return { tickets, project, cycle, first, second, judgment };
}

describe('add_overlap_blocker (ADR 0054)', () => {
  it("adds the Blocker in the calling Overlap planning run's Cycle", async () => {
    const { tickets, first, second, judgment } = setup();
    const client = await connectMcpClient(tickets, { runId: '7', judgment });

    const result = await client.callTool({
      name: 'add_overlap_blocker',
      arguments: {
        blocker: first.number,
        blocked: second.number,
        sharedCode: 'src/board/',
      },
    });
    await client.close();

    expect(resultJson(result)).toMatchObject({
      number: second.number,
      blockedBy: [first.number],
    });
    expect(tickets.getTicket(second.number).blockedBy).toEqual([first.number]);
  });

  it.each([
    ['another judgment run', '8'],
    ['a run that is no judgment run', '3'],
    ['a session without a run', undefined],
  ])('is refused for %s', async (_name, runId) => {
    const { tickets, first, second, judgment } = setup();
    const client = await connectMcpClient(tickets, { runId, judgment });

    const result = await client.callTool({
      name: 'add_overlap_blocker',
      arguments: {
        blocker: first.number,
        blocked: second.number,
        sharedCode: 'src/board/',
      },
    });
    await client.close();

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(
      'This tool works only in an Overlap planning run.',
    );
    expect(tickets.getTicket(second.number).blockedBy).toEqual([]);
  });
});
