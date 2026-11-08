// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const setup = async () => {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const client = await connectMcpClient(tickets);
  return { tickets, project, client };
};

describe('workflow Ticket tools', () => {
  it('file_tickets creates a batch with Blockers by position and {{T:n}} references', async () => {
    const { tickets, project, client } = await setup();

    const { numbers } = resultJson(
      await client.callTool({
        name: 'file_tickets',
        arguments: {
          projectName: 'Website',
          tickets: [
            { title: 'First' },
            {
              title: 'Second',
              description: 'After {{T:0}}',
              blockedByPositions: [0],
            },
          ],
        },
      }),
    ) as { numbers: number[] };

    expect(tickets.getTicket(numbers[1]).description).toBe(
      `After T${numbers[0]}`,
    );
    expect(tickets.getTicket(numbers[1]).blockedBy).toEqual([numbers[0]]);
    expect(tickets.getTicket(numbers[0]).projectId).toBe(project.id);
    await client.close();
  });

  it('file_tickets and find_tickets default to the folder Project, and allProjects widens find_tickets', async () => {
    const tickets = createTestTickets();
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'tandembike-mcp-')));
    mkdirSync(join(root, '.git'));
    const website = tickets.createProject({ name: 'Website' });
    const blog = tickets.createProject({ name: 'Blog' });
    tickets.setProjectAgentSettings(website.id, { repositoryPath: root });
    tickets.createTicket({ projectId: blog.id, title: 'Elsewhere' });
    const client = await connectMcpClient(tickets, { cwd: root });

    await client.callTool({
      name: 'file_tickets',
      arguments: { tickets: [{ title: 'Here' }] },
    });
    const own = resultJson(
      await client.callTool({ name: 'find_tickets', arguments: {} }),
    ) as { tickets: { title: string }[] };
    const all = resultJson(
      await client.callTool({
        name: 'find_tickets',
        arguments: { allProjects: true },
      }),
    ) as { tickets: { title: string }[] };
    const named = resultJson(
      await client.callTool({
        name: 'find_tickets',
        arguments: { projectName: 'Blog' },
      }),
    ) as { tickets: { title: string }[] };

    expect(own.tickets.map((t) => t.title)).toEqual(['Here']);
    expect(all.tickets.map((t) => t.title)).toEqual(['Elsewhere', 'Here']);
    expect(named.tickets.map((t) => t.title)).toEqual(['Elsewhere']);
    await client.close();
  });

  it('get_ticket includes comments, and Activity only when asked', async () => {
    const { tickets, project, client } = await setup();
    const { number } = tickets.createTicket({
      projectId: project.id,
      title: 'Task',
    });
    tickets.addComment(number, { body: 'Note', author: 'agent' });

    const plain = resultJson(
      await client.callTool({ name: 'get_ticket', arguments: { number } }),
    ) as { comments: { body: string }[]; activity?: unknown };
    const withActivity = resultJson(
      await client.callTool({
        name: 'get_ticket',
        arguments: { number, include: ['activity'] },
      }),
    ) as { activity: unknown[] };

    expect(plain.comments.map((c) => c.body)).toEqual(['Note']);
    expect(plain.activity).toBeUndefined();
    expect(withActivity.activity.length).toBeGreaterThan(0);
    await client.close();
  });

  it('update_ticket changes Epic, Blockers, Cycle and archive state in one call', async () => {
    const { tickets, project, client } = await setup();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
    });
    const blocker = tickets.createTicket({ projectId: project.id, title: 'B' });
    const task = tickets.createTicket({ projectId: project.id, title: 'T' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: {
          number: task.number,
          title: 'Renamed',
          epicNumber: epic.number,
          addBlockers: [blocker.number],
          cycleId: cycle.id,
        },
      }),
    );
    const after = tickets.getTicket(task.number);
    expect(after.title).toBe('Renamed');
    expect(after.epic?.number).toBe(epic.number);
    expect(after.blockedBy).toEqual([blocker.number]);
    expect(after.cycle?.id).toBe(cycle.id);

    resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: {
          number: task.number,
          epicNumber: null,
          removeBlockers: [blocker.number],
          cycleId: null,
          archived: true,
        },
      }),
    );
    const gone = tickets.getTicket(task.number);
    expect(gone.epic).toBeNull();
    expect(gone.blockedBy).toEqual([]);
    expect(gone.cycle).toBeNull();
    expect(gone.archived).toBe(true);

    resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: { number: task.number, archived: false },
      }),
    );
    expect(tickets.getTicket(task.number).archived).toBe(false);
    await client.close();
  });

  it("update_ticket refuses with the messages of today's rules", async () => {
    const { tickets, project, client } = await setup();
    const a = tickets.createTicket({ projectId: project.id, title: 'A' });
    const b = tickets.createTicket({ projectId: project.id, title: 'B' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
    });
    tickets.addBlocker({ blocker: a.number, blocked: b.number });

    const loop = await client.callTool({
      name: 'update_ticket',
      arguments: { number: a.number, addBlockers: [b.number] },
    });
    const epicStatus = await client.callTool({
      name: 'update_ticket',
      arguments: { number: epic.number, status: 'Done' },
    });

    expect(loop.isError).toBe(true);
    expect(resultText(loop)).toBe(
      'T2 cannot block T1, because T1 already blocks T2: T1 → T2.',
    );
    expect(epicStatus.isError).toBe(true);
    expect(resultText(epicStatus)).toMatch(/follows its child Tickets/);
    await client.close();
  });

  it('update_ticket leaves a Ticket unchanged when a later step is refused', async () => {
    const { tickets, project, client } = await setup();
    const a = tickets.createTicket({ projectId: project.id, title: 'A' });
    const b = tickets.createTicket({ projectId: project.id, title: 'B' });
    tickets.addBlocker({ blocker: a.number, blocked: b.number });

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: {
        number: a.number,
        title: 'Renamed',
        addBlockers: [b.number],
      },
    });

    expect(result.isError).toBe(true);
    expect(tickets.getTicket(a.number).title).toBe('A');
    await client.close();
  });

  it('update_ticket applies one change to several numbers and lists the failures', async () => {
    const { tickets, project, client } = await setup();
    const a = tickets.createTicket({ projectId: project.id, title: 'A' });
    const b = tickets.createTicket({ projectId: project.id, title: 'B' });

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { number: [a.number, b.number, 999], addLabels: ['triaged'] },
    });
    const body = JSON.parse(resultText(result)) as {
      updated: { number: number }[];
      failed: { number: number }[];
    };

    expect(result.isError).toBe(true);
    expect(body.updated.map((t) => t.number)).toEqual([a.number, b.number]);
    expect(body.failed.map((t) => t.number)).toEqual([999]);
    expect(tickets.getTicket(b.number).labels).toEqual(['triaged']);
    await client.close();
  });

  it('attach and read_attachment add and read an Attachment', async () => {
    const { tickets, project, client } = await setup();
    const { number } = tickets.createTicket({
      projectId: project.id,
      title: 'T',
    });

    const added = resultJson(
      await client.callTool({
        name: 'attach',
        arguments: {
          number,
          name: 'note.txt',
          content: Buffer.from('hello').toString('base64'),
        },
      }),
    ) as { id: number };
    const read = await client.callTool({
      name: 'read_attachment',
      arguments: { id: added.id },
    });

    const parts = read.content as { text: string }[];
    expect(parts[1].text).toBe('hello');
    await client.close();
  });

  it('keeps each new or changed description under 3,500 characters', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();

    for (const name of [
      'file_tickets',
      'find_tickets',
      'get_ticket',
      'update_ticket',
      'attach',
      'read_attachment',
    ]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.description?.length, name).toBeLessThan(3500);
    }
    await client.close();
  });
});
