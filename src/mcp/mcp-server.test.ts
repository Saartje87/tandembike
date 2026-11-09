// @vitest-environment node

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';

import { connectMcpClient, resultJson, resultText } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { handleMcpRequest, maxInstructionsLength } from './mcp-server';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Files one Ticket with file_tickets and answers with what get_ticket returns
 * for it, or the refusal. The batch fields (project, Epic, Origin, Cycle) go
 * beside `tickets`; the rest describe the Ticket.
 */
async function fileTicket(
  client: Client,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const {
    projectId,
    projectName,
    epicNumber,
    originNumber,
    cycleId,
    detail: _detail,
    ...rest
  } = args;
  const filed = await client.callTool({
    name: 'file_tickets',
    arguments: {
      projectId,
      projectName,
      epicNumber,
      originNumber,
      cycleId,
      tickets: [rest],
    },
  });
  if (filed.isError) {
    return filed as CallToolResult;
  }
  const { numbers } = resultJson(filed) as { numbers: number[] };
  return (await client.callTool({
    name: 'get_ticket',
    arguments: { number: numbers[0] },
  })) as CallToolResult;
}

describe('MCP server and Project agent settings', () => {
  it('offers no tool for them and never shows the repository path', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, {
      repositoryPath: '/tmp',
      checkCommand: 'npm run check',
      prepareCommand: 'npm ci',
      autoMerge: true,
    });
    const client = await connectMcpClient(tickets);

    const { tools } = await client.listTools();
    const listed = resultText(
      await client.callTool({
        name: 'get_project',
        arguments: { allProjects: true },
      }),
    );

    expect(tools.map((tool) => tool.name).join(' ')).not.toMatch(
      /repository|agent_setting|parallel|agent_mode|auto_merge/,
    );
    expect(listed).not.toMatch(
      /repositoryPath|parallelRuns|agentMode|autopilot|autoMerge|spendCeiling|checkCommand|prepareCommand|npm ci|npm run check|\/tmp/,
    );
    await client.close();
  });
});

describe('MCP server and Conversations', () => {
  it('offers no tool to start, reply to or stop an Agent run, only a read-only one to read them', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    const touching = tools.filter((tool) =>
      /conversation|agent_run|reply|stop|send/.test(tool.name),
    );
    expect(touching.map((tool) => tool.name)).toEqual(['get_conversations']);
    expect(touching[0].annotations).toMatchObject({ readOnlyHint: true });
    await client.close();
  });
});

