// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { createChangeChannel } from '../tickets/changes';
import { NotAllowedError } from '../tickets/errors';

async function setup() {
  const world = createTestConversations(createChangeChannel());
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
  });
  const ticket = world.tickets.createTicket({
    projectId: project.id,
    title: 'Fix it',
  });
  const conversation = await world.conversations.start({
    startedBy: 'user',
    ticketNumber: ticket.number,
    intent: 'start',
    prompt: 'Go.',
  });
  const path = conversation.worktreePath as string;
  return { ...world, project, ticket, conversation, path };
}

describe('Worktree cleanup', () => {
  it('removes a clean worktree when the Conversation is closed', async () => {
    const { conversations, worktrees, conversation, path } = await setup();

    const closed = await conversations.close(conversation.id);

    expect(worktrees.removed).toEqual([path]);
    expect(closed).toMatchObject({
      worktreePath: path,
      worktreeRemoved: true,
      worktreeKept: null,
    });
  });

  it.each(['dirty', 'unpushed'] as const)(
    'keeps a %s worktree on close and marks it kept',
    async (state) => {
      const { conversations, worktrees, conversation, path } = await setup();
      worktrees.states.set(path, state);

      const closed = await conversations.close(conversation.id);

      expect(worktrees.removed).toEqual([]);
      expect(closed).toMatchObject({
        worktreeKept: state,
        worktreeRemoved: false,
      });
    },
  );

  it('removes a clean worktree when its Ticket reaches Done', async () => {
    const { conversations, tickets, worktrees, conversation, ticket, path } =
      await setup();

    tickets.completeTicket(ticket.number);

    await vi.waitFor(() => expect(worktrees.removed).toEqual([path]));
    expect(conversations.get(conversation.id).worktreeRemoved).toBe(true);
  });

  it('keeps a dirty worktree when its Ticket reaches Done', async () => {
    const { conversations, tickets, worktrees, conversation, ticket, path } =
      await setup();
    worktrees.states.set(path, 'dirty');

    tickets.completeTicket(ticket.number);

    await vi.waitFor(() =>
      expect(conversations.get(conversation.id).worktreeKept).toBe('dirty'),
    );
    expect(worktrees.removed).toEqual([]);
  });

  it('removes a kept worktree on request once it is clean, and refuses while it is still dirty', async () => {
    const { conversations, worktrees, conversation, path } = await setup();
    worktrees.states.set(path, 'dirty');
    await conversations.close(conversation.id);

    const refusal = await conversations
      .removeWorktree(conversation.id)
      .catch((error) => error);
    expect(refusal).toBeInstanceOf(NotAllowedError);
    expect(refusal.message).toContain('uncommitted changes');
    expect(worktrees.removed).toEqual([]);

    worktrees.states.set(path, 'clean');
    const removed = await conversations.removeWorktree(conversation.id);

    expect(worktrees.removed).toEqual([path]);
    expect(removed).toMatchObject({
      worktreeRemoved: true,
      worktreeKept: null,
    });
  });

  it('removes the clean worktrees of closed Conversations at server start, and keeps dirty ones', async () => {
    const { conversations, restart, worktrees, conversation, path } =
      await setup();
    worktrees.states.set(path, 'dirty');
    await conversations.close(conversation.id);
    worktrees.states.set(path, 'clean');

    await restart().cleanupWorktrees();

    expect(worktrees.removed).toEqual([path]);
  });

  it('removes the clean worktrees of Conversations that no longer exist at server start', async () => {
    const { restart, worktrees, project } = await setup();
    const orphan = `/fake/worktrees/${project.id}/c999`;
    const dirty = `/fake/worktrees/${project.id}/c998`;
    worktrees.states.set(orphan, 'clean');
    worktrees.states.set(dirty, 'dirty');
    worktrees.listed = [
      { path: orphan, projectId: project.id, conversationId: 999 },
      { path: dirty, projectId: project.id, conversationId: 998 },
    ];

    await restart().cleanupWorktrees();

    expect(worktrees.removed).toEqual([orphan]);
  });

  it('leaves the worktree of an open Conversation alone at server start', async () => {
    const { restart, worktrees, conversation, project } = await setup();
    worktrees.listed = [
      {
        path: conversation.worktreePath as string,
        projectId: project.id,
        conversationId: conversation.id,
      },
    ];

    await restart().cleanupWorktrees();

    expect(worktrees.removed).toEqual([]);
  });
});
