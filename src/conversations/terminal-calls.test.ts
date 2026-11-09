// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { createChangeChannel } from '../tickets/changes';
import { statusLine } from './status-line';

const setup = async () => {
  const changes = createChangeChannel();
  const world = createTestConversations(changes);
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
  return { ...world, changes, ticket, conversationId };
};

describe('recordTerminalCall (T1238)', () => {
  it('appends a tool entry with the prefixed name that the Status line reads', async () => {
    const { conversations, conversationId, ticket } = await setup();

    conversations.recordTerminalCall(String(conversationId), 'update_ticket', {
      number: ticket.number,
      status: 'Done',
    });

    const last = conversations.transcript(conversationId).at(-1);
    expect(last).toMatchObject({
      role: 'tool',
      toolName: 'mcp__tandembike__update_ticket',
      toolInput: { number: ticket.number, status: 'Done' },
    });
    expect(statusLine(last as never)).toBe(`Updating T${ticket.number}`);
  });

  it('refreshes the last activity and announces the change', async () => {
    vi.useFakeTimers();
    try {
      const { conversations, conversationId, changes } = await setup();
      const seen: unknown[] = [];
      changes.subscribe((change) => seen.push(change));
      const before = conversations.get(conversationId).updatedAt;
      vi.advanceTimersByTime(5000);

      conversations.recordTerminalCall(String(conversationId), 'get_ticket', {
        number: 1,
      });

      expect(conversations.get(conversationId).updatedAt.getTime()).toBe(
        before.getTime() + 5000,
      );
      expect(seen).toContainEqual({
        type: 'conversation',
        id: conversationId,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores unknown ids, non-numeric ids, UI runs and ended sessions', async () => {
    const { conversations, conversationId, ticket, tickets } = await setup();
    const other = tickets.createTicket({
      projectId: ticket.projectId,
      title: 'Another',
    });
    const ui = await conversations.start({
      startedBy: 'user',
      ticketNumber: other.number,
      intent: 'start',
      prompt: 'Go',
    });
    const uiBefore = conversations.transcript(ui.id).length;

    conversations.recordTerminalCall('9999', 'get_ticket', {});
    conversations.recordTerminalCall('abc', 'get_ticket', {});
    conversations.recordTerminalCall(String(ui.id), 'get_ticket', {});
    await conversations.endTerminal(conversationId, { exitCode: 0 });
    const ended = conversations.transcript(conversationId).length;
    conversations.recordTerminalCall(String(conversationId), 'get_ticket', {});

    expect(conversations.transcript(ui.id)).toHaveLength(uiBefore);
    expect(conversations.transcript(conversationId)).toHaveLength(ended);
  });

  it('ignores a closed Terminal Conversation', async () => {
    const { conversations, conversationId } = await setup();
    await conversations.endTerminal(conversationId, { exitCode: 0 });
    await conversations.close(conversationId);
    const closed = conversations.transcript(conversationId).length;

    conversations.recordTerminalCall(String(conversationId), 'get_ticket', {});

    expect(conversations.transcript(conversationId)).toHaveLength(closed);
  });
});
