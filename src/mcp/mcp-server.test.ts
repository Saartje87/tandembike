// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { handleMcpRequest, maxInstructionsLength } from './mcp-server';

describe('MCP server', () => {
  it('lists every tool with a description', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'add_blocker',
      'add_comment',
      'add_ticket_labels',
      'archive_cycle',
      'archive_ticket',
      'attach_to_epic',
      'claim_ticket',
      'create_cycle',
      'create_project',
      'create_ticket',
      'create_tickets',
      'detach_from_epic',
      'edit_comment',
      'get_ticket',
      'list_blockers',
      'list_comments',
      'list_cycles',
      'list_labels',
      'list_projects',
      'list_tickets',
      'plan_ticket',
      'plan_tickets',
      'release_ticket_claim',
      'remove_blocker',
      'remove_comment',
      'remove_ticket_labels',
      'rename_cycle',
      'rename_project',
      'restore_ticket',
      'set_acceptance_criteria_checked',
      'start_cycle',
      'unplan_ticket',
      'unplan_tickets',
      'update_ticket',
      'update_tickets',
    ]);
    for (const tool of tools) {
      expect(tool.description, tool.name).toMatch(/\w{3,}/);
    }
    await client.close();
  });

  it('tells Agents how to work with Tickets', async () => {
    const client = await connectMcpClient(createTestTickets());

    const instructions = client.getInstructions();

    expect(instructions).toMatch(/In progress/);
    expect(instructions).toMatch(/Done/);
    expect(instructions).toMatch(/list_projects/);
    expect(instructions).toMatch(/#42/);
    expect(instructions).toMatch(/list_labels/);
    expect(instructions).toMatch(/add_comment/);
    expect(instructions).toMatch(/add_blocker/);
    expect(instructions).toMatch(/create_tickets/);
    expect(instructions).toMatch(/Epic/);
    expect(instructions).toMatch(/attach_to_epic/);
    expect(instructions).toMatch(/claim_ticket/);
    expect(instructions).toMatch(/release_ticket_claim/);
    expect(instructions).toMatch(/set_acceptance_criteria_checked/);
    expect(instructions).toMatch(/list_cycles/);
    expect(instructions).toMatch(/plan_tickets/);
    await client.close();
  });

  it("explains the tracker to any client in any repository, leaving each repository's process to it", async () => {
    const client = await connectMcpClient(createTestTickets());

    const instructions = client.getInstructions() ?? '';
    const { tools } = await client.listTools();
    const archive = tools.find((tool) => tool.name === 'archive_ticket');

    // Which Project: the repository's own instructions name it (ADR 0014).
    expect(instructions).toMatch(/repository's instructions name a Project/);
    // General rules that used to live only in one repository's docs.
    expect(instructions).toMatch(/never as a checklist in the description/);
    expect(instructions).toMatch(/one level deep/);
    expect(instructions).toMatch(/its description holds their shared context/);
    expect(instructions).toMatch(/reconnect/);
    expect(instructions).toMatch(/not direct database access/);
    // Process belongs to each repository, and no client is assumed.
    expect(instructions).not.toMatch(/branch|pull request|\bPR\b/i);
    expect(instructions).not.toMatch(/Claude|Copilot/);
    expect(archive?.description).toMatch(
      /Agents cannot delete Tickets; the User can, from the app/,
    );
    // Facts that only one repository's docs used to state (#63).
    const describe = (name: string) =>
      JSON.stringify(tools.find((tool) => tool.name === name));
    expect(archive?.description).toMatch(
      /An Epic cannot be archived while any child is not archived/,
    );
    expect(describe('add_blocker')).toMatch(
      /Blockers between an Epic and its own children are refused/,
    );
    for (const name of ['list_tickets', 'create_ticket', 'create_tickets']) {
      expect(describe(name)).toMatch(
        /Giving both is refused unless they name the same Project/,
      );
    }
    expect(instructions).toMatch(/missing from your list may still exist/);
    await client.close();
  });

  it('keeps each rule left out of the instructions in the tool it concerns', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();
    const describe = (name: string) =>
      JSON.stringify(tools.find((tool) => tool.name === name));

    const moved: [tool: string, rule: RegExp][] = [
      ['create_project', /names must be unique, ignoring case/],
      ['create_tickets', /All or nothing/],
      ['create_tickets', /Only earlier positions can be named/],
      ['add_blocker', /must be resolved \(Done or archived\)/],
      ['update_ticket', /To only check or uncheck criteria/],
      [
        'set_acceptance_criteria_checked',
        /the Ticket's Status stay as they are/,
      ],
      ['edit_comment', /only edit comments written by an Agent/],
      ['remove_comment', /only remove comments written by an Agent/],
      ['get_ticket', /an Epic lists its children/],
      ['attach_to_epic', /detach_from_epic it first/],
      ['update_ticket', /An Epic's follows its children and cannot be set/],
      [
        'create_ticket',
        /Todo with none or all Todo, Done when all are Done, In progress otherwise/,
      ],
      ['list_cycles', /state \(Prepared, Active or Archived\), ticketNumbers/],
      ['plan_ticket', /at most one Cycle that is not Archived/],
      ['plan_ticket', /Done ones included/],
      ['plan_ticket', /unplan_ticket it from its current one first/],
      ['plan_ticket', /a member that becomes Done or is archived stays in it/],
      ['plan_tickets', /at most 50 per call/],
      ['unplan_tickets', /at most 50 per call/],
      ['list_tickets', /with null, the Backlog/],
      ['start_cycle', /refused, unless confirmArchiveActive is true/],
      ['start_cycle', /Set it only once the User has agreed/],
    ];
    for (const [tool, rule] of moved) {
      expect(describe(tool), tool).toMatch(rule);
    }
    await client.close();
  });

  it('keeps the instructions and every tool description within the cap clients read whole', async () => {
    const client = await connectMcpClient(createTestTickets());

    const instructions = client.getInstructions() ?? '';
    const { tools } = await client.listTools();

    expect(maxInstructionsLength).toBe(3500);
    expect(instructions.length).toBeLessThanOrEqual(maxInstructionsLength);
    for (const tool of tools) {
      expect(tool.description?.length, tool.name).toBeLessThanOrEqual(
        maxInstructionsLength,
      );
    }
    await client.close();
  });

  it('refuses a request for a host other than localhost', async () => {
    const response = await handleMcpRequest(
      new Request('http://localhost:3000/api/mcp', {
        method: 'POST',
        headers: {
          host: 'evil.example',
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      }),
      createTestTickets(),
    );

    expect(response.status).toBe(403);
  });

  it('turns input that breaks the schema into a tool error', async () => {
    const client = await connectMcpClient(createTestTickets());

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { number: '42' },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/Input validation error/);
    await client.close();
  });
});

