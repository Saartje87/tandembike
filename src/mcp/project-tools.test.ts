// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { createChangeChannel } from '../tickets/changes';
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

describe('update_cycle', () => {
  it("renames a Prepared Cycle by create_cycle's title rules and returns it", async () => {
    const { tickets, root, website } = setup();
    const cycle = tickets.createCycle({ projectId: website.id, title: 'Beta' });
    tickets.planTickets({ cycleId: cycle.id, ticketNumbers: [2] });
    const client = await connectMcpClient(tickets, { cwd: root });

    const renamed = resultJson(
      await client.callTool({
        name: 'update_cycle',
        arguments: { cycleId: cycle.id, title: '  Public beta ' },
      }),
    );

    expect(renamed).toMatchObject({
      id: cycle.id,
      title: 'Public beta',
      state: 'Prepared',
      ticketNumbers: [2],
    });
    expect(tickets.getCycle(cycle.id).title).toBe('Public beta');
    const empty = await client.callTool({
      name: 'update_cycle',
      arguments: { cycleId: cycle.id, title: ' ' },
    });
    expect(empty.isError).toBe(true);
    expect(resultText(empty)).toMatch(/Enter a title/);
    await client.close();
  });

  it('refuses an Active or an Archived Cycle, naming its state', async () => {
    const { tickets, root, website } = setup();
    const archived = tickets.createCycle({
      projectId: website.id,
      title: 'Old',
    });
    tickets.startCycle(archived.id);
    tickets.archiveCycle(archived.id);
    const active = tickets.createCycle({ projectId: website.id, title: 'Now' });
    tickets.startCycle(active.id);
    const client = await connectMcpClient(tickets, { cwd: root });

    for (const [cycle, state] of [
      [active, 'Active'],
      [archived, 'Archived'],
    ] as const) {
      const result = await client.callTool({
        name: 'update_cycle',
        arguments: { cycleId: cycle.id, title: 'Renamed' },
      });

      expect(result.isError, state).toBe(true);
      expect(resultText(result)).toBe(
        `The Cycle "${cycle.title}" is ${state}. An Agent may rename only a Prepared Cycle; the User renames an ${state} one.`,
      );
      expect(tickets.getCycle(cycle.id).title).toBe(cycle.title);
    }
    await client.close();
  });

  it('announces the rename, so open Boards show it live', async () => {
    const changes = createChangeChannel();
    const tickets = createTestTickets(changes, 'agent');
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const listener = vi.fn();
    changes.subscribe(listener);
    const client = await connectMcpClient(tickets);

    await client.callTool({
      name: 'update_cycle',
      arguments: { cycleId: cycle.id, title: 'Launch' },
    });

    expect(listener).toHaveBeenCalledWith({ type: 'cycle', id: cycle.id });
    await client.close();
  });

  it('refuses a Cycle that does not exist', async () => {
    const { tickets, root } = setup();
    const client = await connectMcpClient(tickets, { cwd: root });

    const result = await client.callTool({
      name: 'update_cycle',
      arguments: { cycleId: 99, title: 'Beta' },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/There is no Cycle with id 99/);
    await client.close();
  });
});

describe('project tool descriptions', () => {
  it('stay under the limit', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    for (const name of ['get_project', 'create_cycle', 'update_cycle']) {
      const tool = tools.find((candidate) => candidate.name === name);
      expect(tool?.description?.length, name).toBeLessThan(descriptionLimit);
    }
    await client.close();
  });
});
