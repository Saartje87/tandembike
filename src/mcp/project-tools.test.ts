// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const descriptionLimit = 3500;

const folder = () => {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'tandembike-mcp-')));
  mkdirSync(join(path, '.git'));
  return path;
};

const setup = () => {
  const tickets = createTestTickets();
  const root = folder();
  const website = tickets.createProject({ name: 'Website' });
  const blog = tickets.createProject({ name: 'Blog' });
  tickets.setProjectAgentSettings(website.id, { repositoryPath: root });
  for (const title of ['One', 'Two', 'Three']) {
    tickets.createTicket({ projectId: website.id, title, labels: ['bug'] });
  }
  tickets.createTicket({ projectId: blog.id, title: 'Post', labels: ['blog'] });
  return { tickets, root, website, blog };
};

describe('get_project', () => {
  it("returns the folder's Project with Cycles, labels in use and the Active Cycle", async () => {
    const { tickets, root, website } = setup();
    const active = tickets.createCycle({ projectId: website.id, title: 'Now' });
    tickets.planTickets({ cycleId: active.id, ticketNumbers: [1, 2] });
    tickets.startCycle(active.id);
    const next = tickets.createCycle({ projectId: website.id, title: 'Next' });
    tickets.planTickets({ cycleId: next.id, ticketNumbers: [3] });
    const client = await connectMcpClient(tickets, { cwd: root });

    const project = resultJson(
      await client.callTool({ name: 'get_project', arguments: {} }),
    ) as Record<string, unknown>;

    expect(project).toMatchObject({
      id: website.id,
      name: 'Website',
      archived: false,
      activeCycleId: active.id,
      labels: ['bug'],
      cycles: [
        { id: active.id, title: 'Now', state: 'Active', ticketNumbers: [1, 2] },
        { id: next.id, title: 'Next', state: 'Prepared', ticketNumbers: [3] },
      ],
    });
    await client.close();
  });

  it('has a null Active Cycle when none is active', async () => {
    const { tickets, root } = setup();
    const client = await connectMcpClient(tickets, { cwd: root });

    const project = resultJson(
      await client.callTool({ name: 'get_project', arguments: {} }),
    );

    expect(project).toMatchObject({ activeCycleId: null, cycles: [] });
    await client.close();
  });

  it('lets projectName win over the folder and refuses unknown names', async () => {
    const { tickets, root } = setup();
    const client = await connectMcpClient(tickets, { cwd: root });

    const blog = resultJson(
      await client.callTool({
        name: 'get_project',
        arguments: { projectName: 'blog' },
      }),
    );
    const unknown = await client.callTool({
      name: 'get_project',
      arguments: { projectName: 'Nope' },
    });

    expect(blog).toMatchObject({ name: 'Blog', labels: ['blog'] });
    expect(unknown.isError).toBe(true);
    await client.close();
  });

  it('lists every Project with allProjects', async () => {
    const { tickets, root, website, blog } = setup();
    tickets.archiveProject(blog.id);
    const client = await connectMcpClient(tickets, { cwd: root });

    const projects = resultJson(
      await client.callTool({
        name: 'get_project',
        arguments: { allProjects: true },
      }),
    );

    expect(projects).toEqual([
      expect.objectContaining({
        id: website.id,
        name: 'Website',
        archived: false,
      }),
      expect.objectContaining({ id: blog.id, name: 'Blog', archived: true }),
    ]);
    await client.close();
  });

  it('refuses allProjects together with a Project', async () => {
    const { tickets, root } = setup();
    const client = await connectMcpClient(tickets, { cwd: root });

    const result = await client.callTool({
      name: 'get_project',
      arguments: { allProjects: true, projectName: 'Blog' },
    });

    expect(result.isError).toBe(true);
    await client.close();
  });
});