describe('Project tools', () => {
  it('lists Projects', async () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({ name: 'list_projects' });

    expect(resultJson(result)).toEqual([
      { id: website.id, name: 'Website', createdAt: iso(website.createdAt) },
    ]);
    await client.close();
  });

  it('creates a Project', async () => {
    const tickets = createTestTickets();
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'create_project',
      arguments: { name: 'Website' },
    });

    expect(resultJson(result)).toMatchObject({ name: 'Website' });
    expect(tickets.listProjects().map(({ name }) => name)).toEqual(['Website']);
    await client.close();
  });

  it("returns the module's message when a Project name is taken", async () => {
    const tickets = createTestTickets();
    tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'create_project',
      arguments: { name: 'website' },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(
      'A Project named "Website" already exists. Choose another name.',
    );
    await client.close();
  });

  it('renames a Project', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'rename_project',
      arguments: { id: project.id, name: 'Marketing site' },
    });

    expect(resultJson(result)).toMatchObject({
      id: project.id,
      name: 'Marketing site',
    });
    expect(tickets.listProjects().map(({ name }) => name)).toEqual([
      'Marketing site',
    ]);
    await client.close();
  });

  it("returns the module's message when a rename is refused", async () => {
    const tickets = createTestTickets();
    tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    const client = await connectMcpClient(tickets);

    const taken = await client.callTool({
      name: 'rename_project',
      arguments: { id: app.id, name: 'website' },
    });
    const missing = await client.callTool({
      name: 'rename_project',
      arguments: { id: 999, name: 'Docs' },
    });

    expect(taken.isError).toBe(true);
    expect(resultText(taken)).toBe(
      'A Project named "Website" already exists. Choose another name.',
    );
    expect(missing.isError).toBe(true);
    expect(resultText(missing)).toBe('There is no Project with id 999.');
    await client.close();
  });
});

