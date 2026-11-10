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

  it('file_tickets gives one Ticket of the batch an existing Ticket as Origin', async () => {
    const { tickets, project, client } = await setup();
    const idea = tickets.createTicket({ projectId: project.id, title: 'Idea' });

    const { numbers } = resultJson(
      await client.callTool({
        name: 'file_tickets',
        arguments: {
          projectName: 'Website',
          tickets: [
            { title: 'Epic', type: 'Epic', originNumber: idea.number },
            { title: 'Child', epicPosition: 0 },
          ],
        },
      }),
    ) as { numbers: number[] };

    expect(tickets.getTicket(numbers[0]).origin?.number).toBe(idea.number);
    expect(tickets.getTicket(numbers[1]).origin).toBeNull();
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

  it('update_ticket restores an archived Ticket before changing it (T1152)', async () => {
    const { tickets, project, client } = await setup();
    const task = tickets.createTicket({ projectId: project.id, title: 'A' });
    tickets.archiveTicket(task.number);

    const refused = await client.callTool({
      name: 'update_ticket',
      arguments: { number: task.number, title: 'Renamed' },
    });
    resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: { number: task.number, title: 'Renamed', archived: false },
      }),
    );

    expect(resultText(refused)).toBe(
      `Ticket T${task.number} is archived. Restore it before changing it.`,
    );
    expect(tickets.getTicket(task.number)).toMatchObject({
      title: 'Renamed',
      archived: false,
    });
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

  it('propose_triage records a proposal and posts the reasoning, applying nothing', async () => {
    const { tickets, project, client } = await setup();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix it',
      labels: ['needs-triage'],
    });

    const result = await client.callTool({
      name: 'propose_triage',
      arguments: {
        number: ticket.number,
        category: 'bug',
        state: 'ready-for-agent',
        reasoning: 'Reproduced.',
        acceptanceCriteria: ['It works'],
      },
    });

    expect(resultJson(result)).toMatchObject({
      ticketNumber: ticket.number,
      status: 'pending',
      acceptanceCriteria: ['It works'],
    });
    expect(tickets.listComments(ticket.number)[0]).toMatchObject({
      author: 'agent',
      body: '> *This was generated by AI during triage.*\n\nReproduced.',
    });
    expect(tickets.getTicket(ticket.number).labels).toEqual(['needs-triage']);
    await client.close();
  });

  it('propose_triage records a duplicate and splits, and refuses malformed ones', async () => {
    const { tickets, project, client } = await setup();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix it',
      labels: ['needs-triage'],
    });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Big',
      type: 'Epic',
    });
    const base = { category: 'bug', state: 'wontfix', reasoning: 'See other.' };
    const split = { title: 'A', description: 'd', acceptanceCriteria: ['x'] };
    const call = (number: number, extra: object) =>
      client.callTool({
        name: 'propose_triage',
        arguments: { number, ...base, ...extra },
      });

    const duplicate = await call(ticket.number, { duplicateOf: epic.number });
    expect(resultJson(duplicate)).toMatchObject({ duplicateOf: epic.number });
    const splitProposal = await call(ticket.number, { splits: [split] });
    expect(resultJson(splitProposal)).toMatchObject({ splits: [split] });

    for (const refused of [
      await call(ticket.number, { duplicateOf: epic.number, splits: [split] }),
      await call(ticket.number, { duplicateOf: ticket.number }),
      await call(epic.number, { splits: [split] }),
    ]) {
      expect(refused.isError).toBe(true);
    }
    await client.close();
  });

  it('propose_triage refuses a Ticket that is not Todo', async () => {
    const { tickets, project, client } = await setup();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Busy',
      status: 'In progress',
    });

    const result = await client.callTool({
      name: 'propose_triage',
      arguments: {
        number: ticket.number,
        category: 'bug',
        state: 'wontfix',
        reasoning: 'No.',
      },
    });

    expect(result.isError).toBe(true);
    await client.close();
  });
});

