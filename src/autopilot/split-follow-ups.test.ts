import { describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { createChangeChannel } from '../tickets/changes';
import { createSplitFollowUps } from './split-follow-ups';

const widget = {
  kind: 'choice' as const,
  prompt: 'Also redo the footer?',
  options: [{ label: 'Yes' }, { label: 'No' }],
  multiSelect: false,
  recommended: ['No'],
};

/** A Start whose Widget Auto-reply answered with a Split; the watcher listens. */
async function split(
  before: (world: {
    tickets: ReturnType<typeof createTestConversations>['tickets'];
    project: { id: number };
    ticket: { number: number };
  }) => void = () => {},
) {
  const changes = createChangeChannel();
  const world = createTestConversations(changes);
  const { tickets, conversations } = world;
  const project = tickets.createProject({ name: 'Website' });
  tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
  });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  tickets.startCycle(cycle.id);
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Build the header',
    cycleId: cycle.id,
  });
  await conversations.start({
    startedBy: 'autopilot',
    ticketNumber: ticket.number,
    intent: 'start',
    cycleId: cycle.id,
    prompt: 'Go',
  });
  const startRun = world.runner.runs[0];
  void startRun.options.askWidget(widget);
  const start = conversations.list({ ticketNumber: ticket.number })[0];
  const entryId = conversations.transcript(start.id).at(-1)?.id as number;
  const reply = await conversations.start({
    startedBy: 'autopilot',
    ticketNumber: ticket.number,
    intent: 'auto_reply',
    cycleId: cycle.id,
    autoReplyEntryId: entryId,
    prompt: 'Answer it',
  });
  before({ tickets, project, ticket });
  const stop = createSplitFollowUps({
    tickets,
    conversations,
    changes,
  }).start();
  await conversations.replyToQuestion(reply.id, {
    decision: 'split',
    reason: 'The footer is another Ticket.',
  });
  return { ...world, changes, project, ticket, startRun, entryId, stop };
}

describe('Split follow-ups (ADR 0054)', () => {
  it('waits while the Start run still works', async () => {
    const world = await split();

    expect(world.conversations.splitRepliesAwaitingFollowUp()).toHaveLength(1);
    expect(world.tickets.listComments(world.ticket.number)).toEqual([]);
    world.stop();
  });

  it('marks the follow-up filed when the Start filed a Ticket with its Ticket as Origin, and notes nothing', async () => {
    const world = await split();
    world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Redo the footer',
      originNumber: world.ticket.number,
    });

    world.startRun.emit({ type: 'turn', cost: 1 });

    expect(world.conversations.splitRepliesAwaitingFollowUp()).toEqual([]);
    expect(world.conversations.missingSplitFollowUps()).toEqual([]);
    expect(world.tickets.listComments(world.ticket.number)).toEqual([]);
    world.stop();
  });

  it('notes on the Ticket, once, that the Start ended without the follow-up, and marks it missing', async () => {
    const world = await split();

    world.startRun.emit({ type: 'turn', cost: 1 });
    world.changes.publish({ type: 'ticket', number: world.ticket.number });

    expect(world.conversations.missingSplitFollowUps()).toEqual([
      expect.objectContaining({
        entryId: world.entryId,
        ticketNumber: world.ticket.number,
      }),
    ]);
    const comments = world.tickets.listComments(world.ticket.number);
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe(
      'Auto-reply split off a question of the Start run, asking it to file a follow-up with this Ticket as Origin, but the run ended without filing one. File it yourself if the matter still needs doing:\n\n> Also redo the footer?',
    );
    world.stop();
  });

  it('does not count a Ticket with that Origin filed before the Split', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const world = await split((before) => {
      before.tickets.createTicket({
        projectId: before.project.id,
        title: 'Split off earlier',
        originNumber: before.ticket.number,
      });
      vi.setSystemTime(Date.now() + 1000);
    });

    world.startRun.emit({ type: 'turn', cost: 1 });

    expect(world.conversations.missingSplitFollowUps()).toHaveLength(1);
    world.stop();
    vi.useRealTimers();
  });
});