describe('Ticket tools', () => {
  it('lists archived Tickets only when asked to include them', async () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: website.id, title: 'Active' });
    const old = tickets.createTicket({ projectId: website.id, title: 'Old' });
    tickets.archiveTicket(old.number);
    const client = await connectMcpClient(tickets);

    const titles = async (args: Record<string, unknown>) => {
      const result = await client.callTool({
        name: 'list_tickets',
        arguments: args,
      });
      return (
        resultJson(result) as { tickets: { title: string }[] }
      ).tickets.map(({ title }) => title);
    };

    expect(await titles({})).toEqual(['Active']);
    expect(await titles({ includeArchived: false })).toEqual(['Active']);
    expect(await titles({ includeArchived: true })).toEqual(['Active', 'Old']);
    await client.close();
  });

  it('lists Tickets filtered by Project and Status', async () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    tickets.createTicket({ projectId: website.id, title: 'Waiting' });
    const started = tickets.createTicket({
      projectId: website.id,
      title: 'Started',
      status: 'In progress',
    });
    tickets.createTicket({
      projectId: app.id,
      title: 'Elsewhere',
      status: 'In progress',
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'list_tickets',
      arguments: {
        projectId: website.id,
        status: 'In progress',
        includeArchived: true,
      },
    });

    expect(resultJson(result)).toEqual({
      tickets: [
        {
          number: started.number,
          title: 'Started',
          status: 'In progress',
          labels: [],
          blocked: false,
        },
      ],
      nextCursor: null,
      total: 1,
    });
    await client.close();
  });

  it('lists whole Tickets in full detail, and only summaries by default', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
    });
    const client = await connectMcpClient(tickets);

    const summary = await client.callTool({
      name: 'list_tickets',
      arguments: {},
    });
    const full = await client.callTool({
      name: 'list_tickets',
      arguments: { detail: 'full' },
    });
    const { tools } = await client.listTools();
    const listTickets = tools.find(({ name }) => name === 'list_tickets');

    expect(resultJson(summary)).toEqual({
      tickets: [
        {
          number: ticket.number,
          title: 'Fix the header',
          status: 'Todo',
          labels: [],
          blocked: false,
          projectId: project.id,
        },
      ],
      nextCursor: null,
      total: 1,
    });
    expect(resultJson(full)).toEqual({
      tickets: [
        {
          ...ticket,
          createdAt: iso(ticket.createdAt),
          updatedAt: iso(ticket.updatedAt),
        },
      ],
      nextCursor: null,
      total: 1,
    });
    expect(Object.keys(listTickets?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['detail']),
    );
    expect(listTickets?.inputSchema.properties).not.toHaveProperty(
      'includeDescription',
    );
    await client.close();
  });

  it('lists Tickets in any of several Statuses', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Waiting' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Finished',
      status: 'Done',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Started',
      status: 'In progress',
    });
    const client = await connectMcpClient(tickets);

    const open = await client.callTool({
      name: 'list_tickets',
      arguments: { status: ['Todo', 'In progress'] },
    });
    const empty = await client.callTool({
      name: 'list_tickets',
      arguments: { status: [] },
    });
    const unknown = await client.callTool({
      name: 'list_tickets',
      arguments: { status: ['Todo', 'Blocked'] },
    });

    expect(
      (resultJson(open) as { tickets: { title: string }[] }).tickets.map(
        ({ title }) => title,
      ),
    ).toEqual(['Waiting', 'Started']);
    expect(empty.isError).toBe(true);
    expect(resultText(empty)).toBe(
      'Choose at least one Status, or leave status out.',
    );
    expect(unknown.isError).toBe(true);
    expect(resultText(unknown)).toMatch(/status/);
    await client.close();
  });

  it('lists only unclaimed Tickets when finding ready work', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const unclaimed = tickets.createTicket({
      projectId: project.id,
      title: 'Unclaimed',
    });
    const claimed = tickets.createTicket({
      projectId: project.id,
      title: 'Claimed',
    });
    tickets.claimTicket(claimed.number, { agentRunId: 'run-1' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'list_tickets',
      arguments: { status: 'Todo', blocked: false, claimed: false },
    });

    expect(
      (resultJson(result) as { tickets: { number: number }[] }).tickets.map(
        ({ number }) => number,
      ),
    ).toEqual([unclaimed.number]);
    await client.close();
  });

  it('gets a Ticket by its number', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      description: '## Steps\n\n- Open the page',
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { number: 1 },
    });

    expect(resultJson(result)).toMatchObject({
      number: 1,
      title: 'Fix the header',
      description: '## Steps\n\n- Open the page',
      status: 'Todo',
    });
    await client.close();
  });

  it('lets an Agent claim and release a Ticket', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    const client = await connectMcpClient(tickets);

    const claimed = await client.callTool({
      name: 'claim_ticket',
      arguments: {
        number: ticket.number,
        agentRunId: 'run-1',
        agentName: 'Frontend Agent',
      },
    });
    const conflict = await client.callTool({
      name: 'claim_ticket',
      arguments: { number: ticket.number, agentRunId: 'run-2' },
    });
    const released = await client.callTool({
      name: 'release_ticket_claim',
      arguments: { number: ticket.number, agentRunId: 'run-1' },
    });

    expect(resultJson(claimed)).toMatchObject({
      number: ticket.number,
      claim: { agentRunId: 'run-1', agentName: 'Frontend Agent' },
    });
    expect(conflict.isError).toBe(true);
    expect(resultText(conflict)).toBe(
      `Ticket #${ticket.number} is already claimed by Frontend Agent (run-1).`,
    );
    expect(resultJson(released)).toMatchObject({
      number: ticket.number,
      claim: null,
    });
    await client.close();
  });

  it('says when a Ticket does not exist', async () => {
    const client = await connectMcpClient(createTestTickets());

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { number: 42 },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('There is no Ticket #42.');
    await client.close();
  });

  it('creates a Ticket that the Board then lists', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'create_ticket',
      arguments: {
        projectId: project.id,
        title: 'Fix the header',
        description: 'It overlaps the logo.',
        status: 'In progress',
      },
    });

    expect(resultJson(result)).toMatchObject({
      number: 1,
      title: 'Fix the header',
      status: 'In progress',
    });
    expect(
      tickets.listTickets({ projectId: project.id }).map(({ title }) => title),
    ).toEqual(['Fix the header']);
    await client.close();
  });

  it('lists and creates Tickets by Project name', async () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    tickets.createProject({ name: 'App' });
    const client = await connectMcpClient(tickets);

    const created = await client.callTool({
      name: 'create_ticket',
      arguments: { projectName: 'website', title: 'Fix the header' },
    });
    const listed = await client.callTool({
      name: 'list_tickets',
      arguments: { projectName: 'WEBSITE' },
    });
    const stale = await client.callTool({
      name: 'create_ticket',
      arguments: { projectName: 'Ticket', title: 'Lost' },
    });
    const mismatched = await client.callTool({
      name: 'list_tickets',
      arguments: { projectId: website.id, projectName: 'App' },
    });
    const neither = await client.callTool({
      name: 'create_ticket',
      arguments: { title: 'Nowhere' },
    });

    expect(resultJson(created)).toMatchObject({
      title: 'Fix the header',
      projectId: website.id,
    });
    expect(resultJson(listed)).toMatchObject({
      tickets: [{ title: 'Fix the header' }],
    });
    expect(stale.isError).toBe(true);
    expect(resultText(stale)).toBe(
      'There is no Project named "Ticket". The Projects are: "App", "Website".',
    );
    expect(mismatched.isError).toBe(true);
    expect(resultText(mismatched)).toBe(
      `Project ${website.id} is "Website", not "App". Give projectId or projectName, or both for the same Project.`,
    );
    expect(neither.isError).toBe(true);
    expect(resultText(neither)).toBe(
      'Choose a Project by projectId or projectName.',
    );
    await client.close();
  });

  it("returns the module's validation message for a bad Ticket", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'create_ticket',
      arguments: { projectId: project.id, title: '   ' },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('Enter a title.');
    await client.close();
  });

  it('updates only the fields given', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, status: 'In progress' },
    });

    expect(resultJson(result)).toMatchObject({
      number: 1,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
      status: 'In progress',
    });
    expect(tickets.getTicket(1)).toMatchObject({
      title: 'Fix the header',
      description: 'It overlaps the logo.',
      status: 'In progress',
    });
    await client.close();
  });

  it("returns the module's message when an update breaks the rules", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Fix the header' });
    const client = await connectMcpClient(tickets);

    const blank = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, title: '   ' },
    });
    const missing = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 42, status: 'Done' },
    });

    expect(blank.isError).toBe(true);
    expect(resultText(blank)).toBe('Enter a title.');
    expect(missing.isError).toBe(true);
    expect(resultText(missing)).toBe('There is no Ticket #42.');
    expect(tickets.getTicket(1).title).toBe('Fix the header');
    await client.close();
  });

  it('archives a Ticket and restores it', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Fix the header' });
    const client = await connectMcpClient(tickets);

    const archived = await client.callTool({
      name: 'archive_ticket',
      arguments: { number: 1 },
    });

    expect(resultJson(archived)).toMatchObject({ number: 1, archived: true });
    expect(tickets.listTickets()).toEqual([]);

    const restored = await client.callTool({
      name: 'restore_ticket',
      arguments: { number: 1 },
    });

    expect(resultJson(restored)).toMatchObject({ number: 1, archived: false });
    expect(tickets.listTickets().map(({ title }) => title)).toEqual([
      'Fix the header',
    ]);
    await client.close();
  });

  it('says when the Ticket to archive or restore does not exist', async () => {
    const client = await connectMcpClient(createTestTickets());

    for (const name of ['archive_ticket', 'restore_ticket']) {
      const result = await client.callTool({ name, arguments: { number: 42 } });

      expect(result.isError, name).toBe(true);
      expect(resultText(result), name).toBe('There is no Ticket #42.');
    }
    await client.close();
  });
});

