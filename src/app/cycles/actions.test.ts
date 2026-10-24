// @vitest-environment node

import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../test/tickets';
import { appTickets } from '../../tickets/app-tickets';
import {
  archiveCycle,
  createCycle,
  discardCycle,
  planTicket,
  renameCycle,
  startCycle,
  unplanTicket,
} from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));

/** A Tickets module with a Project and one Ticket, used by the actions. */
function appWithTicket() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the header',
  });
  vi.mocked(appTickets).mockReturnValue(tickets);
  return { tickets, project, ticket };
}

describe('Cycle actions', () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it('creates, renames and discards a Cycle, refreshing every Project page', async () => {
    const { tickets, project } = appWithTicket();

    const created = await createCycle({ projectId: project.id, title: 'Beta' });
    if (!created.ok) {
      throw new Error(created.error);
    }
    expect(tickets.getCycle(created.cycleId)).toMatchObject({
      title: 'Beta',
      state: 'Prepared',
    });

    await expect(
      renameCycle({ cycleId: created.cycleId, title: 'Launch' }),
    ).resolves.toEqual({ ok: true });
    expect(tickets.getCycle(created.cycleId).title).toBe('Launch');

    await expect(discardCycle({ cycleId: created.cycleId })).resolves.toEqual({
      ok: true,
    });
    expect(tickets.listCycles(project.id)).toEqual([]);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/project/[id]', 'layout'],
      ['/project/[id]', 'layout'],
      ['/project/[id]', 'layout'],
    ]);
  });

  it('plans a Ticket into a Cycle and out again', async () => {
    const { tickets, project, ticket } = appWithTicket();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    await expect(
      planTicket({ cycleId: cycle.id, number: ticket.number }),
    ).resolves.toEqual({ ok: true });
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([ticket.number]);

    await expect(
      unplanTicket({ cycleId: cycle.id, number: ticket.number }),
    ).resolves.toEqual({ ok: true });
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith('/project/[id]', 'layout');
  });

  it('starts a Cycle, and returns why a second one may not start', async () => {
    const { tickets, project } = appWithTicket();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });

    await expect(startCycle({ cycleId: beta.id })).resolves.toEqual({
      ok: true,
    });
    expect(tickets.getCycle(beta.id).state).toBe('Active');
    await expect(startCycle({ cycleId: launch.id })).resolves.toEqual({
      ok: false,
      error:
        'The Cycle "Beta" is Active. Starting another archives it, so confirm that first.',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/project/[id]', 'layout');
  });

  it('archives an Active Cycle, and returns why a Prepared one may not be', async () => {
    const { tickets, project } = appWithTicket();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.startCycle(beta.id);

    await expect(archiveCycle({ cycleId: beta.id })).resolves.toEqual({
      ok: true,
    });
    expect(tickets.getCycle(beta.id).state).toBe('Archived');
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    await expect(archiveCycle({ cycleId: launch.id })).resolves.toEqual({
      ok: false,
      error:
        'The Cycle "Launch" is Prepared. Only an Active Cycle can be archived; discard a Prepared one instead.',
    });
  });

  it('starts a Cycle over the Active one when the archive is confirmed', async () => {
    const { tickets, project, ticket } = appWithTicket();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: beta.id, number: ticket.number });
    tickets.startCycle(beta.id);
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });

    await expect(
      startCycle({ cycleId: launch.id, archiveActive: true }),
    ).resolves.toEqual({ ok: true });
    expect(tickets.getCycle(beta.id).state).toBe('Archived');
    expect(tickets.getCycle(launch.id)).toMatchObject({
      state: 'Active',
      ticketNumbers: [ticket.number],
    });
  });

  it("returns the module's reason a change was refused", async () => {
    const { tickets, project, ticket } = appWithTicket();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.updateTicket(ticket.number, { status: 'Done' });

    await expect(
      createCycle({ projectId: project.id, title: '' }),
    ).resolves.toEqual({
      ok: false,
      error: 'Enter a title.',
      fieldErrors: { title: 'Enter a title.' },
    });
    await expect(
      planTicket({ cycleId: cycle.id, number: ticket.number }),
    ).resolves.toEqual({
      ok: false,
      error: `Ticket #${ticket.number} is Done. Only open Tickets can be planned into a Cycle.`,
    });
  });
});