describe('file_tickets feedback cap and dedupe', () => {
  const feedbackBatch = (...titles: string[]) => ({
    projectName: 'Website',
    tickets: titles.map((title) => ({
      title,
      labels: ['needs-triage', 'from:agent-run'],
    })),
  });

  it('refuses a run fourth feedback Ticket and caps nothing without the header', async () => {
    const tickets = createTestTickets();
    tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets, { runId: 'conv-9' });

    const ok = await client.callTool({
      name: 'file_tickets',
      arguments: feedbackBatch('Alpha one', 'Beta two', 'Gamma three'),
    });
    expect(ok.isError).toBeFalsy();
    const refused = await client.callTool({
      name: 'file_tickets',
      arguments: feedbackBatch('Delta four'),
    });
    expect(refused.isError).toBe(true);
    expect(resultText(refused)).toContain('add a note');
    await client.close();

    const plain = await connectMcpClient(tickets);
    const uncapped = await plain.callTool({
      name: 'file_tickets',
      arguments: feedbackBatch(
        'Zeta six',
        'Eta seven',
        'Theta eight',
        'Iota nine',
      ),
    });
    expect(uncapped.isError).toBeFalsy();
    await plain.close();
  });

  it('refuses a near-duplicate feedback Ticket naming the match', async () => {
    const tickets = createTestTickets();
    tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets, { runId: 'conv-9' });
    await client.callTool({
      name: 'file_tickets',
      arguments: feedbackBatch('Sidebar closes on resize'),
    });

    const refused = await client.callTool({
      name: 'file_tickets',
      arguments: feedbackBatch('Sidebar closes on resize.'),
    });

    expect(refused.isError).toBe(true);
    expect(resultText(refused)).toContain('T1');
    await client.close();
  });
});