describe('Label tools', () => {
  it('creates a Ticket with labels and gets them back', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const created = await client.callTool({
      name: 'create_ticket',
      arguments: {
        projectId: project.id,
        title: 'Fix the header',
        labels: ['needs-triage', 'Bug'],
      },
    });
    const fetched = await client.callTool({
      name: 'get_ticket',
      arguments: { number: 1 },
    });

    expect(resultJson(created)).toMatchObject({
      labels: ['bug', 'needs-triage'],
    });
    expect(resultJson(fetched)).toMatchObject({
      labels: ['bug', 'needs-triage'],
    });
    await client.close();
  });

  it('adds and removes labels on a Ticket', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Fix the header' });
    const client = await connectMcpClient(tickets);

    const added = await client.callTool({
      name: 'add_ticket_labels',
      arguments: { number: 1, labels: ['bug', 'needs-triage'] },
    });
    const removed = await client.callTool({
      name: 'remove_ticket_labels',
      arguments: { number: 1, labels: ['needs-triage'] },
    });

    expect(resultJson(added)).toMatchObject({
      number: 1,
      labels: ['bug', 'needs-triage'],
    });
    expect(resultJson(removed)).toMatchObject({ number: 1, labels: ['bug'] });
    expect(tickets.getTicket(1).labels).toEqual(['bug']);
    await client.close();
  });

  it("returns the module's message for a bad label or missing Ticket", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Fix the header' });
    const client = await connectMcpClient(tickets);

    const blank = await client.callTool({
      name: 'add_ticket_labels',
      arguments: { number: 1, labels: ['  '] },
    });
    const missing = await client.callTool({
      name: 'remove_ticket_labels',
      arguments: { number: 42, labels: ['bug'] },
    });

    expect(blank.isError).toBe(true);
    expect(resultText(blank)).toBe('Enter a label.');
    expect(missing.isError).toBe(true);
    expect(resultText(missing)).toBe('There is no Ticket #42.');
    await client.close();
  });

  it('swaps labels and changes the Status in one update_ticket call', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      labels: ['bug', 'needs-triage'],
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: {
        number: 1,
        status: 'In progress',
        removeLabels: ['needs-triage'],
        addLabels: ['ready-for-agent'],
      },
    });

    expect(resultJson(result)).toMatchObject({
      status: 'In progress',
      labels: ['bug', 'ready-for-agent'],
    });
    await client.close();
  });

  it('lists the labels in use', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      labels: ['needs-triage', 'bug'],
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({ name: 'list_labels' });

    expect(resultJson(result)).toEqual(['bug', 'needs-triage']);
    await client.close();
  });

  it('lists only Tickets with every given label', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Ready bug',
      labels: ['bug', 'ready-for-agent'],
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Bug',
      labels: ['bug'],
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'list_tickets',
      arguments: { labels: ['bug', 'ready-for-agent'] },
    });

    expect(resultJson(result)).toEqual({
      tickets: [expect.objectContaining({ title: 'Ready bug' })],
      nextCursor: null,
      total: 1,
    });
    await client.close();
  });

  it('searches and pages Tickets, with descriptions in full detail', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of [
      'Header one',
      'Footer',
      'Header two',
      'Header three',
    ]) {
      tickets.createTicket({
        projectId: project.id,
        title,
        description: title,
      });
    }
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'list_tickets',
      arguments: {
        query: 'header',
        limit: 1,
        cursor: 1,
        detail: 'full',
      },
    });

    expect(resultJson(result)).toEqual({
      tickets: [
        expect.objectContaining({
          title: 'Header two',
          description: 'Header two',
        }),
      ],
      nextCursor: 3,
      total: 3,
    });
    await client.close();
  });

  it('lists Tickets in Board order when asked', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of ['First', 'Second']) {
      tickets.createTicket({ projectId: project.id, title });
    }
    tickets.reorderTickets({
      projectId: project.id,
      status: 'Todo',
      ticketNumbers: [2, 1],
    });
    const client = await connectMcpClient(tickets);

    const board = await client.callTool({
      name: 'list_tickets',
      arguments: { projectId: project.id, sort: 'position' },
    });
    const noProject = await client.callTool({
      name: 'list_tickets',
      arguments: { sort: 'position' },
    });
    const unknown = await client.callTool({
      name: 'list_tickets',
      arguments: { projectId: project.id, sort: 'updated' },
    });

    expect(
      (resultJson(board) as { tickets: { title: string }[] }).tickets.map(
        ({ title }) => title,
      ),
    ).toEqual(['Second', 'First']);
    expect(noProject.isError).toBe(true);
    expect(resultText(noProject)).toBe(
      'Sorting by position needs a Project, since Board order exists only within one: give projectId or projectName.',
    );
    expect(unknown.isError).toBe(true);
    expect(resultText(unknown)).toMatch(/sort/);
    await client.close();
  });

  it('explains a bad page size', async () => {
    const client = await connectMcpClient(createTestTickets());

    const result = await client.callTool({
      name: 'list_tickets',
      arguments: { limit: 500 },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('Choose a limit from 1 to 200.');
    await client.close();
  });
});

/** How a Date comes back in a tool result's JSON. */
function iso(date: Date): string {
  return date.toISOString();
}

