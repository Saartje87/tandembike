// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';

const setup = () => {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the footer',
  });
  return { tickets, ticket };
};

describe('Run identity through X-Tandembike-Run', () => {
  it('claims and releases under the header run ID without agentRunId', async () => {
    const { tickets, ticket } = setup();
    const client = await connectMcpClient(tickets, { runId: 'conv-7' });

    const claimed = await client.callTool({
      name: 'claim_ticket',
      arguments: { number: ticket.number },
    });
    expect(resultJson(claimed)).toMatchObject({
      claim: { agentRunId: 'conv-7' },
    });

    const released = await client.callTool({
      name: 'release_ticket_claim',
      arguments: { number: ticket.number },
    });
    expect(resultJson(released)).toMatchObject({ claim: null });
    await client.close();
  });

  it('lets an explicit agentRunId win over the header', async () => {
    const { tickets, ticket } = setup();
    const client = await connectMcpClient(tickets, { runId: 'conv-7' });

    const claimed = await client.callTool({
      name: 'claim_ticket',
      arguments: { number: ticket.number, agentRunId: 'other' },
    });

    expect(resultJson(claimed)).toMatchObject({
      claim: { agentRunId: 'other' },
    });
    await client.close();
  });

  it('refuses a claim with neither the header nor agentRunId', async () => {
    const { tickets, ticket } = setup();
    const client = await connectMcpClient(tickets);

    for (const name of ['claim_ticket', 'release_ticket_claim']) {
      const result = await client.callTool({
        name,
        arguments: { number: ticket.number },
      });
      expect(result.isError).toBe(true);
      expect(resultText(result)).toBe(
        'Pass agentRunId, a unique ID for this Agent run.',
      );
    }
    expect(tickets.getTicket(ticket.number).claim).toBeNull();
    await client.close();
  });
});