describe('MCP server', () => {
  it('marks only the core tools to load up front, not deferred', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    expect(
      tools
        .filter((tool) => tool._meta?.['anthropic/alwaysLoad'] === true)
        .map((tool) => tool.name)
        .sort(),
    ).toEqual([
      'add_note',
      'get_ticket',
      'propose_triage',
      'start_work',
      'update_ticket',
    ]);
    expect(
      tools
        .filter((tool) => tool._meta?.['anthropic/alwaysLoad'] !== true)
        .filter((tool) => tool._meta && 'anthropic/alwaysLoad' in tool._meta),
    ).toEqual([]);
    await client.close();
  });

  it('lists every tool with a description', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'abandon_work',
      'add_note',
      'attach',
      'check_criterion',
      'create_cycle',
      'edit_canvas',
      'file_tickets',
      'find_tickets',
      'finish_work',
      'get_canvas',
      'get_conversations',
      'get_project',
      'get_ticket',
      'next_work',
      'open_pr',
      'propose_hand_off',
      'propose_triage',
      'read_attachment',
      'start_work',
      'update_ticket',
      'update_write_up',
    ]);
    for (const tool of tools) {
      expect(tool.description, tool.name).toMatch(/\w{3,}/);
    }
    await client.close();
  });

  it('refuses an unknown top-level field and names it', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Site' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'file_tickets',
      arguments: {
        projectId: project.id,
        tickets: [{ title: 'Typo' }],
        lables: ['bug'],
      },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/Unrecognized key.*"lables"/);
    expect(tickets.listTickets({ projectId: project.id })).toEqual([]);
    await client.close();
  });

  it('refuses an argument to a tool that takes none', async () => {
    const client = await connectMcpClient(createTestTickets());

    const result = await client.callTool({
      name: 'get_project',
      arguments: { includeArchived: true },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/Unrecognized key.*"includeArchived"/);
    await client.close();
  });

  it('refuses an unknown field on a file_tickets Ticket, naming it and its position', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Site' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'file_tickets',
      arguments: {
        projectId: project.id,
        tickets: [{ title: 'Fine' }, { title: 'Typo', tpye: 'Epic' }],
      },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(
      /Unrecognized key.*"tpye".*tickets\[1\]/,
    );
    expect(tickets.listTickets({ projectId: project.id })).toEqual([]);
    await client.close();
  });

  it('refuses an unknown field on an acceptance criterion, naming it', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Site' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'file_tickets',
      arguments: {
        projectId: project.id,
        tickets: [
          {
            title: 'Criteria',
            acceptanceCriteria: [{ text: 'Works', chekced: true }],
          },
        ],
      },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(
      /Unrecognized key.*"chekced".*acceptanceCriteria\[0\]/,
    );
    expect(tickets.listTickets({ projectId: project.id })).toEqual([]);
    await client.close();
  });

  it('publishes every input object, at every depth, as closed to unknown fields', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    for (const tool of tools) {
      const open = openObjects(tool.inputSchema, tool.name);
      expect(open, tool.name).toEqual([]);
    }
    await client.close();
  });

  it('tells Agents how to work with Tickets', async () => {
    const client = await connectMcpClient(createTestTickets());

    const instructions = client.getInstructions();

    expect(instructions).toMatch(/In progress/);
    expect(instructions).toMatch(/Done/);
    expect(instructions).toMatch(/like T42/);
    expect(instructions).not.toMatch(/#\d/);
    expect(instructions).toMatch(/Begin with start_work/);
    expect(instructions).toMatch(/next_work/);
    expect(instructions).toMatch(/End with finish_work/);
    expect(instructions).toMatch(/abandon_work/);
    expect(instructions).toMatch(/add_note/);
    expect(instructions).toMatch(/file_tickets/);
    expect(instructions).toMatch(/Epic/);
    expect(instructions).toMatch(/update_ticket \(addBlockers\)/);
    expect(instructions).toMatch(/check_criterion/);
    expect(instructions).toMatch(/get_project/);
    expect(instructions).toMatch(/create_cycle/);
    expect(instructions).toMatch(/find_tickets/);
    expect(instructions).toMatch(/originNumber/);
    await client.close();
  });

  it("explains the tracker to any client in any repository, leaving each repository's process to it", async () => {
    const client = await connectMcpClient(createTestTickets());

    const instructions = client.getInstructions() ?? '';
    const { tools } = await client.listTools();
    const describe = (name: string) =>
      JSON.stringify(tools.find((tool) => tool.name === name));

    // Which Project: the caller's folder names it (ADR 0036).
    expect(instructions).toMatch(/folder/);
    // General rules that used to live only in one repository's docs.
    expect(instructions).toMatch(/never as a checklist in the description/);
    expect(instructions).toMatch(/one level deep/);
    expect(instructions).toMatch(/its description holds their shared context/);
    expect(instructions).toMatch(/ask the User to start a new session/);
    expect(instructions).toMatch(
      /reconnecting may keep the tool descriptions already loaded/,
    );
    expect(instructions).toMatch(/not direct database access/);
    // Process belongs to each repository, and no client is assumed.
    expect(instructions).not.toMatch(/branch|pull request|\bPR\b/i);
    expect(instructions).not.toMatch(/Claude|Copilot/);
    expect(describe('update_ticket')).toMatch(
      /Agents cannot delete Tickets; the User can, from the app/,
    );
    // Facts that only one repository's docs used to state (T63).
    expect(describe('update_ticket')).toMatch(
      /An Epic cannot be archived while any child is not archived/,
    );
    expect(describe('update_ticket')).toMatch(
      /Blockers between an Epic and its own children are refused/,
    );
    for (const name of [
      'find_tickets',
      'file_tickets',
      'update_ticket',
      'create_cycle',
    ]) {
      expect(describe(name), name).toMatch(
        /Giving both is refused unless they name the same Project/,
      );
    }
    expect(instructions).toMatch(/missing from your list may still exist/);
    await client.close();
  });

  it('writes Ticket numbers as T42 in every tool description', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    expect(
      JSON.stringify(tools.find((tool) => tool.name === 'get_ticket')),
    ).toMatch(/e\.g\. 42 for T42/);
    for (const tool of tools) {
      expect(JSON.stringify(tool), tool.name).not.toMatch(/#\d/);
    }
    await client.close();
  });

  it('keeps each rule left out of the instructions in the tool it concerns', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();
    const describe = (name: string) =>
      JSON.stringify(tools.find((tool) => tool.name === name));

    const moved: [tool: string, rule: RegExp][] = [
      ['file_tickets', /All or nothing/],
      ['file_tickets', /Only earlier positions can be named/],
      ['file_tickets', /write \{\{T:n\}\}/],
      ['update_ticket', /must be resolved \(Done or archived\)/],
      ['update_ticket', /To only check or uncheck criteria/],
      ['check_criterion', /Status stay as they are/],
      ['get_ticket', /an Epic lists its children/],
      ['update_ticket', /An Epic's follows its children and cannot be set/],
      ['get_project', /state \(Prepared, Active or Archived\), ticketNumbers/],
      ['find_tickets', /with null, the Backlog/],
      ['find_tickets', /only Tickets or only Epics \(type:/],
    ];
    for (const [tool, rule] of moved) {
      expect(describe(tool), tool).toMatch(rule);
    }
    await client.close();
  });

  it('points Agents to finish_work for finishing work, not by hand with removeLabels', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    const description =
      tools.find((tool) => tool.name === 'update_ticket')?.description ?? '';
    expect(description).toMatch(/finish_work/);
    expect(description).not.toMatch(/in the same call/);
    expect(description).not.toMatch(
      /needs-triage|needs-info|ready-for-agent|ready-for-human/,
    );
    await client.close();
  });

  it('sends Agents to next_work for ready work, not to a filter recipe', async () => {
    const client = await connectMcpClient(createTestTickets());

    const instructions = client.getInstructions();

    expect(instructions).toMatch(/next_work gives the top ready item/);
    expect(instructions).not.toMatch(/blocked: false/);
    await client.close();
  });

  it('warns that abandoning an In progress Ticket with a PR leaves it In progress', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    expect(
      tools.find((tool) => tool.name === 'abandon_work')?.description,
    ).toMatch(/PR/);
    await client.close();
  });

  it('says that a tandembike start session needs no agentRunId (T1238)', async () => {
    const client = await connectMcpClient(createTestTickets());

    expect(client.getInstructions()).toContain(
      'A `tandembike start` session needs no agentRunId',
    );
    await client.close();
  });

  it('keeps the instructions and every tool description within the cap clients read whole', async () => {
    const client = await connectMcpClient(createTestTickets());

    const instructions = client.getInstructions() ?? '';
    const { tools } = await client.listTools();

    expect(maxInstructionsLength).toBe(3500);
    expect(instructions.length).toBeLessThan(maxInstructionsLength);
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
  it('lists archived Projects too, flagged', async () => {
    const tickets = createTestTickets();
    const old = tickets.createProject({ name: 'Old site' });
    tickets.archiveProject(old.id);
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'get_project',
      arguments: { allProjects: true },
    });

    expect(resultJson(result)).toEqual([
      expect.objectContaining({ name: 'Old site', archived: true }),
    ]);
    await client.close();
  });

  it('finds Tickets by External reference, advising includeArchived for duplicates', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Imported',
      externalReferences: ['ABC-33'],
    });
    tickets.createTicket({ projectId: project.id, title: 'Other' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'find_tickets',
      arguments: { externalReferences: ['ABC-33'], includeArchived: true },
    });
    const { tools } = await client.listTools();
    const listTickets = tools.find((tool) => tool.name === 'find_tickets');

    expect(resultJson(result)).toMatchObject({
      tickets: [{ number: ticket.number }],
      total: 1,
    });
    expect(listTickets?.description).toMatch(
      /with any of given External references/,
    );
    expect(JSON.stringify(listTickets?.inputSchema)).toMatch(
      /any of these.*includeArchived: true when checking for duplicates/,
    );
    await client.close();
  });

  it('hides Tickets of archived Projects unless their Project is named', async () => {
    const tickets = createTestTickets();
    const old = tickets.createProject({ name: 'Old site' });
    const ticket = tickets.createTicket({ projectId: old.id, title: 'Hidden' });
    tickets.archiveProject(old.id);
    const client = await connectMcpClient(tickets);

    const all = await client.callTool({ name: 'find_tickets' });
    const named = await client.callTool({
      name: 'find_tickets',
      arguments: { projectName: 'Old site' },
    });

    expect(resultJson(all)).toMatchObject({ tickets: [], total: 0 });
    expect(resultJson(named)).toMatchObject({
      tickets: [{ number: ticket.number }],
    });
    await client.close();
  });

  it('refuses changing a Ticket of an archived Project with a clear error', async () => {
    const tickets = createTestTickets();
    const old = tickets.createProject({ name: 'Old site' });
    const ticket = tickets.createTicket({ projectId: old.id, title: 'Frozen' });
    tickets.archiveProject(old.id);
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { number: ticket.number, status: 'Done' },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      `Ticket T${ticket.number} is in the archived Project \\"Old site\\". Restore the Project before changing its Tickets.`,
    );
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
        name: 'find_tickets',
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
      name: 'find_tickets',
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
          type: 'Ticket',
          epicNumber: null,
          updatedAt: started.updatedAt.toISOString(),
        },
      ],
      nextCursor: null,
      total: 1,
    });
    await client.close();
  });

  it('lists only Epics or only Tickets with the type filter', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Launch',
      type: 'Epic',
    });
    tickets.createTicket({ projectId: project.id, title: 'Header' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'find_tickets',
      arguments: { projectId: project.id, type: 'Epic' },
    });

    expect(resultJson(result)).toMatchObject({
      tickets: [{ number: epic.number, type: 'Epic' }],
      total: 1,
    });
    await client.close();
  });

  it("returns a child's epic as its number, title and colour only (T1143)", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Launch',
      type: 'Epic',
      externalReferences: ['https://github.com/owner/repo/pull/143'],
    });
    tickets.claimTicket(epic.number, { agentRunId: 'run-1' });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Header',
      epicNumber: epic.number,
    });
    const client = await connectMcpClient(tickets);
    const link = { number: epic.number, title: 'Launch', color: 'red' };

    const read = await client.callTool({
      name: 'get_ticket',
      arguments: { number: child.number },
    });
    const listed = await client.callTool({
      name: 'find_tickets',
      arguments: { epicNumber: epic.number, detail: 'full' },
    });
    const updated = await client.callTool({
      name: 'update_ticket',
      arguments: { number: child.number, title: 'Footer', detail: 'full' },
    });

    type WithEpic = { epic: unknown };
    expect((resultJson(read) as WithEpic).epic).toEqual(link);
    expect(
      (resultJson(listed) as { tickets: WithEpic[] }).tickets[0].epic,
    ).toEqual(link);
    expect((resultJson(updated) as WithEpic).epic).toEqual(link);
    await client.close();
  });

  it("lists only one Epic's children with epicNumber, combined with other filters", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Launch',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Header',
      epicNumber: epic.number,
    });
    tickets.createTicket({ projectId: project.id, title: 'Loose' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'find_tickets',
      arguments: { epicNumber: epic.number, status: 'Todo', blocked: false },
    });

    expect(resultJson(result)).toMatchObject({
      tickets: [{ number: child.number }],
      total: 1,
    });
    await client.close();
  });

  it('gets a Ticket without its description when description is false', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      description: '## Steps\n\n- Open the page',
      labels: ['bug'],
      acceptanceCriteria: [{ text: 'It lines up' }],
    });
    const client = await connectMcpClient(tickets);

    const lean = resultJson(
      await client.callTool({
        name: 'get_ticket',
        arguments: { number: ticket.number, description: false },
      }),
    ) as Record<string, unknown>;
    const full = resultJson(
      await client.callTool({
        name: 'get_ticket',
        arguments: { number: ticket.number },
      }),
    ) as Record<string, unknown>;
    const explicit = resultJson(
      await client.callTool({
        name: 'get_ticket',
        arguments: { number: ticket.number, description: true },
      }),
    );

    expect(lean).not.toHaveProperty('description');
    const { description, ...rest } = full;
    expect(description).toBe('## Steps\n\n- Open the page');
    expect(lean).toEqual(rest);
    expect(lean).toMatchObject({
      status: 'Todo',
      labels: ['bug'],
      acceptanceCriteria: [{ text: 'It lines up' }],
    });
    expect(explicit).toEqual(full);
    await client.close();
  });

  it('mentions the lighter reads in the get_ticket and list_tickets descriptions', async () => {
    const client = await connectMcpClient(createTestTickets());
    const { tools } = await client.listTools();
    const describe = (name: string) =>
      tools.find((tool) => tool.name === name)?.description;

    expect(describe('get_ticket')).toMatch(/description: false/);
    expect(describe('find_tickets')).toMatch(/epicNumber/);
    await client.close();
  });

  it('lists only Tickets changed since a time, each with updatedAt', async () => {
    vi.useFakeTimers({
      now: new Date('2026-03-01T09:00:00Z'),
      toFake: ['Date'],
    });
    try {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      const epic = tickets.createTicket({
        projectId: project.id,
        title: 'Launch',
        type: 'Epic',
      });
      tickets.createTicket({ projectId: project.id, title: 'Footer' });
      vi.setSystemTime(new Date('2026-03-01T11:00:00Z'));
      tickets.createTicket({
        projectId: project.id,
        title: 'Header',
        epicNumber: epic.number,
      });
      const client = await connectMcpClient(tickets);

      const listed = resultJson(
        await client.callTool({
          name: 'find_tickets',
          arguments: {
            projectName: 'Website',
            type: 'Epic',
            changedSince: '2026-03-01T10:00:00Z',
          },
        }),
      );

      expect(listed).toEqual({
        tickets: [
          expect.objectContaining({
            number: epic.number,
            // Its own updated time: it matches through the child created since.
            updatedAt: '2026-03-01T09:00:00.000Z',
          }),
        ],
        nextCursor: null,
        total: 1,
      });
      await client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a malformed changedSince, naming it', async () => {
    const client = await connectMcpClient(createTestTickets());

    const result = await client.callTool({
      name: 'find_tickets',
      arguments: { changedSince: 'last Tuesday' },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/changedSince.*ISO 8601/);
    await client.close();
  });

  it('documents changedSince for checking what other sessions changed', async () => {
    const client = await connectMcpClient(createTestTickets());
    const { tools } = await client.listTools();
    const listTickets = tools.find(({ name }) => name === 'find_tickets');

    expect(listTickets?.description).toMatch(/changedSince/);
    expect(listTickets?.description).toMatch(/updatedAt/);
    expect(
      JSON.stringify(listTickets?.inputSchema.properties?.changedSince),
    ).toMatch(/other sessions changed.*before publishing/);
    expect(client.getInstructions()).not.toMatch(/changedSince/);
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
      name: 'find_tickets',
      arguments: {},
    });
    const full = await client.callTool({
      name: 'find_tickets',
      arguments: { detail: 'full' },
    });
    const { tools } = await client.listTools();
    const listTickets = tools.find(({ name }) => name === 'find_tickets');

    expect(resultJson(summary)).toEqual({
      tickets: [
        {
          number: ticket.number,
          title: 'Fix the header',
          status: 'Todo',
          labels: [],
          blocked: false,
          type: 'Ticket',
          epicNumber: null,
          updatedAt: ticket.updatedAt.toISOString(),
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

  it('lists whole Tickets without their descriptions when description is false', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Launch',
      type: 'Epic',
      description: 'The whole launch.',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Header',
      description: 'It overlaps the logo.',
      epicNumber: epic.number,
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Footer',
      description: 'It is too tall.',
    });
    const client = await connectMcpClient(tickets);
    type Row = { description?: string; epicNumber: number | null };
    const list = async (args: Record<string, unknown>) =>
      resultJson(
        await client.callTool({ name: 'find_tickets', arguments: args }),
      ) as { tickets: Row[] };

    const full = await list({ detail: 'full' });
    const explicit = await list({ detail: 'full', description: true });
    const lean = await list({ detail: 'full', description: false });
    const summary = await list({ description: false });

    expect(explicit).toEqual(full);
    expect(full.tickets.map(({ description }) => description)).toEqual([
      'The whole launch.',
      'It overlaps the logo.',
      'It is too tall.',
    ]);
    expect(lean).toEqual({
      ...full,
      tickets: full.tickets.map(
        ({ description: _description, ...rest }) => rest,
      ),
    });
    expect(summary).toEqual(await list({}));
    expect(summary.tickets.map(({ epicNumber }) => epicNumber)).toEqual([
      null,
      epic.number,
      null,
    ]);
    await client.close();
  });

  it("leaves epicNumber out of the write tools' summaries", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { number: ticket.number, status: 'In progress' },
    });

    expect(Object.keys(resultJson(result) as object).sort()).toEqual([
      'blocked',
      'labels',
      'number',
      'status',
      'title',
    ]);
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
      name: 'find_tickets',
      arguments: { status: ['Todo', 'In progress'] },
    });
    const empty = await client.callTool({
      name: 'find_tickets',
      arguments: { status: [] },
    });
    const unknown = await client.callTool({
      name: 'find_tickets',
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
      name: 'find_tickets',
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

  it('lets an Agent start a Ticket, refuses a second run, and abandon it', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    const client = await connectMcpClient(tickets);

    const started = await client.callTool({
      name: 'start_work',
      arguments: {
        number: ticket.number,
        agentRunId: 'run-1',
      },
    });
    const conflict = await client.callTool({
      name: 'start_work',
      arguments: { number: ticket.number, agentRunId: 'run-2' },
    });
    const abandoned = await client.callTool({
      name: 'abandon_work',
      arguments: {
        number: ticket.number,
        agentRunId: 'run-1',
        reason: 'Not now.',
      },
    });

    expect(resultJson(started)).toMatchObject({
      ticket: {
        number: ticket.number,
        status: 'In progress',
        claim: { agentRunId: 'run-1' },
      },
    });
    expect(conflict.isError).toBe(true);
    expect(resultText(conflict)).toBe(
      `Ticket T${ticket.number} is already claimed by Agent run run-1.`,
    );
    expect(abandoned.isError).toBeFalsy();
    expect(tickets.getTicket(ticket.number)).toMatchObject({
      status: 'Todo',
      claim: null,
    });
    await client.close();
  });

  it('completes a Ticket as the Agent: Done, triage state label gone, Claim released', async () => {
    const tickets = createTestTickets(undefined, 'agent');
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      labels: ['ready-for-agent', 'bug'],
      status: 'In progress',
    });
    tickets.claimTicket(ticket.number, { agentRunId: 'run-1' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'finish_work',
      arguments: { number: ticket.number },
    });

    expect(resultJson(result)).toEqual({
      number: ticket.number,
      title: 'Fix the header',
      status: 'Done',
      labels: ['bug'],
      blocked: false,
    });
    expect(tickets.getTicket(ticket.number).claim).toBeNull();
    expect(tickets.listActivity(ticket.number).at(-1)?.actor).toBe('agent');
    await client.close();
  });

  it("completes an Epic's unarchived children and removes the Epic's own label", async () => {
    const tickets = createTestTickets(undefined, 'agent');
    const project = tickets.createProject({ name: 'Website' });
    const create = (title: string, labels: string[], extra = {}) =>
      tickets.createTicket({ projectId: project.id, title, labels, ...extra });
    const epic = create('Login', ['ready-for-agent', 'enhancement'], {
      type: 'Epic',
    });
    const a = create('A', ['ready-for-agent'], { epicNumber: epic.number });
    const b = create('B', ['wontfix'], { epicNumber: epic.number });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'finish_work',
      arguments: { number: epic.number, detail: 'full' },
    });

    expect(resultJson(result)).toMatchObject({
      number: epic.number,
      type: 'Epic',
      status: 'Done',
      labels: ['enhancement'],
      children: [
        { number: a.number, status: 'Done' },
        { number: b.number, status: 'Done' },
      ],
    });
    expect(tickets.getTicket(a.number).labels).toEqual([]);
    expect(tickets.getTicket(b.number).labels).toEqual(['wontfix']);
    await client.close();
  });

  it('completes a Ticket whatever its Status, and says when it does not exist', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    const client = await connectMcpClient(tickets);

    const done = await client.callTool({
      name: 'finish_work',
      arguments: { number: ticket.number },
    });
    const missing = await client.callTool({
      name: 'finish_work',
      arguments: { number: 99 },
    });

    expect(resultJson(done)).toMatchObject({ status: 'Done' });
    expect(missing.isError).toBe(true);
    expect(resultText(missing)).toBe('There is no Ticket T99.');
    await client.close();
  });

  it('tells Agents that finish_work checks no merge or CI, but refuses unchecked criteria without an override', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();
    const description =
      tools.find((tool) => tool.name === 'finish_work')?.description ?? '';

    expect(description).toMatch(/merged/);
    expect(description).toMatch(/CI/);
    expect(description).toMatch(/Refused while any acceptance criterion/);
    expect(description).toMatch(/override/);
    expect(description).toMatch(/without a PR/);
    expect(description).toMatch(/never wontfix/);
    await client.close();
  });

  it('refuses finish_work while a criterion is unchecked, naming it and its Ticket', async () => {
    const tickets = createTestTickets(undefined, 'agent');
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Login',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Form',
      epicNumber: epic.number,
      acceptanceCriteria: [{ text: 'Validates the email' }],
    });
    const client = await connectMcpClient(tickets);

    const ticketRefused = await client.callTool({
      name: 'finish_work',
      arguments: { number: child.number },
    });
    const epicRefused = await client.callTool({
      name: 'finish_work',
      arguments: { number: epic.number },
    });

    for (const refused of [ticketRefused, epicRefused]) {
      expect(refused.isError).toBe(true);
      expect(resultText(refused)).toContain(
        `T${child.number}: Validates the email`,
      );
    }
    expect(tickets.getTicket(child.number).status).toBe('Todo');
    await client.close();
  });

  it("finishes with an override, posting the reason as the run's comment", async () => {
    const tickets = createTestTickets(undefined, 'agent');
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Login',
      type: 'Epic',
      labels: ['ready-for-agent'],
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Form',
      epicNumber: epic.number,
      acceptanceCriteria: [{ text: 'Validates the email' }],
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'finish_work',
      arguments: { number: epic.number, override: 'Moved to T99.' },
    });

    expect(resultJson(result)).toMatchObject({ status: 'Done', labels: [] });
    expect(tickets.getTicket(child.number).status).toBe('Done');
    const [comment] = tickets.listComments(epic.number);
    expect(comment).toMatchObject({ author: 'agent' });
    expect(comment.body).toContain('Moved to T99.');
    expect(comment.body).toContain(`T${child.number}: Validates the email`);
    await client.close();
  });

  it('finishes work without a PR reference and removes its triage state label', async () => {
    const tickets = createTestTickets(undefined, 'agent');
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Research the options',
      labels: ['ready-for-human', 'enhancement'],
      acceptanceCriteria: [{ text: 'Options listed', checked: true }],
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'finish_work',
      arguments: { number: ticket.number },
    });

    expect(resultJson(result)).toMatchObject({
      status: 'Done',
      labels: ['enhancement'],
    });
    expect(tickets.getTicket(ticket.number).externalReferences).toEqual([]);
    await client.close();
  });

  it("documents start_work's merge field", async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();
    const description =
      tools.find((tool) => tool.name === 'start_work')?.description ?? '';

    expect(description).toMatch(/merge \("auto"/);
    expect(description).toMatch(/"approve": hand off/);
    expect(description).toMatch(/Auto-merge/);
    await client.close();
  });

  it('says when a Ticket does not exist', async () => {
    const client = await connectMcpClient(createTestTickets());

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { number: 42 },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('There is no Ticket T42.');
    await client.close();
  });

  it('creates a Ticket that the Board then lists', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const result = await fileTicket(client, {
      projectId: project.id,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
      status: 'In progress',
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

    const created = await fileTicket(client, {
      projectName: 'website',
      title: 'Fix the header',
      detail: 'full',
    });
    const listed = await client.callTool({
      name: 'find_tickets',
      arguments: { projectName: 'WEBSITE' },
    });
    const stale = await fileTicket(client, {
      projectName: 'Ticket',
      title: 'Lost',
    });
    const mismatched = await client.callTool({
      name: 'find_tickets',
      arguments: { projectId: website.id, projectName: 'App' },
    });
    const neither = await fileTicket(client, { title: 'Nowhere' });

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

    const result = await fileTicket(client, {
      projectId: project.id,
      title: '   ',
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('Ticket at position 0: Enter a title.');
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
      status: 'In progress',
    });
    expect(tickets.getTicket(1)).toMatchObject({
      title: 'Fix the header',
      description: 'It overlaps the logo.',
      status: 'In progress',
    });
    await client.close();
  });

  it('moves a Ticket to a Project given by name', async () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    tickets.createTicket({ projectId: website.id, title: 'Fix the header' });
    const client = await connectMcpClient(tickets);
    const move = (args: Record<string, unknown>) =>
      client.callTool({
        name: 'update_ticket',
        arguments: { number: 1, detail: 'full', ...args },
      });

    const stale = await move({ projectName: 'Ticket' });
    const mismatched = await move({
      projectId: website.id,
      projectName: 'App',
    });
    const moved = await move({ projectName: 'app' });

    expect(resultText(stale)).toBe(
      'There is no Project named "Ticket". The Projects are: "App", "Website".',
    );
    expect(resultText(mismatched)).toBe(
      `Project ${website.id} is "Website", not "App". Give projectId or projectName, or both for the same Project.`,
    );
    for (const refused of [stale, mismatched]) {
      expect(refused.isError).toBe(true);
    }
    expect(resultJson(moved)).toMatchObject({ projectId: app.id });
    expect(
      resultJson(await move({ projectId: website.id, projectName: 'WEBSITE' })),
    ).toMatchObject({ projectId: website.id });
    expect(resultJson(await move({ projectId: app.id }))).toMatchObject({
      projectId: app.id,
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
    expect(resultText(missing)).toBe('There is no Ticket T42.');
    expect(tickets.getTicket(1).title).toBe('Fix the header');
    await client.close();
  });

  it('archives a Ticket and restores it', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Fix the header' });
    const client = await connectMcpClient(tickets);

    const archived = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, archived: true, detail: 'full' },
    });

    expect(resultJson(archived)).toMatchObject({ number: 1, archived: true });
    expect(tickets.listTickets()).toEqual([]);

    const restored = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, archived: false, detail: 'full' },
    });

    expect(resultJson(restored)).toMatchObject({ number: 1, archived: false });
    expect(tickets.listTickets().map(({ title }) => title)).toEqual([
      'Fix the header',
    ]);
    await client.close();
  });

  it('refuses to archive an Epic with children that are not archived', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { number: epic.number, archived: true },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(
      `Epic T${epic.number} has child Tickets that are not archived: T${child.number}. Archive or detach them first.`,
    );
    expect(tickets.getTicket(child.number).archived).toBe(false);
    await client.close();
  });

  it('says restoring an Epic brings back the children archived with it', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();
    const update = tools.find((tool) => tool.name === 'update_ticket');

    expect(JSON.stringify(update?.inputSchema)).toMatch(
      /Restoring an Epic also brings back the children archived with it/,
    );
    await client.close();
  });

  it('says when the Ticket to archive or restore does not exist', async () => {
    const client = await connectMcpClient(createTestTickets());

    for (const archived of [true, false]) {
      const result = await client.callTool({
        name: 'update_ticket',
        arguments: { number: 42, archived },
      });

      expect(result.isError, String(archived)).toBe(true);
      expect(resultText(result), String(archived)).toBe(
        'There is no Ticket T42.',
      );
    }
    await client.close();
  });
});