describe('Batch tools', () => {
  it('changes several Tickets in one update_tickets call', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of ['A', 'B']) {
      tickets.createTicket({
        projectId: project.id,
        title,
        labels: ['needs-triage'],
      });
    }
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_tickets',
      arguments: {
        ticketNumbers: [1, 2],
        status: 'Done',
        removeLabels: ['needs-triage'],
        addLabels: ['wontfix'],
      },
    });

    expect(resultJson(result)).toMatchObject({
      updated: [
        { number: 1, status: 'Done', labels: ['wontfix'] },
        { number: 2, status: 'Done', labels: ['wontfix'] },
      ],
      failed: [],
    });
    expect(tickets.getTicket(2)).toMatchObject({
      status: 'Done',
      labels: ['wontfix'],
    });
    await client.close();
  });

  it('reports a partly failed batch as an error that names each Ticket', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'A' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_tickets',
      arguments: { ticketNumbers: [1, 42], status: 'Done' },
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(resultText(result))).toMatchObject({
      updated: [{ number: 1, status: 'Done' }],
      failed: [{ number: 42, error: 'There is no Ticket #42.' }],
    });
    await client.close();
  });

  it('refuses a batch over the size limit and says what the limit is', async () => {
    const client = await connectMcpClient(createTestTickets());

    const result = await client.callTool({
      name: 'update_tickets',
      arguments: {
        ticketNumbers: Array.from({ length: 51 }, (_, index) => index + 1),
        status: 'Done',
      },
    });
    const { tools } = await client.listTools();

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('Choose at most 50 Tickets at a time.');
    expect(
      tools.find((tool) => tool.name === 'update_tickets')?.description,
    ).toMatch(/at most 50/);
    await client.close();
  });
});

describe('Batch create tool', () => {
  it('creates several Tickets in a Project given by name', async () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    tickets.createProject({ name: 'App' });
    const client = await connectMcpClient(tickets);
    const call = (args: Record<string, unknown>) =>
      client.callTool({
        name: 'create_tickets',
        arguments: { ...args, tickets: [{ title: 'One' }, { title: 'Two' }] },
      });

    const created = await call({ projectName: 'website' });
    const stale = await call({ projectName: 'Ticket' });
    const mismatched = await call({
      projectId: website.id,
      projectName: 'App',
    });
    const neither = await call({});

    expect(resultJson(created)).toEqual({ numbers: [1, 2] });
    expect(tickets.getTicket(1).projectId).toBe(website.id);
    expect(resultText(stale)).toBe(
      'There is no Project named "Ticket". The Projects are: "App", "Website".',
    );
    expect(resultText(mismatched)).toBe(
      `Project ${website.id} is "Website", not "App". Give projectId or projectName, or both for the same Project.`,
    );
    expect(resultText(neither)).toBe(
      'Choose a Project by projectId or projectName.',
    );
    for (const refused of [stale, mismatched, neither]) {
      expect(refused.isError).toBe(true);
    }
    expect(tickets.listTickets({})).toHaveLength(2);
    await client.close();
  });

  it('creates several Tickets with Blockers by position and lists their numbers', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'create_tickets',
      arguments: {
        projectId: project.id,
        tickets: [
          {
            title: 'Design',
            description: 'Two options.',
            labels: ['design'],
            acceptanceCriteria: [{ text: 'Approved' }],
          },
          { title: 'Build', blockedByPositions: [0] },
        ],
      },
    });

    expect(resultJson(result)).toEqual({ numbers: [1, 2] });
    expect(tickets.getTicket(1)).toMatchObject({
      description: 'Two options.',
      labels: ['design'],
      acceptanceCriteria: [{ text: 'Approved', checked: false }],
    });
    expect(tickets.getTicket(2).blockedBy).toEqual([1]);
    await client.close();
  });

  it('refuses the whole batch, naming the offending Ticket', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'create_tickets',
      arguments: {
        projectId: project.id,
        tickets: [{ title: 'Design' }, { title: '' }],
      },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('Ticket at position 1: Enter a title.');
    expect(tickets.listTickets()).toEqual([]);
    await client.close();
  });
});

describe('Epic tools', () => {
  it('creates an Epic and a child under it, and gets both', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const epic = resultJson(
      await client.callTool({
        name: 'create_ticket',
        arguments: {
          projectId: project.id,
          title: 'Checkout',
          description: 'Shared context.',
          type: 'Epic',
        },
      }),
    );
    const first = resultJson(
      await client.callTool({
        name: 'create_ticket',
        arguments: { projectId: project.id, title: 'Pay', epicNumber: 1 },
      }),
    );
    await client.callTool({
      name: 'create_tickets',
      arguments: {
        projectId: project.id,
        epicNumber: 1,
        tickets: [{ title: 'Refund' }],
      },
    });
    tickets.addBlocker({ blocker: 2, blocked: 3 });

    expect(epic).toMatchObject({ number: 1, type: 'Epic' });
    expect(first).toMatchObject({
      number: 2,
      type: 'Ticket',
      epic: { number: 1, title: 'Checkout' },
    });
    expect(
      resultJson(
        await client.callTool({ name: 'get_ticket', arguments: { number: 1 } }),
      ),
    ).toMatchObject({
      description: 'Shared context.',
      status: 'Todo',
      children: [
        {
          number: 2,
          title: 'Pay',
          status: 'Todo',
          archived: false,
          blockedBy: [],
          blocked: false,
        },
        {
          number: 3,
          title: 'Refund',
          status: 'Todo',
          archived: false,
          blockedBy: [2],
          blocked: true,
        },
      ],
    });
    expect(
      resultJson(
        await client.callTool({ name: 'get_ticket', arguments: { number: 3 } }),
      ),
    ).toMatchObject({ epic: { number: 1, title: 'Checkout' }, children: [] });
    await client.close();
  });

  it('attaches and detaches a Ticket', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Pay',
    });
    const client = await connectMcpClient(tickets);

    const attached = await client.callTool({
      name: 'attach_to_epic',
      arguments: { epic: epic.number, ticket: ticket.number },
    });
    expect(resultJson(attached)).toMatchObject({
      number: ticket.number,
      epic: { number: epic.number, title: 'Checkout' },
    });

    const detached = await client.callTool({
      name: 'detach_from_epic',
      arguments: { number: ticket.number },
    });
    expect(resultJson(detached)).toMatchObject({
      number: ticket.number,
      epic: null,
    });
    await client.close();
  });

  it("refuses an Epic's Status by hand and an Epic as a child, with clear errors", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Payments',
      type: 'Epic',
    });
    const client = await connectMcpClient(tickets);

    const status = await client.callTool({
      name: 'update_ticket',
      arguments: { number: epic.number, status: 'Done' },
    });
    const attach = await client.callTool({
      name: 'attach_to_epic',
      arguments: { epic: epic.number, ticket: other.number },
    });

    expect(status.isError).toBe(true);
    expect(resultText(status)).toBe(
      `Ticket #${epic.number} is an Epic. Its Status follows its child Tickets and cannot be set by hand.`,
    );
    expect(attach.isError).toBe(true);
    expect(resultText(attach)).toBe(
      `Ticket #${other.number} is an Epic, and an Epic cannot be a child of another Epic.`,
    );
    await client.close();
  });

  it("keeps an Epic's type: update_ticket has no type to change", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const client = await connectMcpClient(tickets);

    await client.callTool({
      name: 'update_ticket',
      arguments: { number: epic.number, type: 'Ticket', title: 'Pay' },
    });

    expect(tickets.getTicket(epic.number)).toMatchObject({
      type: 'Epic',
      title: 'Pay',
    });
    await client.close();
  });
});

