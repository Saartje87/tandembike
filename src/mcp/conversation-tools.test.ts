// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConversationReader } from '../conversations/conversation-reader';
import { createTestConversations } from '../test/conversations';
import { connectMcpClient, resultJson, resultText } from '../test/mcp';

afterEach(() => {
  vi.useRealTimers();
});

const setup = async () => {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
  });
  const ticket = world.tickets.createTicket({
    projectId: project.id,
    title: 'Fix it',
  });
  const client = await connectMcpClient(world.tickets, {
    conversations: createConversationReader(world.db, world.tickets),
  });
  return { ...world, project, ticket, client };
};

const call = (
  client: Awaited<ReturnType<typeof setup>>['client'],
  args: Record<string, unknown>,
) => client.callTool({ name: 'get_conversations', arguments: args });

describe('get_conversations', () => {
  it("lists a Ticket's Conversations, newest first, with their state and timestamps", async () => {
    const { conversations, ticket, client } = await setup();
    const first = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'triage',
      prompt: 'Triage it',
    });
    const second = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'start',
    });

    const result = resultJson(
      await call(client, { number: ticket.number }),
    ) as { conversations: Record<string, unknown>[] };

    const latest = conversations.get(second.conversationId);
    expect(result.conversations).toEqual([
      {
        id: second.conversationId,
        intent: 'start',
        state: latest.state,
        startedBy: 'terminal',
        entryCount: conversations.transcript(second.conversationId).length,
        createdAt: latest.createdAt.toISOString(),
        updatedAt: latest.updatedAt.toISOString(),
      },
      expect.objectContaining({
        id: first.id,
        intent: 'triage',
        state: 'running',
        startedBy: 'user',
        entryCount: 1,
      }),
    ]);
    await client.close();
  });

  it("returns one Conversation's entries newest first, with the text trimmed", async () => {
    const { conversations, runner, ticket, client } = await setup();
    const conversation = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });
    const [run] = runner.runs;
    run.emit({ type: 'agent', text: 'x'.repeat(2000) });
    run.emit({
      type: 'tool',
      text: 'Read board.tsx',
      name: 'Read',
      input: { file_path: '/repo/board.tsx' },
    });

    const result = resultJson(
      await call(client, {
        number: ticket.number,
        conversationId: conversation.id,
      }),
    ) as {
      conversation: { id: number };
      entries: Record<string, unknown>[];
      nextBefore: number | null;
    };

    const transcript = conversations.transcript(conversation.id);
    expect(result.conversation.id).toBe(conversation.id);
    expect(result.nextBefore).toBeNull();
    expect(result.entries).toEqual([
      {
        id: transcript[2].id,
        role: 'tool',
        toolName: 'Read',
        text: 'Read board.tsx',
        createdAt: transcript[2].createdAt.toISOString(),
      },
      {
        id: transcript[1].id,
        role: 'agent',
        text: `${'x'.repeat(500)}…`,
        truncated: true,
        createdAt: transcript[1].createdAt.toISOString(),
      },
      {
        id: transcript[0].id,
        role: 'user',
        text: 'Go',
        createdAt: transcript[0].createdAt.toISOString(),
      },
    ]);
    await client.close();
  });

  it('returns the whole text and the tool input with full: true', async () => {
    const { conversations, runner, ticket, client } = await setup();
    const conversation = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });
    const [run] = runner.runs;
    run.emit({ type: 'agent', text: 'x'.repeat(2000) });
    run.emit({
      type: 'tool',
      text: 'Read board.tsx',
      name: 'Read',
      input: { file_path: '/repo/board.tsx' },
    });

    const result = resultJson(
      await call(client, {
        number: ticket.number,
        conversationId: conversation.id,
        full: true,
      }),
    ) as { entries: Record<string, unknown>[] };

    expect(result.entries[0]).toMatchObject({
      toolName: 'Read',
      toolInput: { file_path: '/repo/board.tsx' },
    });
    expect(result.entries[1]).toMatchObject({ text: 'x'.repeat(2000) });
    expect(result.entries[1]).not.toHaveProperty('truncated');
    await client.close();
  });

  it('returns when a permission request was answered, leaving it out while pending', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
    const { conversations, runner, ticket, client } = await setup();
    const conversation = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });
    const request = { toolName: 'Bash', input: {}, rules: [] };
    void runner.runs[0].options.askPermission(request);
    const answered = conversations.transcript(conversation.id).at(-1)?.id ?? 0;
    vi.setSystemTime(new Date('2026-11-10T10:00:30Z'));
    await conversations.answerPermission(answered, 'allow');
    void runner.runs[0].options.askPermission(request);

    const result = resultJson(
      await call(client, {
        number: ticket.number,
        conversationId: conversation.id,
      }),
    ) as { entries: Record<string, unknown>[] };

    expect(result.entries[0]).toMatchObject({ permission: 'pending' });
    expect(result.entries[0]).not.toHaveProperty('answeredAt');
    expect(result.entries[1]).toMatchObject({
      permission: 'allowed',
      answeredAt: '2026-11-10T10:00:30.000Z',
    });
    await client.close();
  });

  it('pages back through the entries with limit and before', async () => {
    const { conversations, runner, ticket, client } = await setup();
    const conversation = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });
    const [run] = runner.runs;
    for (const text of ['one', 'two', 'three', 'four']) {
      run.emit({ type: 'agent', text });
    }
    const texts = (result: unknown) =>
      (result as { entries: { text: string }[] }).entries.map(
        (entry) => entry.text,
      );

    const page1 = resultJson(
      await call(client, {
        number: ticket.number,
        conversationId: conversation.id,
        limit: 2,
      }),
    ) as { nextBefore: number };
    const page2 = resultJson(
      await call(client, {
        number: ticket.number,
        conversationId: conversation.id,
        limit: 2,
        before: page1.nextBefore,
      }),
    ) as { nextBefore: number };
    const page3 = resultJson(
      await call(client, {
        number: ticket.number,
        conversationId: conversation.id,
        limit: 2,
        before: page2.nextBefore,
      }),
    ) as { nextBefore: number | null };

    expect(texts(page1)).toEqual(['four', 'three']);
    expect(texts(page2)).toEqual(['two', 'one']);
    expect(texts(page3)).toEqual(['Go']);
    expect(page3.nextBefore).toBeNull();
    await client.close();
  });

  it('filters the entries to a time range with since and until', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-09T10:00:00Z'));
    const { conversations, runner, ticket, client } = await setup();
    const conversation = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });
    const [run] = runner.runs;
    vi.setSystemTime(new Date('2026-11-09T11:00:00Z'));
    run.emit({ type: 'agent', text: 'eleven' });
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
    run.emit({ type: 'agent', text: 'twelve' });

    const result = resultJson(
      await call(client, {
        number: ticket.number,
        conversationId: conversation.id,
        since: '2026-11-09T10:30:00Z',
        until: '2026-11-09T11:30:00Z',
      }),
    ) as { entries: { text: string }[] };

    expect(result.entries.map((entry) => entry.text)).toEqual(['eleven']);
    await client.close();
  });

  it('refuses an unknown Ticket and a Conversation of another Ticket', async () => {
    const { conversations, tickets, project, ticket, client } = await setup();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Other',
    });
    const conversation = await conversations.start({
      startedBy: 'user',
      ticketNumber: other.number,
      intent: 'start',
      prompt: 'Go',
    });

    const unknown = await call(client, { number: 9999 });
    const elsewhere = await call(client, {
      number: ticket.number,
      conversationId: conversation.id,
    });

    expect(unknown.isError).toBe(true);
    expect(resultText(unknown)).toMatch(/T9999/);
    expect(elsewhere.isError).toBe(true);
    expect(resultText(elsewhere)).toBe(
      `T${ticket.number} has no Conversation ${conversation.id}.`,
    );
    await client.close();
  });

  it('refuses a since that is not an ISO 8601 timestamp', async () => {
    const { conversations, ticket, client } = await setup();
    const conversation = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });

    const result = await call(client, {
      number: ticket.number,
      conversationId: conversation.id,
      since: 'yesterday',
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(
      'Give since as an ISO 8601 timestamp with a time zone, such as 2026-11-09T10:00:00Z.',
    );
    await client.close();
  });

  it('is read-only', async () => {
    const { client } = await setup();

    const { tools } = await client.listTools();

    expect(
      tools.find((tool) => tool.name === 'get_conversations')?.annotations,
    ).toMatchObject({ readOnlyHint: true });
    await client.close();
  });
});