describe('Label tools', () => {
  it('creates a Ticket with labels and gets them back', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const created = await fileTicket(client, {
      projectId: project.id,
      title: 'Fix the header',
      labels: ['needs-triage', 'Bug'],
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
      name: 'update_ticket',
      arguments: { number: 1, addLabels: ['bug', 'needs-triage'] },
    });
    const removed = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, removeLabels: ['needs-triage'] },
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
      name: 'update_ticket',
      arguments: { number: 1, addLabels: ['  '] },
    });
    const missing = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 42, removeLabels: ['bug'] },
    });

    expect(blank.isError).toBe(true);
    expect(resultText(blank)).toBe('Enter a label.');
    expect(missing.isError).toBe(true);
    expect(resultText(missing)).toBe('There is no Ticket T42.');
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

    const result = await client.callTool({
      name: 'get_project',
      arguments: { projectId: project.id },
    });

    expect(resultJson(result)).toMatchObject({
      labels: ['bug', 'needs-triage'],
    });
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
      name: 'find_tickets',
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
      name: 'find_tickets',
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
      name: 'find_tickets',
      arguments: { projectId: project.id, sort: 'position' },
    });
    const noProject = await client.callTool({
      name: 'find_tickets',
      arguments: { sort: 'position' },
    });
    const unknown = await client.callTool({
      name: 'find_tickets',
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
      name: 'find_tickets',
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

describe('External reference tools', () => {
  it('sets references on create_ticket and create_tickets, changes them on update_ticket and reads them in get_ticket', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    await fileTicket(client, {
      projectId: project.id,
      title: 'Fix the header',
      externalReferences: ['#55', 'https://github.com/acme/web/pull/87'],
    });
    await client.callTool({
      name: 'file_tickets',
      arguments: {
        projectId: project.id,
        tickets: [{ title: 'Fix the footer', externalReferences: ['ABC-33'] }],
      },
    });
    const updated = await client.callTool({
      name: 'update_ticket',
      arguments: {
        number: 1,
        removeExternalReferences: ['#55'],
        addExternalReferences: ['ABC-34'],
        detail: 'full',
      },
    });
    const got = await client.callTool({
      name: 'get_ticket',
      arguments: { number: 2 },
    });

    expect(resultJson(updated)).toMatchObject({
      externalReferences: ['https://github.com/acme/web/pull/87', 'ABC-34'],
    });
    expect(resultJson(got)).toMatchObject({ externalReferences: ['ABC-33'] });
    await client.close();
  });

  it('refuses a value that is neither a URL nor a key, with the reason', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Fix the header' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, addExternalReferences: ['javascript:alert(1)'] },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(
      '"javascript:alert(1)" is not a valid URL or key. Give an http(s) URL of at most 2,000 characters, or a key without spaces of at most 100 characters, such as #55 or ABC-33.',
    );
    await client.close();
  });

  it('returns keys as stored, whatever Reference templates the Project has, and has no template tools', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.addReferenceTemplate(project.id, {
      prefix: '#',
      url: 'https://github.com/acme/web/issues/{n}',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      externalReferences: ['#55'],
    });
    const client = await connectMcpClient(tickets);

    const got = await client.callTool({
      name: 'get_ticket',
      arguments: { number: 1 },
    });
    const { tools } = await client.listTools();

    expect(resultJson(got)).toMatchObject({ externalReferences: ['#55'] });
    expect(JSON.stringify(resultJson(got))).not.toContain('github.com');
    expect(
      tools
        .filter(({ name }) => /template/i.test(name))
        .map(({ name }) => name),
    ).toEqual([]);
    await client.close();
  });

  it('describes External references where Agents set and read them', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();
    const describe = (name: string) =>
      JSON.stringify(tools.find((tool) => tool.name === name));

    for (const name of ['file_tickets', 'update_ticket']) {
      expect(describe(name), name).toMatch(/http\(s\) URL/);
      expect(describe(name), name).toMatch(/at most 50/);
    }
    expect(describe('update_ticket')).toMatch(/addExternalReferences/);
    expect(describe('update_ticket')).toMatch(/removeExternalReferences/);
    expect(describe('get_ticket')).toMatch(/externalReferences/);
    await client.close();
  });
});