describe('update_ticket cycleId withChildren', () => {
  const withEpic = async () => {
    const s = await setup();
    const epic = s.tickets.createTicket({
      projectId: s.project.id,
      title: 'Epic',
      type: 'Epic',
    });
    const beta = s.tickets.createCycle({
      projectId: s.project.id,
      title: 'Beta',
    });
    const gamma = s.tickets.createCycle({
      projectId: s.project.id,
      title: 'Gamma',
    });
    const child = (cycleId?: number) =>
      s.tickets.createTicket({
        projectId: s.project.id,
        title: 'Child',
        epicNumber: epic.number,
        cycleId,
      });
    return { ...s, epic, beta, gamma, child };
  };

  it('moves the Epic and its children into the Cycle, out of any other, and names them', async () => {
    const { tickets, client, epic, beta, gamma, child } = await withEpic();
    const a = child(gamma.id);
    const b = child();
    const archived = child();
    tickets.archiveTicket(archived.number);

    const result = resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: {
          number: epic.number,
          cycleId: beta.id,
          withChildren: true,
        },
      }),
    );

    expect(result).toMatchObject({
      number: epic.number,
      childrenMoved: [a.number, b.number],
    });
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([
      epic.number,
      a.number,
      b.number,
    ]);
    expect(tickets.getCycle(gamma.id).ticketNumbers).toEqual([]);
    expect(tickets.getTicket(archived.number).cycle).toBeNull();
    await client.close();
  });

  it('returns the Epic and its children in that Cycle to the Backlog with cycleId null', async () => {
    const { tickets, client, epic, beta, gamma, child } = await withEpic();
    tickets.planTicket({ cycleId: beta.id, number: epic.number });
    const a = child(beta.id);
    const elsewhere = child(gamma.id);

    const result = resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: { number: epic.number, cycleId: null, withChildren: true },
      }),
    );

    expect(result).toMatchObject({ childrenMoved: [a.number] });
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([]);
    expect(tickets.getCycle(gamma.id).ticketNumbers).toEqual([
      elsewhere.number,
    ]);
    await client.close();
  });

  it('moves only the Epic without the flag', async () => {
    const { tickets, client, epic, beta, child } = await withEpic();
    const a = child();

    const result = resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: { number: epic.number, cycleId: beta.id },
      }),
    );

    expect(result).not.toHaveProperty('childrenMoved');
    expect(tickets.getTicket(a.number).cycle).toBeNull();
    await client.close();
  });

  it('names the children of each Epic in a batch', async () => {
    const { tickets, project, client, epic, beta, child } = await withEpic();
    const a = child();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Other',
      type: 'Epic',
    });

    const result = resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: {
          number: [epic.number, other.number],
          cycleId: beta.id,
          withChildren: true,
        },
      }),
    );

    expect(result).toMatchObject({
      updated: [
        { number: epic.number, childrenMoved: [a.number] },
        { number: other.number, childrenMoved: [] },
      ],
      failed: [],
    });
    await client.close();
  });

  it('refuses withChildren on a Ticket that is not an Epic, and leaves it unchanged', async () => {
    const { tickets, project, client, beta } = await withEpic();
    const plain = tickets.createTicket({ projectId: project.id, title: 'P' });

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: {
        number: plain.number,
        title: 'Renamed',
        cycleId: beta.id,
        withChildren: true,
      },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(
      `Ticket T${plain.number} is not an Epic. Only an Epic has children to take along.`,
    );
    expect(tickets.getTicket(plain.number)).toMatchObject({
      title: 'P',
      cycle: null,
    });
    await client.close();
  });

  it('refuses withChildren without cycleId', async () => {
    const { tickets, client, epic } = await withEpic();

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { number: epic.number, title: 'Renamed', withChildren: true },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/withChildren.*cycleId/);
    expect(tickets.getTicket(epic.number).title).toBe('Epic');
    await client.close();
  });

  describe('update_ticket before and after', () => {
    /** A Project with Tickets T1 to T4 in Todo, as an Agent's tools see it. */
    const laneSetup = async () => {
      const tickets = createTestTickets(undefined, 'agent');
      const project = tickets.createProject({ name: 'Website' });
      for (const title of ['One', 'Two', 'Three', 'Four']) {
        tickets.createTicket({ projectId: project.id, title });
      }
      const client = await connectMcpClient(tickets);
      /** The Todo lane as find_tickets sort position lists it. */
      const lane = async () =>
        (
          resultJson(
            await client.callTool({
              name: 'find_tickets',
              arguments: {
                projectName: 'Website',
                status: 'Todo',
                sort: 'position',
              },
            }),
          ) as { tickets: { number: number }[] }
        ).tickets.map(({ number }) => number);
      return { tickets, project, client, lane };
    };

    it('moves a Ticket directly before or after another, as find_tickets shows', async () => {
      const { tickets, client, lane } = await laneSetup();

      const before = await client.callTool({
        name: 'update_ticket',
        arguments: { number: 4, before: 1 },
      });
      expect(before.isError).toBeFalsy();
      expect(await lane()).toEqual([4, 1, 2, 3]);

      await client.callTool({
        name: 'update_ticket',
        arguments: { number: 1, after: 3 },
      });
      expect(await lane()).toEqual([4, 2, 3, 1]);
      expect(tickets.listActivity(1).at(-1)).toMatchObject({
        actor: 'agent',
        changes: [{ type: 'reordered', after: 3 }],
      });
      await client.close();
    });

    it('changes the Status first, so a Ticket can land next to one in its new Status', async () => {
      const { tickets, project, client } = await laneSetup();
      tickets.updateTicket(2, { status: 'In progress' });

      await client.callTool({
        name: 'update_ticket',
        arguments: { number: 4, status: 'In progress', before: 2 },
      });

      expect(
        tickets
          .findTickets({
            projectId: project.id,
            status: 'In progress',
            sort: 'position',
          })
          .tickets.map(({ number }) => number),
      ).toEqual([4, 2]);
      await client.close();
    });

    it('refuses an anchor in another Status with a reason, leaving the order', async () => {
      const { tickets, client, lane } = await laneSetup();
      tickets.updateTicket(2, { status: 'In progress' });

      const result = await client.callTool({
        name: 'update_ticket',
        arguments: { number: 4, before: 2 },
      });

      expect(result.isError).toBe(true);
      expect(resultText(result)).toMatch(/T2 is In progress, not Todo like T4/);
      expect(await lane()).toEqual([1, 3, 4]);
      await client.close();
    });

    it('refuses before and after together, and either with a list of Tickets', async () => {
      const { client, lane } = await laneSetup();

      const both = await client.callTool({
        name: 'update_ticket',
        arguments: { number: 4, before: 1, after: 2 },
      });
      const batch = await client.callTool({
        name: 'update_ticket',
        arguments: { number: [3, 4], before: 1 },
      });

      expect(both.isError).toBe(true);
      expect(resultText(both)).toMatch(/either before or after/);
      expect(batch.isError).toBe(true);
      expect(resultText(batch)).toMatch(/one Ticket at a time/);
      expect(await lane()).toEqual([1, 2, 3, 4]);
      await client.close();
    });
  });
});
