import { describe, expect, it, vi } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { NotAllowedError } from '../tickets/errors';
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
    replyToQuestion: async () => {
      throw new Error('Not in this test.');
    },
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

describe('reply_to_question (ADR 0054)', () => {
  const replying = () => {
    const world = setup();
    const replies: unknown[] = [];
    const judgment: JudgmentTools = {
      ...world.judgment,
      replyToQuestion: async (id, reply) => {
        replies.push({ id, reply });
        return {
          decision: reply.decision,
          ticketNumber: world.second.number,
          startConversationId: 4,
          question: 'Which library?',
          answer: reply.decision === 'approve' ? 'B' : null,
        };
      },
    };
    return { ...world, judgment, replies };
  };

  it.each([
    [
      'approve',
      { answer: { selected: ['B'] } },
      'Auto-reply answered a question of the Start run (Conversation 4) for you.\n\n> Which library?\n\nIt answered **B**: The recommended one is in scope.',
    ],
    [
      'split',
      {},
      'Auto-reply split off a question of the Start run (Conversation 4): it asked the run to leave it out and file a follow-up with this Ticket as Origin.\n\n> Which library?\n\nWhy: The recommended one is in scope.',
    ],
    [
      'escalate',
      {},
      'Auto-reply left a question of the Start run (Conversation 4) for you to answer.\n\n> Which library?\n\nWhy: The recommended one is in scope.',
    ],
  ] as const)(
    '%s: replies through Conversations and comments on the Ticket',
    async (decision, extra, comment) => {
      const { tickets, second, judgment, replies } = replying();
      const client = await connectMcpClient(tickets, { runId: '8', judgment });

      const result = await client.callTool({
        name: 'reply_to_question',
        arguments: {
          decision,
          reason: 'The recommended one is in scope.',
          ...extra,
        },
      });
      await client.close();

      expect(resultJson(result)).toMatchObject({ decision });
      expect(replies).toEqual([
        {
          id: 8,
          reply: {
            decision,
            reason: 'The recommended one is in scope.',
            ...extra,
          },
        },
      ]);
      const comments = tickets.listComments(second.number);
      expect(comments).toHaveLength(1);
      expect(comments[0]).toMatchObject({ author: 'agent', body: comment });
    },
  );

  it('is refused for an Overlap planning run, and comments nothing', async () => {
    const { tickets, second, judgment, replies } = replying();
    const client = await connectMcpClient(tickets, { runId: '7', judgment });

    const result = await client.callTool({
      name: 'reply_to_question',
      arguments: { decision: 'escalate', reason: 'x' },
    });
    await client.close();

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(
      'This tool works only in an Auto-reply run.',
    );
    expect(replies).toEqual([]);
    expect(tickets.listComments(second.number)).toEqual([]);
  });

  it("passes on the Conversations module's refusal, such as the User answering first", async () => {
    const { tickets, second, judgment } = replying();
    const refusing: JudgmentTools = {
      ...judgment,
      replyToQuestion: async () => {
        throw new NotAllowedError(
          'The User answered this question first, so Auto-reply sends nothing.',
        );
      },
    };
    const client = await connectMcpClient(tickets, {
      runId: '8',
      judgment: refusing,
    });

    const result = await client.callTool({
      name: 'reply_to_question',
      arguments: { decision: 'split', reason: 'x' },
    });
    await client.close();

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(
      'The User answered this question first',
    );
    expect(tickets.listComments(second.number)).toEqual([]);
  });

  it('still returns a reply that went out when its comment cannot be added', async () => {
    const { tickets, judgment } = replying();
    const gone: JudgmentTools = {
      ...judgment,
      replyToQuestion: async (_id, reply) => ({
        decision: reply.decision,
        ticketNumber: 999,
        startConversationId: 4,
        question: 'Which library?',
        answer: 'B',
      }),
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = await connectMcpClient(tickets, {
      runId: '8',
      judgment: gone,
    });

    const result = await client.callTool({
      name: 'reply_to_question',
      arguments: {
        decision: 'approve',
        answer: { selected: ['B'] },
        reason: 'x',
      },
    });
    await client.close();

    expect(resultJson(result)).toMatchObject({ decision: 'approve' });
  });
});