describe('Batch tools', () => {
  it('changes several Tickets in one update_ticket call', async () => {
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
      name: 'update_ticket',
      arguments: {
        number: [1, 2],
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
      name: 'update_ticket',
      arguments: { number: [1, 42], status: 'Done' },
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(resultText(result))).toMatchObject({
      updated: [{ number: 1, status: 'Done' }],
      failed: [{ number: 42, error: 'There is no Ticket T42.' }],
    });
    await client.close();
  });

  it('refuses a batch over the size limit and says what the limit is', async () => {
    const client = await connectMcpClient(createTestTickets());

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: {
        number: Array.from({ length: 51 }, (_, index) => index + 1),
        status: 'Done',
      },
    });
    const { tools } = await client.listTools();

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('Choose at most 50 Tickets at a time.');
    expect(
      tools.find((tool) => tool.name === 'update_ticket')?.description,
    ).toMatch(/up to 50 numbers/);
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
        name: 'file_tickets',
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
      name: 'file_tickets',
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
      name: 'file_tickets',
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
  it("sets and returns an Epic's colour, and refuses one on a normal Ticket", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const epic = resultJson(
      await fileTicket(client, {
        projectId: project.id,
        title: 'Checkout',
        type: 'Epic',
        color: 'teal',
        detail: 'full',
      }),
    );
    const other = resultJson(
      await fileTicket(client, {
        projectId: project.id,
        title: 'Search',
        type: 'Epic',
        detail: 'full',
      }),
    );
    const recoloured = resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: { number: 1, color: 'pink', detail: 'full' },
      }),
    );
    tickets.createTicket({ projectId: project.id, title: 'Fix it' });
    const batch = await client.callTool({
      name: 'update_ticket',
      arguments: { number: [2, 3], color: 'blue' },
    });
    const listed = resultJson(
      await client.callTool({
        name: 'find_tickets',
        arguments: { projectId: project.id, detail: 'full' },
      }),
    ) as { tickets: { number: number; color: string | null }[] };

    expect(epic).toMatchObject({ color: 'teal' });
    expect(other).toMatchObject({ color: 'red' });
    expect(recoloured).toMatchObject({ color: 'pink' });
    expect(batch.isError).toBe(true);
    expect(listed.tickets.map(({ number, color }) => [number, color])).toEqual([
      [1, 'pink'],
      [2, 'blue'],
      [3, null],
    ]);
    expect(
      resultText(
        await client.callTool({
          name: 'update_ticket',
          arguments: { number: 3, color: 'teal' },
        }),
      ),
    ).toMatch(/Ticket T3 is not an Epic. Only an Epic has a colour./);
    await client.close();
  });

  it('describes Epic colours in the tools that set and show them', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();
    const describe = (name: string) =>
      JSON.stringify(tools.find((tool) => tool.name === name));

    for (const name of ['file_tickets', 'update_ticket']) {
      expect(describe(name), name).toMatch(
        /fewest live Epics|Only an Epic has a colour/,
      );
      expect(describe(name), name).toMatch(/"color"/);
    }
    expect(describe('get_ticket')).toMatch(/color/);
    expect(describe('find_tickets')).toMatch(/color/);
    await client.close();
  });

  it('creates an Epic and a child under it, and gets both', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const epic = resultJson(
      await fileTicket(client, {
        projectId: project.id,
        title: 'Checkout',
        description: 'Shared context.',
        type: 'Epic',
        detail: 'full',
      }),
    );
    const first = resultJson(
      await fileTicket(client, {
        projectId: project.id,
        title: 'Pay',
        epicNumber: 1,
        detail: 'full',
      }),
    );
    await client.callTool({
      name: 'file_tickets',
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
      epic: { number: 1, title: 'Checkout', color: 'red' },
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

  it('attaches and detaches several Tickets with update_ticket, answering with a summary of each in order', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const pay = tickets.createTicket({ projectId: project.id, title: 'Pay' });
    const refund = tickets.createTicket({
      projectId: project.id,
      title: 'Refund',
    });
    const client = await connectMcpClient(tickets);

    const attached = await client.callTool({
      name: 'update_ticket',
      arguments: {
        number: [refund.number, pay.number],
        epicNumber: epic.number,
      },
    });
    expect(resultJson(attached)).toMatchObject({
      updated: [
        { number: refund.number, title: 'Refund' },
        { number: pay.number, title: 'Pay' },
      ],
      failed: [],
    });
    expect(tickets.getTicket(pay.number).epic?.number).toBe(epic.number);

    const detached = await client.callTool({
      name: 'update_ticket',
      arguments: { number: pay.number, epicNumber: null, detail: 'full' },
    });
    expect(resultJson(detached)).toEqual(
      JSON.parse(JSON.stringify(tickets.getTicket(pay.number))),
    );
    expect(tickets.getTicket(pay.number).epic).toBeNull();
    await client.close();
  });

  it('refuses an Epic attachment, naming every Ticket that cannot join', async () => {
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
    const free = tickets.createTicket({ projectId: project.id, title: 'Pay' });
    const grouped = tickets.createTicket({
      projectId: project.id,
      title: 'Refund',
      epicNumber: other.number,
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: {
        number: [free.number, grouped.number, other.number],
        epicNumber: epic.number,
      },
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(resultText(result))).toMatchObject({
      failed: [
        {
          number: grouped.number,
          error: `Ticket T${grouped.number} is already in Epic T${other.number}. Detach it from that Epic first.`,
        },
        {
          number: other.number,
          error: `Ticket T${other.number} is an Epic, and an Epic cannot be a child of another Epic.`,
        },
      ],
    });
    await client.close();
  });

  it('refuses the old singular field and an empty list on update_ticket', async () => {
    const client = await connectMcpClient(createTestTickets());

    const singular = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 2, epic: 1 },
    });
    const empty = await client.callTool({
      name: 'update_ticket',
      arguments: { number: [], epicNumber: null },
    });

    expect(singular.isError).toBe(true);
    expect(resultText(singular)).toMatch(/"epic"/);
    expect(empty.isError).toBe(true);
    expect(resultText(empty)).toBe('Choose at least one Ticket.');
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
      name: 'update_ticket',
      arguments: { number: other.number, epicNumber: epic.number },
    });

    expect(status.isError).toBe(true);
    expect(resultText(status)).toBe(
      `Ticket T${epic.number} is an Epic. Its Status follows its child Tickets and cannot be set by hand.`,
    );
    expect(attach.isError).toBe(true);
    expect(resultText(attach)).toBe(
      `Ticket T${other.number} is an Epic, and an Epic cannot be a child of another Epic.`,
    );
    await client.close();
  });

  it("refuses a type on update_ticket and keeps the Epic's type", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { number: epic.number, type: 'Ticket', title: 'Pay' },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/Unrecognized key.*"type"/);
    expect(tickets.getTicket(epic.number)).toMatchObject({
      type: 'Epic',
      title: 'Checkout',
    });
    await client.close();
  });
});