describe('Comment tools', () => {
  function ticketsWithOne() {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    return { tickets, ticket };
  }

  it('adds a comment written by an Agent', async () => {
    const { tickets, ticket } = ticketsWithOne();
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'add_comment',
      arguments: { number: ticket.number, body: 'Started on it.' },
    });

    const [comment] = tickets.listComments(ticket.number);
    expect(comment).toMatchObject({ author: 'agent', body: 'Started on it.' });
    expect(resultJson(result)).toEqual({
      id: comment.id,
      ticketNumber: ticket.number,
      author: 'agent',
      body: 'Started on it.',
      createdAt: iso(comment.createdAt),
      editedAt: null,
    });
    await client.close();
  });

  it("lists a Ticket's comments, oldest first", async () => {
    const { tickets, ticket } = ticketsWithOne();
    tickets.addComment(ticket.number, {
      body: 'From the User',
      author: 'user',
    });
    tickets.addComment(ticket.number, {
      body: 'From an Agent',
      author: 'agent',
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'list_comments',
      arguments: { number: ticket.number },
    });

    expect(resultJson(result)).toMatchObject([
      { author: 'user', body: 'From the User' },
      { author: 'agent', body: 'From an Agent' },
    ]);
    await client.close();
  });

  it("edits and removes an Agent's comment", async () => {
    const { tickets, ticket } = ticketsWithOne();
    const comment = tickets.addComment(ticket.number, {
      body: 'Started.',
      author: 'agent',
    });
    const client = await connectMcpClient(tickets);

    const edited = await client.callTool({
      name: 'edit_comment',
      arguments: { id: comment.id, body: 'Started on the header.' },
    });

    expect(resultJson(edited)).toMatchObject({
      id: comment.id,
      body: 'Started on the header.',
      editedAt: expect.any(String),
    });

    const removed = await client.callTool({
      name: 'remove_comment',
      arguments: { id: comment.id },
    });

    expect(resultJson(removed)).toEqual({ removed: comment.id });
    expect(tickets.listComments(ticket.number)).toEqual([]);
    await client.close();
  });

  it("refuses to edit or remove the User's comment", async () => {
    const { tickets, ticket } = ticketsWithOne();
    const comment = tickets.addComment(ticket.number, {
      body: 'By the User',
      author: 'user',
    });
    const client = await connectMcpClient(tickets);

    const edited = await client.callTool({
      name: 'edit_comment',
      arguments: { id: comment.id, body: 'Changed' },
    });
    const removed = await client.callTool({
      name: 'remove_comment',
      arguments: { id: comment.id },
    });

    for (const result of [edited, removed]) {
      expect(result.isError).toBe(true);
      expect(resultText(result)).toBe(
        `Comment ${comment.id} was written by the User. Agents can only edit or remove comments written by an Agent.`,
      );
    }
    expect(tickets.listComments(ticket.number)).toEqual([comment]);
    await client.close();
  });
});

describe('Blocker tools', () => {
  function ticketsWithThree() {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of ['Design', 'Build', 'Ship']) {
      tickets.createTicket({ projectId: project.id, title });
    }
    return { tickets, project };
  }

  it('adds, lists and removes a Blocker', async () => {
    const { tickets, project } = ticketsWithThree();
    const client = await connectMcpClient(tickets);

    const added = await client.callTool({
      name: 'add_blocker',
      arguments: { blocker: 1, blocked: 2 },
    });
    const listed = await client.callTool({
      name: 'list_blockers',
      arguments: { number: 2 },
    });
    const removed = await client.callTool({
      name: 'remove_blocker',
      arguments: { blocker: 1, blocked: 2 },
    });

    expect(resultJson(added)).toMatchObject({
      number: 2,
      blockedBy: [1],
      blocked: true,
    });
    expect(resultJson(listed)).toEqual({
      blockedBy: [
        {
          number: 1,
          title: 'Design',
          status: 'Todo',
          projectId: project.id,
          archived: false,
          resolved: false,
        },
      ],
      blocks: [],
    });
    expect(resultJson(removed)).toMatchObject({
      number: 2,
      blockedBy: [],
      blocked: false,
    });
    await client.close();
  });

  it('refuses to remove a Blocker that does not exist', async () => {
    const { tickets } = ticketsWithThree();
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'remove_blocker',
      arguments: { blocker: 9999, blocked: 1 },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('There is no Ticket #9999.');
    await client.close();
  });

  it('lists only unblocked Tickets, to find work that is ready', async () => {
    const { tickets } = ticketsWithThree();
    tickets.addBlocker({ blocker: 1, blocked: 2 });
    tickets.addBlocker({ blocker: 2, blocked: 3 });
    const client = await connectMcpClient(tickets);

    const ready = await client.callTool({
      name: 'list_tickets',
      arguments: { status: 'Todo', blocked: false },
    });

    expect(resultJson(ready)).toMatchObject({
      tickets: [{ number: 1, blocked: false }],
    });
    await client.close();
  });

  it("returns the module's message for a self-dependency, cycle or missing Ticket", async () => {
    const { tickets } = ticketsWithThree();
    tickets.addBlocker({ blocker: 1, blocked: 2 });
    const client = await connectMcpClient(tickets);

    const self = await client.callTool({
      name: 'add_blocker',
      arguments: { blocker: 3, blocked: 3 },
    });
    const cycle = await client.callTool({
      name: 'add_blocker',
      arguments: { blocker: 2, blocked: 1 },
    });
    const missing = await client.callTool({
      name: 'list_blockers',
      arguments: { number: 42 },
    });

    expect(self.isError).toBe(true);
    expect(resultText(self)).toBe('A Ticket cannot block itself.');
    expect(cycle.isError).toBe(true);
    expect(resultText(cycle)).toBe(
      '#2 cannot block #1, because #1 already blocks #2: #1 → #2.',
    );
    expect(missing.isError).toBe(true);
    expect(resultText(missing)).toBe('There is no Ticket #42.');
    await client.close();
  });
});

