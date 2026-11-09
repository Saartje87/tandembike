// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { statusLine } from '../conversations/status-line';
import { createTestConversations } from '../test/conversations';
import { connectMcpClient } from '../test/mcp';

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
  const { conversationId } = await world.conversations.startTerminal({
    ticketNumber: ticket.number,
    intent: 'start',
  });
  const onToolCall = (runId: string, name: string, input: object) =>
    world.conversations.recordTerminalCall(
      runId,
      name,
      input as Record<string, unknown>,
    );
  return { ...world, ticket, conversationId, onToolCall };
};

describe('The tool call hook (T1238)', () => {
  it('makes a call with the run header the latest Status line entry of a Terminal Conversation', async () => {
    const { tickets, conversations, conversationId, ticket, onToolCall } =
      await setup();
    const client = await connectMcpClient(tickets, {
      runId: String(conversationId),
      onToolCall,
    });

    await client.callTool({
      name: 'add_note',
      arguments: { number: ticket.number, body: 'Hello' },
    });

    const last = conversations.transcript(conversationId).at(-1);
    expect(statusLine(last as never)).toBe(`Commenting on T${ticket.number}`);
    await client.close();
  });

  it('records nothing for another run id, a UI run or no header', async () => {
    const { tickets, conversations, conversationId, ticket, onToolCall } =
      await setup();
    const before = conversations.transcript(conversationId).length;
    const hook = vi.fn(onToolCall);

    for (const runId of ['9999', 'conv-7', undefined]) {
      const client = await connectMcpClient(tickets, {
        runId,
        onToolCall: hook,
      });
      await client.callTool({
        name: 'get_ticket',
        arguments: { number: ticket.number },
      });
      await client.close();
    }

    expect(conversations.transcript(conversationId)).toHaveLength(before);
    expect(hook).toHaveBeenCalledTimes(2); // none without the header
  });
});