describe('Origin tools', () => {
  it('creates Tickets split from an Origin, one by one and in a batch, and gets both sides', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const spec = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout spec',
    });
    const client = await connectMcpClient(tickets);

    const first = resultJson(
      await fileTicket(client, {
        projectId: project.id,
        title: 'Pay',
        originNumber: spec.number,
        detail: 'full',
      }),
    );
    await client.callTool({
      name: 'file_tickets',
      arguments: {
        projectId: project.id,
        originNumber: spec.number,
        tickets: [{ title: 'Refund' }],
      },
    });

    expect(first).toMatchObject({
      origin: { number: spec.number, title: 'Checkout spec', status: 'Todo' },
    });
    expect(
      resultJson(
        await client.callTool({
          name: 'get_ticket',
          arguments: { number: spec.number },
        }),
      ),
    ).toMatchObject({
      origin: null,
      splitOff: [
        { number: 2, title: 'Pay', status: 'Todo', archived: false },
        { number: 3, title: 'Refund', status: 'Todo', archived: false },
      ],
    });
    await client.close();
  });

  it('changes and clears an Origin with update_ticket', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Spec' });
    tickets.createTicket({ projectId: project.id, title: 'Other spec' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Pay',
      originNumber: 1,
    });
    const client = await connectMcpClient(tickets);

    const moved = resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: { number: 3, originNumber: 2, detail: 'full' },
      }),
    );
    const cleared = resultJson(
      await client.callTool({
        name: 'update_ticket',
        arguments: { number: 3, originNumber: null, detail: 'full' },
      }),
    );

    expect(moved).toMatchObject({ origin: { number: 2 } });
    expect(cleared).toMatchObject({ origin: null });
    await client.close();
  });

  it('finds the ready Tickets split from an Origin', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Spec' });
    tickets.createTicketBatch({
      projectId: project.id,
      originNumber: 1,
      tickets: [{ title: 'Pay' }, { title: 'Refund', status: 'Done' }],
    });
    tickets.createTicket({ projectId: project.id, title: 'Unrelated' });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'find_tickets',
      arguments: { originNumber: 1, status: 'Todo' },
    });

    expect(
      (resultJson(result) as { tickets: { number: number }[] }).tickets.map(
        ({ number }) => number,
      ),
    ).toEqual([2]);
    await client.close();
  });

  it('refuses an Origin chain that would loop', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Spec' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Pay',
      originNumber: 1,
    });
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, originNumber: 2 },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(
      /T2 cannot be the Origin of T1, because T1 is already an Origin of T2/,
    );
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
      name: 'add_note',
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

  it("returns a Ticket's comments with it, oldest first", async () => {
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
      name: 'get_ticket',
      arguments: { number: ticket.number },
    });

    expect(resultJson(result)).toMatchObject({
      comments: [
        { author: 'user', body: 'From the User' },
        { author: 'agent', body: 'From an Agent' },
      ],
    });
    await client.close();
  });

  it("includes a Ticket's whole Activity, oldest first, when asked", async () => {
    const tickets = createTestTickets(undefined, 'agent');
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    const client = await connectMcpClient(tickets);
    await client.callTool({
      name: 'start_work',
      arguments: { number: ticket.number, agentRunId: 'run-1' },
    });

    const result = await client.callTool({
      name: 'get_ticket',
      arguments: { number: ticket.number, include: ['activity'] },
    });
    const missing = await client.callTool({
      name: 'get_ticket',
      arguments: { number: 99, include: ['activity'] },
    });

    const { activity } = resultJson(result) as {
      activity: { actor: string; changes: unknown[] }[];
    };
    expect(activity[0]).toEqual({
      id: expect.any(Number),
      actor: 'agent',
      createdAt: expect.any(String),
      changes: [{ type: 'created' }],
    });
    expect(activity.flatMap(({ changes }) => changes)).toContainEqual({
      type: 'claimTaken',
      agentRunId: 'run-1',
      agentName: null,
    });
    expect(missing.isError).toBe(true);
    expect(resultText(missing)).toBe('There is no Ticket T99.');
    await client.close();
  });

  it('offers no tool to edit or remove a comment', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).not.toContain('edit_comment');
    expect(tools.map((tool) => tool.name)).not.toContain('remove_comment');
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

  it('adds and removes a Blocker with update_ticket, and reads it with get_ticket', async () => {
    const { tickets } = ticketsWithThree();
    const client = await connectMcpClient(tickets);

    const added = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 2, addBlockers: [1], detail: 'full' },
    });
    const read = await client.callTool({
      name: 'get_ticket',
      arguments: { number: 2 },
    });
    const removed = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 2, removeBlockers: [1], detail: 'full' },
    });

    expect(resultJson(added)).toMatchObject({
      number: 2,
      blockedBy: [1],
      blocked: true,
    });
    expect(resultJson(read)).toMatchObject({ blockedBy: [1], blocked: true });
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
      name: 'update_ticket',
      arguments: { number: 1, removeBlockers: [9999] },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('There is no Ticket T9999.');
    await client.close();
  });

  it('lists only unblocked Tickets, to find work that is ready', async () => {
    const { tickets } = ticketsWithThree();
    tickets.addBlocker({ blocker: 1, blocked: 2 });
    tickets.addBlocker({ blocker: 2, blocked: 3 });
    const client = await connectMcpClient(tickets);

    const ready = await client.callTool({
      name: 'find_tickets',
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
      name: 'update_ticket',
      arguments: { number: 3, addBlockers: [3] },
    });
    const cycle = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, addBlockers: [2] },
    });
    const missing = await client.callTool({
      name: 'get_ticket',
      arguments: { number: 42 },
    });

    expect(self.isError).toBe(true);
    expect(resultText(self)).toBe('A Ticket cannot block itself.');
    expect(cycle.isError).toBe(true);
    expect(resultText(cycle)).toBe(
      'T2 cannot block T1, because T1 already blocks T2: T1 → T2.',
    );
    expect(missing.isError).toBe(true);
    expect(resultText(missing)).toBe('There is no Ticket T42.');
    await client.close();
  });
});