describe('create_cycle with Tickets', () => {
  it('creates a Prepared Cycle in the folder Project with the Tickets planned in', async () => {
    const { tickets, root, website } = setup();
    const client = await connectMcpClient(tickets, { cwd: root });

    const created = resultJson(
      await client.callTool({
        name: 'create_cycle',
        arguments: { title: 'Beta', ticketNumbers: [1, 3] },
      }),
    ) as { id: number };

    expect(tickets.getCycle(created.id)).toMatchObject({
      projectId: website.id,
      state: 'Prepared',
      ticketNumbers: [1, 3],
    });
    expect(created).toMatchObject({ state: 'Prepared', ticketNumbers: [1, 3] });
    await client.close();
  });

  it('refuses by the planning rules and leaves no Cycle behind', async () => {
    const { tickets, root, website } = setup();
    const other = tickets.createCycle({
      projectId: website.id,
      title: 'Other',
    });
    tickets.planTickets({ cycleId: other.id, ticketNumbers: [2] });
    const client = await connectMcpClient(tickets, { cwd: root });

    const result = await client.callTool({
      name: 'create_cycle',
      arguments: { title: 'Beta', ticketNumbers: [1, 2, 99] },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/T2/);
    expect(resultText(result)).toMatch(/T99/);
    expect(tickets.listCycles(website.id).map((cycle) => cycle.title)).toEqual([
      'Other',
    ]);
    expect(tickets.getCycle(other.id).ticketNumbers).toEqual([2]);
    await client.close();
  });

  it('never starts the Cycle, even when none is Active', async () => {
    const { tickets, root } = setup();
    const client = await connectMcpClient(tickets, { cwd: root });

    const created = resultJson(
      await client.callTool({
        name: 'create_cycle',
        arguments: { title: 'Beta', ticketNumbers: [] },
      }),
    ) as { state: string };

    expect(created.state).toBe('Prepared');
    await client.close();
  });
});

describe('create_cycle withChildren', () => {
  const withEpic = () => {
    const s = setup();
    const epic = s.tickets.createTicket({
      projectId: s.website.id,
      title: 'Epic',
      type: 'Epic',
    });
    const child = (cycleId?: number) =>
      s.tickets.createTicket({
        projectId: s.website.id,
        title: 'Child',
        epicNumber: epic.number,
        cycleId,
      });
    return { ...s, epic, child };
  };

  it('plans each Epic with its live children and names them', async () => {
    const { tickets, root, website, epic, child } = withEpic();
    const other = tickets.createCycle({ projectId: website.id, title: 'Old' });
    const a = child(other.id);
    const b = child();
    const archived = child();
    tickets.archiveTicket(archived.number);
    const client = await connectMcpClient(tickets, { cwd: root });

    const created = resultJson(
      await client.callTool({
        name: 'create_cycle',
        arguments: {
          title: 'Beta',
          ticketNumbers: [epic.number],
          withChildren: true,
        },
      }),
    );

    expect(created).toMatchObject({
      ticketNumbers: [epic.number, a.number, b.number],
      childrenPlanned: [a.number, b.number],
    });
    expect(tickets.getCycle(other.id).ticketNumbers).toEqual([]);
    expect(tickets.getTicket(archived.number).cycle).toBeNull();
    await client.close();
  });

  it('plans only the Epic without the flag', async () => {
    const { tickets, root, epic, child } = withEpic();
    const a = child();
    const client = await connectMcpClient(tickets, { cwd: root });

    const created = resultJson(
      await client.callTool({
        name: 'create_cycle',
        arguments: { title: 'Beta', ticketNumbers: [epic.number] },
      }),
    );

    expect(created).toMatchObject({ ticketNumbers: [epic.number] });
    expect(created).not.toHaveProperty('childrenPlanned');
    expect(tickets.getTicket(a.number).cycle).toBeNull();
    await client.close();
  });

  it('refuses a Ticket that is not an Epic, creates no Cycle and moves no child', async () => {
    const { tickets, root, website, epic, child } = withEpic();
    const other = tickets.createCycle({ projectId: website.id, title: 'Old' });
    const a = child(other.id);
    const client = await connectMcpClient(tickets, { cwd: root });

    const result = await client.callTool({
      name: 'create_cycle',
      arguments: {
        title: 'Beta',
        ticketNumbers: [epic.number, 1],
        withChildren: true,
      },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(
      'No Cycle was created. T1: Ticket T1 is not an Epic. Only an Epic has children to take along.',
    );
    expect(tickets.listCycles(website.id).map((cycle) => cycle.title)).toEqual([
      'Old',
    ]);
    expect(tickets.getCycle(other.id).ticketNumbers).toEqual([a.number]);
    await client.close();
  });
});

describe('project tool descriptions', () => {
  it('stay under the limit', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    for (const name of ['get_project', 'create_cycle']) {
      const tool = tools.find((candidate) => candidate.name === name);
      expect(tool?.description?.length, name).toBeLessThan(descriptionLimit);
    }
    await client.close();
  });
});
