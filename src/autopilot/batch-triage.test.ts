import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { createChangeChannel } from '../tickets/changes';
import { createAutopilot } from './autopilot';

function setup() {
  vi.useFakeTimers({ toFake: ['Date'] });
  const changes = createChangeChannel();
  const world = createTestConversations(changes);
  const { tickets, conversations } = world;
  const project = tickets.createProject({ name: 'Website' });
  tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    autoTriage: true,
    triageCeilingUsd: 5,
  });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  const autopilot = createAutopilot({ tickets, conversations, changes });
  let minute = 0;
  /** A Ticket created a minute after the last, so oldest first is clear. */
  const idea = (
    title: string,
    extra: {
      labels?: string[];
      cycleId?: number;
      type?: 'Epic';
    } = {},
  ) => {
    minute += 1;
    vi.setSystemTime(new Date(2026, 10, 10, 9, minute));
    return tickets.createTicket({ projectId: project.id, title, ...extra });
  };
  const triages = () =>
    conversations
      .list({ projectId: project.id })
      .filter((conversation) => conversation.intent === 'triage')
      .map((conversation) => conversation.ticketNumber);
  return { ...world, project, cycle, autopilot, idea, triages };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("A Board's Batch-triage Tickets (T1316)", () => {
  it("are a Cycle Board's Triage-eligible Tickets and Epics, oldest first", () => {
    const { tickets, project, cycle, autopilot, idea } = setup();
    const a = idea('A', { cycleId: cycle.id, labels: ['needs-triage'] });
    const epic = idea('Epic', { cycleId: cycle.id, type: 'Epic' });
    idea('In the Backlog');
    idea('Waits on the User', { cycleId: cycle.id, labels: ['needs-info'] });
    idea('Ready', { cycleId: cycle.id, labels: ['ready-for-agent'] });
    idea('Feedback', {
      cycleId: cycle.id,
      labels: ['needs-triage', 'from:agent-run'],
    });
    const proposed = idea('Proposed', { cycleId: cycle.id });
    tickets.proposeTriage(proposed.number, {
      category: 'bug',
      state: 'ready-for-agent',
      reasoning: 'Clear.',
    });
    const archived = idea('Archived', { cycleId: cycle.id });
    tickets.archiveTicket(archived.number);
    const started = idea('Started', { cycleId: cycle.id });
    tickets.updateTicket(started.number, { status: 'In progress' });
    // Board order is not age order.
    tickets.sortLane({
      projectId: project.id,
      status: 'Todo',
      cycleId: cycle.id,
      ticketNumbers: [epic.number, a.number],
    });

    expect(autopilot.batchTriageTickets(project.id, cycle.id)).toEqual([
      a.number,
      epic.number,
    ]);
  });

  it("are the Backlog's own, not a Cycle's", () => {
    const { project, cycle, autopilot, idea } = setup();
    idea('In the Cycle', { cycleId: cycle.id });
    const a = idea('A');
    const b = idea('B', { labels: ['needs-triage'] });
    idea('Waits on the User', { labels: ['needs-info'] });

    expect(autopilot.batchTriageTickets(project.id, null)).toEqual([
      a.number,
      b.number,
    ]);
  });

  it('leave out a Ticket under an open Triage Conversation', async () => {
    const { conversations, project, autopilot, idea } = setup();
    const a = idea('A');
    const b = idea('B');
    await conversations.start({
      startedBy: 'user',
      ticketNumber: a.number,
      intent: 'triage',
      prompt: `/tandembike:triage T${a.number}`,
    });

    expect(autopilot.batchTriageTickets(project.id, null)).toEqual([b.number]);
  });
});

describe('The hold of an open Batch triage (T1316)', () => {
  it('keeps Auto-triage off its listed Tickets until the User closes it', async () => {
    const { conversations, project, cycle, autopilot, idea, triages } = setup();
    const a = idea('A', { cycleId: cycle.id });
    const batch = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
      ticketNumbers: [a.number],
    });
    await conversations.stop(batch.id);

    await autopilot.evaluate();
    expect(triages()).toEqual([]);
    expect(
      autopilot
        .explain(project.id)
        .tickets.find((ticket) => ticket.number === a.number)?.triage,
    ).toEqual({
      eligible: false,
      reasons: [{ type: 'underTriageConversation', conversationId: batch.id }],
    });

    await conversations.close(batch.id);
    await autopilot.evaluate();
    expect(triages()).toEqual([a.number]);
  });

  it('holds only the listed Tickets: one filed later is triaged', async () => {
    const { conversations, project, autopilot, idea, triages } = setup();
    const a = idea('A');
    const batch = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: null,
      ticketNumbers: [a.number],
    });
    await conversations.stop(batch.id);
    const later = idea('Later');

    await autopilot.evaluate();

    expect(triages()).toEqual([later.number]);
  });
});