describe('Acceptance criteria tools', () => {
  it('creates a Ticket with acceptance criteria and gets them back in order', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const client = await connectMcpClient(tickets);

    const created = await fileTicket(client, {
      projectId: project.id,
      title: 'Fix the header',
      acceptanceCriteria: [
        { text: 'The logo is centred' },
        { text: 'The menu collapses on phones', checked: true },
      ],
      detail: 'full',
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
        detail: 'full',
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

  it('checks and unchecks criteria with check_criterion', async () => {
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

    await client.callTool({
      name: 'check_criterion',
      arguments: { number: ticket.number, ids: [logo.id], checked: false },
    });
    const result = await client.callTool({
      name: 'check_criterion',
      arguments: { number: ticket.number, ids: [menu.id], checked: true },
    });

    const expected = [
      { id: logo.id, text: 'The logo is centred', checked: false },
      { id: menu.id, text: 'The menu collapses on phones', checked: true },
    ];
    expect(resultJson(result)).toMatchObject({
      status: 'Todo',
      acceptanceCriteria: [expected[1]],
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
      name: 'check_criterion',
      arguments: { number: ticket.number, ids: [7], checked: true },
    });

    expect(empty.isError).toBe(true);
    expect(resultText(empty)).toBe('Enter text for each acceptance criterion.');
    expect(unknown.isError).toBe(true);
    expect(resultText(unknown)).toBe(
      `Ticket T${ticket.number} has no acceptance criterion 7.`,
    );
    await client.close();
  });
});

describe('Cycle tools', () => {
  /** A Project with Tickets T1 to T3, and an MCP client on it. */
  async function cycleSetup() {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of ['One', 'Two', 'Three']) {
      tickets.createTicket({ projectId: project.id, title });
    }
    const client = await connectMcpClient(tickets);
    return { tickets, project, client };
  }

  it("creates a Cycle with Tickets planned in and lists a Project's Cycles with their Tickets", async () => {
    const { tickets, project, client } = await cycleSetup();

    const created = resultJson(
      await client.callTool({
        name: 'create_cycle',
        arguments: {
          projectId: project.id,
          title: 'Beta',
          ticketNumbers: [2],
        },
      }),
    ) as { id: number };
    const read = await client.callTool({
      name: 'get_project',
      arguments: { projectId: project.id },
    });

    const cycle = tickets.getCycle(created.id);
    expect(resultJson(read)).toMatchObject({
      cycles: [
        {
          id: created.id,
          title: 'Beta',
          state: 'Prepared',
          ticketNumbers: [2],
          createdAt: iso(cycle.createdAt),
          archivedAt: null,
        },
      ],
    });
    await client.close();
  });

  it('creates and reads Cycles in a Project given by name', async () => {
    const { tickets, project, client } = await cycleSetup();
    tickets.createProject({ name: 'App' });
    const call = (name: string, args: Record<string, unknown>) =>
      client.callTool({ name, arguments: args });

    const created = await call('create_cycle', {
      projectName: 'website',
      title: 'Beta',
    });
    const listed = await call('get_project', { projectName: 'Website' });
    const stale = await call('create_cycle', {
      projectName: 'Ticket',
      title: 'Beta',
    });
    const staleRead = await call('get_project', { projectName: 'Ticket' });
    const mismatched = await call('create_cycle', {
      projectId: project.id,
      projectName: 'App',
      title: 'Beta',
    });
    const neither = await call('create_cycle', { title: 'Beta' });

    expect(resultJson(created)).toMatchObject({ projectId: project.id });
    expect(resultJson(listed)).toMatchObject({ cycles: [{ title: 'Beta' }] });
    for (const result of [stale, staleRead]) {
      expect(resultText(result)).toBe(
        'There is no Project named "Ticket". The Projects are: "App", "Website".',
      );
    }
    expect(resultText(mismatched)).toBe(
      `Project ${project.id} is "Website", not "App". Give projectId or projectName, or both for the same Project.`,
    );
    expect(resultText(neither)).toBe(
      'Choose a Project by projectId or projectName.',
    );
    for (const refused of [stale, staleRead, mismatched, neither]) {
      expect(refused.isError).toBe(true);
    }
    expect(tickets.listCycles(project.id)).toHaveLength(1);
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
      name: 'find_tickets',
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
        tools.find((tool) => tool.name === 'find_tickets')?.inputSchema,
      ),
    ).toMatch(/Done Tickets of an Archived Cycle/);
    await client.close();
  });

  it('shows the Cycle a whole Ticket is in, in every tool that returns one', async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const link = { id: cycle.id, title: 'Beta', state: 'Prepared' };

    const created = await fileTicket(client, {
      projectId: project.id,
      title: 'Planned',
      cycleId: cycle.id,
      detail: 'full',
    });
    const updated = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, title: 'Unplanned', detail: 'full' },
    });
    const got = await client.callTool({
      name: 'get_ticket',
      arguments: { number: (resultJson(created) as { number: number }).number },
    });
    const listed = await client.callTool({
      name: 'find_tickets',
      arguments: { projectId: project.id, cycleId: cycle.id, detail: 'full' },
    });
    const { tools } = await client.listTools();

    expect(resultJson(created)).toMatchObject({ cycle: link });
    expect(resultJson(updated)).toMatchObject({ cycle: null });
    expect(resultJson(got)).toMatchObject({ cycle: link });
    expect(resultJson(listed)).toMatchObject({ tickets: [{ cycle: link }] });
    expect(
      tools.find((tool) => tool.name === 'get_ticket')?.description,
    ).toMatch(/cycle is the Cycle/);
    await client.close();
  });

  it('plans a Ticket out of a Cycle, and lists the Tickets of a Cycle or the Backlog', async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: cycle.id, number: 1 });
    tickets.planTicket({ cycleId: cycle.id, number: 2 });

    const unplanned = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 2, cycleId: null },
    });
    const numbers = async (cycleId: number | null) =>
      (
        resultJson(
          await client.callTool({
            name: 'find_tickets',
            arguments: { projectId: project.id, cycleId },
          }),
        ) as { tickets: { number: number }[] }
      ).tickets.map(({ number }) => number);

    expect(unplanned.isError).not.toBe(true);
    expect(await numbers(cycle.id)).toEqual([1]);
    expect(await numbers(null)).toEqual([2, 3]);
    await client.close();
  });

  it('plans several Tickets into a Cycle in one update_ticket call', async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    const planned = await client.callTool({
      name: 'update_ticket',
      arguments: { number: [3, 1, 2], cycleId: cycle.id },
    });

    expect(planned.isError).toBe(false);
    expect(resultJson(planned)).toMatchObject({
      updated: [{ number: 3 }, { number: 1 }, { number: 2 }],
      failed: [],
    });
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([1, 2, 3]);
    await client.close();
  });

  it('reports a partly failed plan as an error, and refuses a bad Cycle', async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    const planned = await client.callTool({
      name: 'update_ticket',
      arguments: { number: [1, 42], cycleId: cycle.id },
    });
    const refused = await client.callTool({
      name: 'update_ticket',
      arguments: { number: [1], cycleId: 99 },
    });

    expect(planned.isError).toBe(true);
    expect(JSON.parse(resultText(planned))).toMatchObject({
      updated: [{ number: 1 }],
      failed: [{ number: 42, error: 'There is no Ticket T42.' }],
    });
    expect(refused.isError).toBe(true);
    expect(JSON.parse(resultText(refused))).toMatchObject({
      failed: [{ number: 1, error: 'There is no Cycle with id 99.' }],
    });
    await client.close();
  });

  it('moves Tickets between Cycles and to the Backlog with update_ticket', async () => {
    const { tickets, project, client } = await cycleSetup();
    const alpha = tickets.createCycle({
      projectId: project.id,
      title: 'Alpha',
    });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTickets({ cycleId: alpha.id, ticketNumbers: [1, 2] });

    const moved = await client.callTool({
      name: 'update_ticket',
      arguments: { number: [2, 3], cycleId: beta.id },
    });
    const toBacklog = await client.callTool({
      name: 'update_ticket',
      arguments: { number: [1, 3], cycleId: null },
    });

    expect(moved.isError).toBe(false);
    expect(toBacklog.isError).toBe(false);
    expect(tickets.getCycle(alpha.id).ticketNumbers).toEqual([]);
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([2]);
    await client.close();
  });

  it('points to a move when update_ticket meets a Ticket planned elsewhere', async () => {
    const { tickets, project, client } = await cycleSetup();
    const alpha = tickets.createCycle({
      projectId: project.id,
      title: 'Alpha',
    });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: alpha.id, number: 1 });

    const planned = await client.callTool({
      name: 'create_cycle',
      arguments: {
        projectId: project.id,
        title: 'Gamma',
        ticketNumbers: [1, 2],
      },
    });

    expect(planned.isError).toBe(true);
    expect(resultText(planned)).toMatch(
      /Ticket T1 is already planned into the Cycle "Alpha"\. Move it with update_ticket cycleId, or unplan it from that Cycle first\./,
    );
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([]);
    await client.close();
  });

  it('offers no tool to rename, start or archive a Cycle, or to sort a lane', async () => {
    const { client } = await cycleSetup();

    const { tools } = await client.listTools();

    for (const name of [
      'rename_cycle',
      'start_cycle',
      'archive_cycle',
      'sort_lane',
    ]) {
      expect(tools.map((tool) => tool.name)).not.toContain(name);
    }
    await client.close();
  });

  it("returns the module's message when a Cycle change is refused", async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.archiveTicket(3);

    const archived = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 3, cycleId: cycle.id },
    });
    const untitled = await client.callTool({
      name: 'create_cycle',
      arguments: { projectId: project.id, title: ' ' },
    });
    const missing = await client.callTool({
      name: 'create_cycle',
      arguments: { projectId: project.id, title: 'Gone', ticketNumbers: [99] },
    });

    expect(
      [archived, untitled, missing].map((result) => result.isError),
    ).toEqual([true, true, true]);
    expect(resultText(archived)).toBe(
      'Ticket T3 is archived. Restore it before planning it into a Cycle.',
    );
    expect(resultText(untitled)).toBe('Enter a title.');
    expect(resultText(missing)).toMatch(/There is no Ticket T99/);
    await client.close();
  });

  it('files Tickets straight into a Cycle with file_tickets', async () => {
    const { tickets, project, client } = await cycleSetup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    const one = await fileTicket(client, {
      projectId: project.id,
      title: 'Four',
      cycleId: cycle.id,
    });
    const batch = await client.callTool({
      name: 'file_tickets',
      arguments: {
        projectId: project.id,
        cycleId: cycle.id,
        tickets: [{ title: 'Five' }, { title: 'Six' }],
      },
    });
    const { tools } = await client.listTools();

    expect(resultJson(one)).toMatchObject({ number: 4 });
    expect(resultJson(batch)).toEqual({ numbers: [5, 6] });
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([4, 5, 6]);
    for (const name of ['file_tickets']) {
      expect(
        JSON.stringify(tools.find((tool) => tool.name === name)),
        name,
      ).toMatch(/Plan .* into this Cycle/);
    }
    await client.close();
  });

  it('refuses a file_tickets call with an unusable Cycle, creating nothing', async () => {
    const { tickets, project, client } = await cycleSetup();
    const other = tickets.createProject({ name: 'App' });
    const elsewhere = tickets.createCycle({
      projectId: other.id,
      title: 'App',
    });

    const one = await fileTicket(client, {
      projectId: project.id,
      title: 'Four',
      cycleId: 99,
    });
    const batch = await client.callTool({
      name: 'file_tickets',
      arguments: {
        projectId: project.id,
        cycleId: elsewhere.id,
        tickets: [{ title: 'Five' }, { title: 'Six' }],
      },
    });

    expect([one, batch].map((result) => result.isError)).toEqual([true, true]);
    expect(resultText(one)).toBe('There is no Cycle with id 99.');
    expect(resultText(batch)).toBe(
      'The Cycle "App" is in another Project. A Cycle holds only its own Project\'s Tickets.',
    );
    expect(tickets.listTickets()).toHaveLength(3);
    await client.close();
  });
});

