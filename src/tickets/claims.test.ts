// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError } from './errors';

const createTicket = (tickets: ReturnType<typeof createTestTickets>) => {
  const project = tickets.createProject({ name: 'Website' });
  return tickets.createTicket({
    projectId: project.id,
    title: 'Fix the header',
  });
};

describe('Ticket claims', () => {
  it('records the Agent run that claims a Ticket', () => {
    const tickets = createTestTickets();
    const ticket = createTicket(tickets);

    const claimed = tickets.claimTicket(ticket.number, {
      agentRunId: 'run-1',
      agentName: 'Frontend Agent',
    });

    expect(claimed.claim).toEqual({
      agentRunId: 'run-1',
      agentName: 'Frontend Agent',
    });
    expect(tickets.getTicket(ticket.number).claim).toEqual(claimed.claim);
  });

  it('keeps the original claim when the same Agent run claims again', () => {
    const tickets = createTestTickets();
    const ticket = createTicket(tickets);
    const original = tickets.claimTicket(ticket.number, {
      agentRunId: 'run-1',
      agentName: 'Frontend Agent',
    });

    const repeated = tickets.claimTicket(ticket.number, {
      agentRunId: 'run-1',
      agentName: 'Renamed Agent',
    });

    expect(repeated.claim).toEqual(original.claim);
  });

  it('refuses another Agent run and identifies the current claimant', () => {
    const tickets = createTestTickets();
    const ticket = createTicket(tickets);
    tickets.claimTicket(ticket.number, {
      agentRunId: 'run-1',
      agentName: 'Frontend Agent',
    });

    expect(
      errorFrom(() =>
        tickets.claimTicket(ticket.number, {
          agentRunId: 'run-2',
          agentName: 'Backend Agent',
        }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Ticket #${ticket.number} is already claimed by Frontend Agent (run-1).`,
      ),
    );
    expect(tickets.getTicket(ticket.number).claim).toEqual({
      agentRunId: 'run-1',
      agentName: 'Frontend Agent',
    });
  });

  it('allows an Agent run to release its own claim', () => {
    const tickets = createTestTickets();
    const ticket = createTicket(tickets);
    tickets.claimTicket(ticket.number, { agentRunId: 'run-1' });

    const released = tickets.releaseTicketClaim(ticket.number, {
      agentRunId: 'run-1',
    });

    expect(released.claim).toBeNull();
    expect(tickets.getTicket(ticket.number).claim).toBeNull();
  });

  it('refuses to release a claim held by another Agent run', () => {
    const tickets = createTestTickets();
    const ticket = createTicket(tickets);
    tickets.claimTicket(ticket.number, {
      agentRunId: 'run-1',
      agentName: 'Frontend Agent',
    });

    expect(
      errorFrom(() =>
        tickets.releaseTicketClaim(ticket.number, { agentRunId: 'run-2' }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Ticket #${ticket.number} is claimed by Frontend Agent (run-1); only that Agent run can release it.`,
      ),
    );
    expect(tickets.getTicket(ticket.number).claim).toEqual({
      agentRunId: 'run-1',
      agentName: 'Frontend Agent',
    });
  });

  it('filters claimed and unclaimed Tickets while finding work', () => {
    const tickets = createTestTickets();
    const unclaimed = createTicket(tickets);
    const claimed = tickets.createTicket({
      projectId: unclaimed.projectId,
      title: 'Add the footer',
    });
    tickets.claimTicket(claimed.number, { agentRunId: 'run-1' });

    const unclaimedPage = tickets.findTickets({
      status: 'Todo',
      blocked: false,
      claimed: false,
    });
    const claimedPage = tickets.findTickets({ claimed: true, detail: 'full' });

    expect(unclaimedPage.tickets.map(({ number }) => number)).toEqual([
      unclaimed.number,
    ]);
    expect(claimedPage.tickets.map(({ number }) => number)).toEqual([
      claimed.number,
    ]);
    expect(claimedPage.tickets).toMatchObject([
      { claim: { agentRunId: 'run-1', agentName: null } },
    ]);
  });

  it('lets the User clear a Ticket claim', () => {
    const tickets = createTestTickets();
    const ticket = createTicket(tickets);
    tickets.claimTicket(ticket.number, {
      agentRunId: 'run-1',
      agentName: 'Frontend Agent',
    });

    const cleared = tickets.clearTicketClaim(ticket.number);

    expect(cleared.claim).toBeNull();
    expect(tickets.getTicket(ticket.number).claim).toBeNull();
  });

  it('releases the claim when a Ticket moves to Done', () => {
    const tickets = createTestTickets();
    const ticket = createTicket(tickets);
    tickets.claimTicket(ticket.number, { agentRunId: 'run-1' });

    const completed = tickets.updateTicket(ticket.number, { status: 'Done' });

    expect(completed.status).toBe('Done');
    expect(completed.claim).toBeNull();
    expect(tickets.getTicket(ticket.number).claim).toBeNull();
  });

  it('announces a claim change to live-update subscribers', () => {
    const tickets = createTestTickets();
    const ticket = createTicket(tickets);
    const listener = vi.fn();
    tickets.subscribe(listener);

    tickets.claimTicket(ticket.number, { agentRunId: 'run-1' });

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: 'ticket',
      number: ticket.number,
    });
  });
});
