import { describe, expect, it } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const setup = async (runId?: string) => {
  const tickets = createTestTickets();
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tandembike-mcp-')));
  mkdirSync(join(root, '.git'));
  const project = tickets.createProject({ name: 'Website' });
  tickets.setProjectAgentSettings(project.id, {
    repositoryPath: root,
    checkCommand: 'npm run check',
  });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Goal' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the footer',
    labels: ['ready-for-agent'],
    acceptanceCriteria: [{ text: 'Looks right' }],
  });
  tickets.planTicket({ cycleId: cycle.id, number: ticket.number });
  tickets.startCycle(cycle.id);
  const client = await connectMcpClient(tickets, { cwd: root, runId });
  return { tickets, ticket, client };
};

describe('work tools', () => {
  it('walk a Ticket from next_work to finish_work with folder and run-ID defaults', async () => {
    const { tickets, ticket, client } = await setup('conv-7');

    const next = resultJson(
      await client.callTool({ name: 'next_work', arguments: {} }),
    ) as { ticket: { number: number } };
    expect(next.ticket.number).toBe(ticket.number);

    const bundle = resultJson(
      await client.callTool({
        name: 'start_work',
        arguments: { number: ticket.number },
      }),
    ) as { ticket: { status: string }; checkCommand: string };
    expect(bundle.ticket.status).toBe('In progress');
    expect(bundle.checkCommand).toBe('npm run check');
    expect(tickets.getTicket(ticket.number).claim?.agentRunId).toBe('conv-7');

    await client.callTool({
      name: 'add_note',
      arguments: { number: ticket.number, body: 'Halfway' },
    });
    expect(tickets.listComments(ticket.number)).toHaveLength(1);

    const criterion = tickets.getTicket(ticket.number).acceptanceCriteria[0];
    await client.callTool({
      name: 'check_criterion',
      arguments: { number: ticket.number, ids: [criterion.id], checked: true },
    });
    expect(tickets.getTicket(ticket.number).acceptanceCriteria[0].checked).toBe(
      true,
    );

    await client.callTool({
      name: 'open_pr',
      arguments: {
        number: ticket.number,
        url: 'https://github.com/o/r/pull/9',
        handOff: true,
      },
    });
    expect(tickets.getTicket(ticket.number)).toMatchObject({
      externalReferences: ['https://github.com/o/r/pull/9'],
      claim: null,
    });

    await client.callTool({
      name: 'finish_work',
      arguments: { number: ticket.number },
    });
    expect(tickets.getTicket(ticket.number).status).toBe('Done');
    await client.close();
  });

  it("start_work returns the Project's merge mode", async () => {
    const { tickets, ticket, client } = await setup('conv-7');
    tickets.setProjectAgentSettings(ticket.projectId, { autoMerge: true });

    const bundle = resultJson(
      await client.callTool({
        name: 'start_work',
        arguments: { number: ticket.number },
      }),
    ) as { merge: string };

    expect(bundle.merge).toBe('auto');
    await client.close();
  });

  it("start_work and get_ticket count each Epic child's unchecked criteria (T1226)", async () => {
    const { tickets, ticket, client } = await setup('conv-7');
    const epic = tickets.createTicket({
      projectId: ticket.projectId,
      title: 'Checkout',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: ticket.projectId,
      title: 'Pay by card',
      epicNumber: epic.number,
      acceptanceCriteria: [
        { text: 'Visa works', checked: true },
        { text: 'Refunds work' },
      ],
    });
    const children = [{ number: child.number, uncheckedCriteria: 1 }];

    const bundle = resultJson(
      await client.callTool({
        name: 'start_work',
        arguments: { number: epic.number },
      }),
    ) as { epic: { children: unknown[] } };
    const read = resultJson(
      await client.callTool({
        name: 'get_ticket',
        arguments: { number: epic.number, description: false },
      }),
    ) as { children: unknown[] };

    expect(bundle.epic.children).toMatchObject(children);
    expect(read.children).toMatchObject(children);
    await client.close();
  });

  it('start_work returns approve with Auto-merge off', async () => {
    const { ticket, client } = await setup('conv-7');

    const bundle = resultJson(
      await client.callTool({
        name: 'start_work',
        arguments: { number: ticket.number },
      }),
    ) as { merge: string };

    expect(bundle.merge).toBe('approve');
    await client.close();
  });

  it('open_pr without handOff keeps the Claim', async () => {
    const { tickets, ticket, client } = await setup('conv-7');
    await client.callTool({
      name: 'start_work',
      arguments: { number: ticket.number },
    });

    await client.callTool({
      name: 'open_pr',
      arguments: {
        number: ticket.number,
        url: 'https://github.com/o/r/pull/9',
      },
    });

    expect(tickets.getTicket(ticket.number).claim?.agentRunId).toBe('conv-7');
    await client.close();
  });

  it('abandon_work comments, releases and returns the Ticket to Todo', async () => {
    const { tickets, ticket, client } = await setup();
    await client.callTool({
      name: 'start_work',
      arguments: { number: ticket.number, agentRunId: 'me' },
    });

    await client.callTool({
      name: 'abandon_work',
      arguments: { number: ticket.number, reason: 'Unclear', agentRunId: 'me' },
    });

    expect(tickets.getTicket(ticket.number)).toMatchObject({
      status: 'Todo',
      claim: null,
    });
    expect(tickets.listComments(ticket.number)[0].body).toBe('Unclear');
    await client.close();
  });

  it('refuse start_work without a run ID, and next_work reports why it is empty', async () => {
    const { tickets, ticket, client } = await setup();

    const refused = await client.callTool({
      name: 'start_work',
      arguments: { number: ticket.number },
    });
    expect(refused.isError).toBe(true);
    expect(resultText(refused)).toContain('Pass agentRunId');

    tickets.claimTicket(ticket.number, { agentRunId: 'other' });
    expect(
      resultJson(await client.callTool({ name: 'next_work', arguments: {} })),
    ).toEqual({ ticket: null, reason: 'all-blocked-or-claimed' });
    await client.close();
  });
});