describe('Acceptance criteria tools', () => {
  it('creates a Ticket with acceptance criteria and gets them back in order', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const created = await client.callTool({
      name: 'create_ticket',
      arguments: {
        projectId: project.id,
        title: 'Fix the header',
        acceptanceCriteria: [
          { text: 'The logo is centred' },
          { text: 'The menu collapses on phones', checked: true },
        ],
      },
    });
    const got = await client.callTool({
      name: 'get_ticket',
      arguments: { number: 1 },
    });

    const [logo, menu] = tickets.getTicket(1).acceptanceCriteria;
    const expected = [
      { id: logo.id, text: 'The logo is centred', checked: false },
      { id: menu.id, text: 'The menu collapses on phones', checked: true },
    ];
    expect(resultJson(created)).toMatchObject({ acceptanceCriteria: expected });
    expect(resultJson(got)).toMatchObject({ acceptanceCriteria: expected });
    await client.close();
  });

  it('adds, edits, removes and reorders criteria with update_ticket', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      acceptanceCriteria: [
        { text: 'The logo is centred', checked: true },
        { text: 'The menu collapses on phones' },
        { text: 'The header is sticky', checked: true },
      ],
    });
    const [logo, menu] = ticket.acceptanceCriteria;
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: {
        number: ticket.number,
        acceptanceCriteria: [
          { id: menu.id, text: 'The menu collapses below 40rem' },
          { text: 'The search box is visible' },
          { id: logo.id, text: 'The logo is centred' },
        ],
      },
    });

    const expected = tickets.getTicket(ticket.number).acceptanceCriteria;
    expect(expected.map(({ text, checked }) => ({ text, checked }))).toEqual([
      { text: 'The menu collapses below 40rem', checked: false },
      { text: 'The search box is visible', checked: false },
      { text: 'The logo is centred', checked: true },
    ]);
    expect(resultJson(result)).toMatchObject({ acceptanceCriteria: expected });
    await client.close();
  });

  it('checks and unchecks criteria with set_acceptance_criteria_checked', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      acceptanceCriteria: [
        { text: 'The logo is centred', checked: true },
        { text: 'The menu collapses on phones' },
      ],
    });
    const [logo, menu] = ticket.acceptanceCriteria;
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'set_acceptance_criteria_checked',
      arguments: {
        number: ticket.number,
        criteria: [
          { id: logo.id, checked: false },
          { id: menu.id, checked: true },
        ],
      },
    });

    const expected = [
      { id: logo.id, text: 'The logo is centred', checked: false },
      { id: menu.id, text: 'The menu collapses on phones', checked: true },
    ];
    expect(resultJson(result)).toMatchObject({
      status: 'Todo',
      acceptanceCriteria: expected,
    });
    expect(tickets.getTicket(ticket.number).acceptanceCriteria).toEqual(
      expected,
    );
    await client.close();
  });

  it("returns the module's message for a bad criterion", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    const client = await connectMcpClient(tickets);

    const empty = await client.callTool({
      name: 'update_ticket',
      arguments: { number: ticket.number, acceptanceCriteria: [{ text: ' ' }] },
    });
    const unknown = await client.callTool({
      name: 'set_acceptance_criteria_checked',
      arguments: {
        number: ticket.number,
        criteria: [{ id: 7, checked: true }],
      },
    });

    expect(empty.isError).toBe(true);
    expect(resultText(empty)).toBe('Enter text for each acceptance criterion.');
    expect(unknown.isError).toBe(true);
    expect(resultText(unknown)).toBe(
      `Ticket #${ticket.number} has no acceptance criterion 7.`,
    );
    await client.close();
  });
});