describe('Write tool responses', () => {
  /** A Project with Ticket T1, which has a description and two criteria. */
  function ticketsWithOne() {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      description: 'A long spec the Agent already holds.',
      labels: ['bug'],
      acceptanceCriteria: [{ text: 'Logo visible' }, { text: 'No overlap' }],
    });
    return { tickets, project };
  }

  it('answers update_ticket with a summary, or the whole Ticket in full detail', async () => {
    const { tickets } = ticketsWithOne();
    const client = await connectMcpClient(tickets);

    const summary = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, status: 'In progress' },
    });
    const full = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, title: 'Fix the site header', detail: 'full' },
    });

    expect(resultJson(summary)).toEqual({
      number: 1,
      title: 'Fix the header',
      status: 'In progress',
      labels: ['bug'],
      blocked: false,
    });
    expect(resultJson(full)).toEqual(
      JSON.parse(JSON.stringify(tickets.getTicket(1))),
    );
    expect(resultJson(full)).toMatchObject({
      title: 'Fix the site header',
      description: 'A long spec the Agent already holds.',
    });
    await client.close();
  });

  it('answers the label changes of update_ticket with only a summary', async () => {
    const { tickets } = ticketsWithOne();
    const client = await connectMcpClient(tickets);
    const summary = (labels: string[]) => ({
      number: 1,
      title: 'Fix the header',
      status: 'Todo',
      labels,
      blocked: false,
    });

    const added = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, addLabels: ['ui'] },
    });
    const removed = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 1, removeLabels: ['bug'] },
    });

    expect(resultJson(added)).toEqual(summary(['bug', 'ui']));
    expect(resultJson(removed)).toEqual(summary(['ui']));
    await client.close();
  });

  it('adds the field a call changed when the summary does not show it', async () => {
    const { tickets, project } = ticketsWithOne();
    const blocker = tickets.createTicket({
      projectId: project.id,
      title: 'Design the logo',
    });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Site',
      type: 'Epic',
    });
    const client = await connectMcpClient(tickets);
    const call = async (name: string, args: Record<string, unknown>) => {
      const {
        number: _number,
        title: _title,
        status: _status,
        labels: _labels,
        blocked,
        ...extra
      } = resultJson(
        await client.callTool({ name, arguments: args }),
      ) as Record<string, unknown>;
      return { blocked, ...extra };
    };

    expect(
      await call('update_ticket', { number: 1, addBlockers: [blocker.number] }),
    ).toEqual({
      blocked: true,
      blockedBy: [blocker.number],
    });
    expect(
      await call('update_ticket', {
        number: 1,
        removeBlockers: [blocker.number],
      }),
    ).toEqual({ blocked: false, blockedBy: [] });
    expect(
      await call('update_ticket', { number: 1, epicNumber: epic.number }),
    ).toEqual({ blocked: false, epicNumber: epic.number });
    expect(await call('update_ticket', { number: 1, archived: true })).toEqual({
      blocked: false,
      archived: true,
    });
    expect(await call('update_ticket', { number: 1, archived: false })).toEqual(
      { blocked: false, archived: false },
    );
    await client.close();
  });

  it('answers check_criterion with only the criteria it named', async () => {
    const { tickets } = ticketsWithOne();
    const [first] = tickets.getTicket(1).acceptanceCriteria;
    const client = await connectMcpClient(tickets);

    const result = await client.callTool({
      name: 'check_criterion',
      arguments: { number: 1, ids: [first.id], checked: true },
    });

    expect(resultJson(result)).toEqual({
      number: 1,
      title: 'Fix the header',
      status: 'Todo',
      labels: ['bug'],
      blocked: false,
      acceptanceCriteria: [
        { id: first.id, text: 'Logo visible', checked: true },
      ],
    });
    await client.close();
  });

  it('lists a summary per changed Ticket from a batch update_ticket, or whole Tickets in full detail', async () => {
    const { tickets, project } = ticketsWithOne();
    tickets.createTicket({ projectId: project.id, title: 'Fix the footer' });
    const client = await connectMcpClient(tickets);

    const summary = await client.callTool({
      name: 'update_ticket',
      arguments: { number: [1, 99], status: 'In progress' },
    });
    const full = await client.callTool({
      name: 'update_ticket',
      arguments: { number: [2], status: 'Done', detail: 'full' },
    });

    expect(summary.isError).toBe(true);
    expect(JSON.parse(resultText(summary))).toEqual({
      updated: [
        {
          number: 1,
          title: 'Fix the header',
          status: 'In progress',
          labels: ['bug'],
          blocked: false,
        },
      ],
      failed: [{ number: 99, error: 'There is no Ticket T99.' }],
    });
    expect(resultJson(full)).toEqual({
      updated: [JSON.parse(JSON.stringify(tickets.getTicket(2)))],
      failed: [],
    });
    await client.close();
  });

  it('says what each tool that changes a Ticket answers with', async () => {
    const client = await connectMcpClient(createTestTickets());

    const { tools } = await client.listTools();
    const description = (name: string) =>
      tools.find((tool) => tool.name === name)?.description ?? '';

    expect(client.getInstructions()).toMatch(
      /Tools that change a Ticket return its summary; get_ticket reads the whole Ticket\./,
    );
    const extras: [tool: string, field: string][] = [
      ['update_ticket', 'summary'],
      ['update_ticket', 'blockedBy'],
      ['update_ticket', 'epicNumber'],
      ['update_ticket', 'archived'],
      ['abandon_work', 'claim'],
      ['check_criterion', 'acceptanceCriteria'],
    ];
    for (const [tool, field] of extras) {
      expect(description(tool), tool).toMatch(/summary/);
      expect(description(tool), tool).toContain(field);
      expect(description(tool), tool).toContain('detail: "full"');
      expect(description(tool), tool).not.toMatch(/and return (it|the)/);
    }
    await client.close();
  });

  it('keeps refusals as they were', async () => {
    const client = await connectMcpClient(createTestTickets());

    const result = await client.callTool({
      name: 'update_ticket',
      arguments: { number: 42, status: 'Done', detail: 'summary' },
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe('There is no Ticket T42.');
    await client.close();
  });
});