describe('Cycle tools', () => {
  /** A Project with Tickets #1 to #3, and an MCP client on it. */
  async function cycleSetup() {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of ['One', 'Two', 'Three']) {
      tickets.createTicket({ projectId: project.id, title });
    }
    const client = await connectMcpClient(tickets);
    return { tickets, project, client };
  }

  it("creates, renames and lists a Project's Cycles with their Tickets", async () => {
    const { tickets, project, client } = await cycleSetup();

    const created = resultJson(
      await client.callTool({
        name: 'create_cycle',
        arguments: { projectId: project.id, title: 'Beta' },
      }),
    ) as { id: number };
    await client.callTool({
      name: 'plan_ticket',
      arguments: { cycleId: created.id, number: 2 },
    });
    await client.callTool({
      name: 'rename_cycle',
      arguments: { id: created.id, title: 'Public beta' },
    });
    const listed = await client.callTool({
      name: 'list_cycles',
      arguments: { projectId: project.id },
    });

    const cycle = tickets.getCycle(created.id);
    expect(resultJson(listed)).toEqual([
      {
        id: created.id,
        projectId: project.id,
        title: 'Public beta',
        state: 'Prepared',
        ticketNumbers: [2],
        createdAt: iso(cycle.createdAt),
        archivedAt: null,
      },
    ]);
    await client.close();
  });

  it("keeps an Archived Cycle's finished Tickets out of the Backlog", async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTickets({ cycleId: cycle.id, ticketNumbers: [1, 2] });
    tickets.updateTicket(1, { status: 'Done' });
    tickets.startCycle(cycle.id);
    tickets.archiveCycle(cycle.id);

    const listed = await client.callTool({
      name: 'list_tickets',
      arguments: { projectId: project.id, cycleId: null },
    });
    const { tools } = await client.listTools();

    expect(
      (resultJson(listed) as { tickets: { number: number }[] }).tickets.map(
        ({ number }) => number,
      ),
    ).toEqual([2, 3]);
    expect(
      JSON.stringify(
        tools.find((tool) => tool.name === 'list_tickets')?.inputSchema,
      ),
    ).toMatch(/Done Tickets of an Archived Cycle/);
    await client.close();
  });

  it('plans a Ticket out of a Cycle, and lists the Tickets of a Cycle or the Backlog', async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: cycle.id, number: 1 });
    tickets.planTicket({ cycleId: cycle.id, number: 2 });

    const unplanned = await client.callTool({
      name: 'unplan_ticket',
      arguments: { cycleId: cycle.id, number: 2 },
    });
    const numbers = async (cycleId: number | null) =>
      (
        resultJson(
          await client.callTool({
            name: 'list_tickets',
            arguments: { projectId: project.id, cycleId },
          }),
        ) as { tickets: { number: number }[] }
      ).tickets.map(({ number }) => number);

    expect(resultJson(unplanned)).toMatchObject({ ticketNumbers: [1] });
    expect(await numbers(cycle.id)).toEqual([1]);
    expect(await numbers(null)).toEqual([2, 3]);
    await client.close();
  });

  it('plans and unplans several Tickets in one call each', async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    const planned = await client.callTool({
      name: 'plan_tickets',
      arguments: { cycleId: cycle.id, ticketNumbers: [3, 1, 2] },
    });
    const unplanned = await client.callTool({
      name: 'unplan_tickets',
      arguments: { cycleId: cycle.id, ticketNumbers: [2] },
    });

    expect(planned.isError).toBe(false);
    expect(resultJson(planned)).toMatchObject({
      updated: [3, 1, 2],
      failed: [],
      cycle: { id: cycle.id, ticketNumbers: [1, 2, 3] },
    });
    expect(resultJson(unplanned)).toMatchObject({
      updated: [2],
      failed: [],
      cycle: { id: cycle.id, ticketNumbers: [1, 3] },
    });
    await client.close();
  });

  it('reports a partly failed plan_tickets or unplan_tickets call as an error', async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    const planned = await client.callTool({
      name: 'plan_tickets',
      arguments: { cycleId: cycle.id, ticketNumbers: [1, 42] },
    });
    const unplanned = await client.callTool({
      name: 'unplan_tickets',
      arguments: { cycleId: cycle.id, ticketNumbers: [2, 1] },
    });
    const refused = await client.callTool({
      name: 'plan_tickets',
      arguments: { cycleId: 99, ticketNumbers: [1] },
    });

    expect(planned.isError).toBe(true);
    expect(JSON.parse(resultText(planned))).toMatchObject({
      updated: [1],
      failed: [{ number: 42, error: 'There is no Ticket #42.' }],
      cycle: { ticketNumbers: [1] },
    });
    expect(unplanned.isError).toBe(true);
    expect(JSON.parse(resultText(unplanned))).toMatchObject({
      updated: [1],
      failed: [
        { number: 2, error: 'Ticket #2 is not planned into the Cycle "Beta".' },
      ],
      cycle: { ticketNumbers: [] },
    });
    expect(refused.isError).toBe(true);
    expect(resultText(refused)).toBe('There is no Cycle with id 99.');
    await client.close();
  });

  it('starts and archives a Cycle', async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    const started = await client.callTool({
      name: 'start_cycle',
      arguments: { id: cycle.id },
    });
    expect(resultJson(started)).toMatchObject({ state: 'Active' });

    const archived = await client.callTool({
      name: 'archive_cycle',
      arguments: { id: cycle.id },
    });
    expect(resultJson(archived)).toMatchObject({
      state: 'Archived',
      archivedAt: expect.any(String),
    });
    await client.close();
  });

  it('archives the Active Cycle and rolls over only when the call confirms it', async () => {
    const { tickets, project, client } = await cycleSetup();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: beta.id, number: 1 });
    tickets.startCycle(beta.id);
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });

    const refused = await client.callTool({
      name: 'start_cycle',
      arguments: { id: launch.id },
    });
    expect(refused.isError).toBe(true);
    expect(resultText(refused)).toBe(
      'The Cycle "Beta" is Active. Starting another archives it, so confirm that first.',
    );
    expect(tickets.getCycle(beta.id).state).toBe('Active');

    const started = await client.callTool({
      name: 'start_cycle',
      arguments: { id: launch.id, confirmArchiveActive: true },
    });
    expect(resultJson(started)).toMatchObject({
      state: 'Active',
      ticketNumbers: [1],
    });
    expect(tickets.getCycle(beta.id).state).toBe('Archived');
    await client.close();
  });

  it("returns the module's message when a Cycle change is refused", async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.archiveTicket(3);

    const archived = await client.callTool({
      name: 'plan_ticket',
      arguments: { cycleId: cycle.id, number: 3 },
    });
    const untitled = await client.callTool({
      name: 'create_cycle',
      arguments: { projectId: project.id, title: ' ' },
    });
    const missing = await client.callTool({
      name: 'archive_cycle',
      arguments: { id: 99 },
    });

    expect(
      [archived, untitled, missing].map((result) => result.isError),
    ).toEqual([true, true, true]);
    expect(resultText(archived)).toBe(
      'Ticket #3 is archived. Restore it before planning it into a Cycle.',
    );
    expect(resultText(untitled)).toBe('Enter a title.');
    expect(resultText(missing)).toBe('There is no Cycle with id 99.');
    await client.close();
  });
});