/**
 * The paths in JSON schema `schema` of the objects that accept fields they do
 * not list: those without `additionalProperties: false`.
 */
function openObjects(schema: unknown, path: string): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((item, index) =>
      openObjects(item, `${path}[${index}]`),
    );
  }
  if (typeof schema !== 'object' || schema === null) {
    return [];
  }
  const node = schema as Record<string, unknown>;
  const own =
    node.type === 'object' && node.additionalProperties !== false ? [path] : [];
  return [
    ...own,
    ...Object.entries(node).flatMap(([key, value]) =>
      openObjects(value, `${path}.${key}`),
    ),
  ];
}

describe("Project of the caller's folder", () => {
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
    return { tickets, root, website, blog };
  };

  it('creates a Ticket in the Project of the header folder', async () => {
    const { tickets, root, website } = setup();
    const client = await connectMcpClient(tickets, { cwd: root });

    const created = resultJson(
      await fileTicket(client, { title: 'From a terminal' }),
    ) as { number: number };

    expect(tickets.getTicket(created.number).projectId).toBe(website.id);
    await client.close();
  });

  it('lets an explicit projectName win over the folder', async () => {
    const { tickets, root, blog } = setup();
    const client = await connectMcpClient(tickets, { cwd: root });

    const created = resultJson(
      await fileTicket(client, { title: 'Feedback', projectName: 'Blog' }),
    ) as { number: number };

    expect(tickets.getTicket(created.number).projectId).toBe(blog.id);
    await client.close();
  });

  it('refuses an unknown folder, naming the Projects', async () => {
    const { tickets } = setup();
    const client = await connectMcpClient(tickets, { cwd: folder() });

    const result = await fileTicket(client, { title: 'Lost' });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(
      /No Project has a repository containing .*Pass projectName: one of "Blog", "Website"/,
    );
    await client.close();
  });

  it('refuses a write from an archived Project folder as it does naming the Project', async () => {
    const { tickets, root, website } = setup();
    tickets.archiveProject(website.id);
    const client = await connectMcpClient(tickets, { cwd: root });
    const byName = await fileTicket(client, {
      title: 'Named',
      projectName: 'Website',
    });

    const result = await fileTicket(client, { title: 'From the folder' });

    expect(byName.isError).toBe(true);
    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(resultText(byName));
    await client.close();
  });

  it('names only unarchived Projects when the folder belongs to none', async () => {
    const { tickets } = setup();
    tickets.archiveProject(tickets.createProject({ name: 'Old site' }).id);
    const client = await connectMcpClient(tickets, { cwd: folder() });

    const result = await fileTicket(client, { title: 'Lost' });

    expect(resultText(result)).toMatch(/one of "Blog", "Website"\./);
    expect(resultText(result)).not.toMatch(/Old site/);
    await client.close();
  });

  it('asks for a Project when the request carries no folder', async () => {
    const { tickets } = setup();
    const client = await connectMcpClient(tickets);

    const result = await fileTicket(client, { title: 'Lost' });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/Choose a Project/);
    await client.close();
  });

  it("lists the folder's Project by default, and every Project with allProjects", async () => {
    const { tickets, root, website, blog } = setup();
    const mine = tickets.createTicket({ projectId: website.id, title: 'Mine' });
    const theirs = tickets.createTicket({
      projectId: blog.id,
      title: 'Theirs',
    });
    const client = await connectMcpClient(tickets, { cwd: root });
    const numbers = async (args: Record<string, unknown>) =>
      (
        resultJson(
          await client.callTool({ name: 'find_tickets', arguments: args }),
        ) as {
          tickets: { number: number }[];
        }
      ).tickets.map((ticket) => ticket.number);

    expect(await numbers({})).toEqual([mine.number]);
    expect(await numbers({ allProjects: true })).toEqual([
      mine.number,
      theirs.number,
    ]);
    expect(await numbers({ projectName: 'Blog' })).toEqual([theirs.number]);
    await client.close();
  });

  it("lists every Project's Tickets when the folder belongs to none", async () => {
    const { tickets, website } = setup();
    const only = tickets.createTicket({ projectId: website.id, title: 'Mine' });
    const client = await connectMcpClient(tickets, { cwd: folder() });

    const page = resultJson(
      await client.callTool({ name: 'find_tickets', arguments: {} }),
    ) as { tickets: { number: number }[] };

    expect(page.tickets.map((ticket) => ticket.number)).toEqual([only.number]);
    await client.close();
  });

  it('says in the instructions that the Project defaults from the folder', async () => {
    const client = await connectMcpClient(createTestTickets());

    const text = client.getInstructions() ?? '';

    expect(text).toMatch(/folder/);
    expect(text).not.toMatch(/repository's instructions name a Project/);
    await client.close();
  });
});
