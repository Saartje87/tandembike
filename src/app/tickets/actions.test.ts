// @vitest-environment node

import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../test/tickets';
import { appTickets } from '../../tickets/app-tickets';
import {
  addTicketComment,
  addTicketLabel,
  archiveTicket,
  checkTicketAcceptanceCriterion,
  clearTicketClaim,
  createTicket,
  editTicketComment,
  removeTicketComment,
  removeTicketLabel,
  restoreTicket,
  setTicketAcceptanceCriteria,
  updateTicket,
} from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));

describe('Ticket actions', () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it('creates a Todo Ticket with needs-triage and refreshes its Board', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });

    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(tickets.getTicket(result.number)).toMatchObject({
      title: 'Fix the header',
      description: '',
      status: 'Todo',
      labels: ['needs-triage'],
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${project.id}`);
  });

  it('plans a Ticket created on a Cycle tab into that Cycle', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await createTicket({
      projectId: project.id,
      title: 'Fix the header',
      cycleId: cycle.id,
    });

    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([result.number]);
    expect(revalidatePath).toHaveBeenCalledWith(
      '/project/[id]/cycle/[cycleId]',
      'page',
    );
  });

  it('revalidates the project-scoped Ticket page after updates and archiving', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await updateTicket({ number: ticket.number, title: 'Fix the nav' });
    await archiveTicket({ number: ticket.number });
    await restoreTicket({ number: ticket.number });

    expect(
      vi
        .mocked(revalidatePath)
        .mock.calls.filter(
          ([path]) => path === '/project/[id]/ticket/[number]',
        ),
    ).toEqual([
      ['/project/[id]/ticket/[number]', 'page'],
      ['/project/[id]/ticket/[number]', 'page'],
      ['/project/[id]/ticket/[number]', 'page'],
    ]);
  });

  it("lets the User clear a claim and refreshes the Ticket's Board and drawer", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    tickets.claimTicket(ticket.number, {
      agentRunId: 'run-1',
      agentName: 'Frontend Agent',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await clearTicketClaim({ number: ticket.number });

    expect(result).toEqual({ ok: true });
    expect(tickets.getTicket(ticket.number).claim).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${project.id}`);
    expect(revalidatePath).toHaveBeenCalledWith(
      '/project/[id]/ticket/[number]',
      'page',
    );
  });

  it("returns the Ticket's Project after it is moved", async () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    const ticket = tickets.createTicket({
      projectId: website.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await updateTicket({
      number: ticket.number,
      projectId: app.id,
    });

    expect(result).toEqual({ ok: true, projectId: app.id });
  });

  it("adds and removes a label and refreshes the Ticket's Board and drawer", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const added = await addTicketLabel({ number: ticket.number, label: 'Bug' });

    expect(added).toEqual({ ok: true });
    expect(tickets.getTicket(ticket.number).labels).toEqual(['bug']);
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${project.id}`);
    expect(revalidatePath).toHaveBeenCalledWith(
      '/project/[id]/ticket/[number]',
      'page',
    );

    const removed = await removeTicketLabel({
      number: ticket.number,
      label: 'bug',
    });

    expect(removed).toEqual({ ok: true });
    expect(tickets.getTicket(ticket.number).labels).toEqual([]);
  });

  it('returns why a label was refused', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await addTicketLabel({ number: ticket.number, label: ' ' });

    expect(result).toEqual({
      ok: false,
      error: 'Enter a label.',
      fieldErrors: { labels: 'Enter a label.' },
    });
  });

  it("adds, edits and removes the User's comment and refreshes the drawer", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const added = await addTicketComment({
      number: ticket.number,
      body: 'Looks good.',
    });

    expect(added).toEqual({ ok: true });
    const [comment] = tickets.listComments(ticket.number);
    expect(comment).toMatchObject({ author: 'user', body: 'Looks good.' });
    expect(revalidatePath).toHaveBeenCalledWith(
      '/project/[id]/ticket/[number]',
      'page',
    );

    const edited = await editTicketComment({
      id: comment.id,
      body: 'Looks great.',
    });

    expect(edited).toEqual({ ok: true });
    expect(tickets.listComments(ticket.number)).toMatchObject([
      { body: 'Looks great.' },
    ]);

    const removed = await removeTicketComment({ id: comment.id });

    expect(removed).toEqual({ ok: true });
    expect(tickets.listComments(ticket.number)).toEqual([]);
  });

  it("lets the User edit and remove an Agent's comment", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    const comment = tickets.addComment(ticket.number, {
      body: 'By an Agent',
      author: 'agent',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    expect(await editTicketComment({ id: comment.id, body: 'Edited' })).toEqual(
      { ok: true },
    );
    expect(await removeTicketComment({ id: comment.id })).toEqual({ ok: true });
  });

  it('returns why a comment was refused', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await addTicketComment({ number: ticket.number, body: ' ' });

    expect(result).toEqual({
      ok: false,
      error: 'Enter a comment.',
      fieldErrors: { body: 'Enter a comment.' },
    });
  });

  it("replaces the acceptance criteria and refreshes the Ticket's Board and drawer", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      acceptanceCriteria: [
        { text: 'The logo is centred', checked: true },
        { text: 'The header is sticky' },
      ],
    });
    const [logo, sticky] = ticket.acceptanceCriteria;
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await setTicketAcceptanceCriteria({
      number: ticket.number,
      acceptanceCriteria: [
        { id: sticky.id, text: 'The header sticks' },
        { text: 'The search box is visible' },
        { id: logo.id, text: 'The logo is centred' },
      ],
    });

    expect(result).toEqual({ ok: true });
    expect(
      tickets
        .getTicket(ticket.number)
        .acceptanceCriteria.map(({ text, checked }) => ({ text, checked })),
    ).toEqual([
      { text: 'The header sticks', checked: false },
      { text: 'The search box is visible', checked: false },
      { text: 'The logo is centred', checked: true },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${project.id}`);
    expect(revalidatePath).toHaveBeenCalledWith(
      '/project/[id]/ticket/[number]',
      'page',
    );
  });

  it('checks and unchecks one acceptance criterion, leaving the Status alone', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      acceptanceCriteria: [{ text: 'The logo is centred' }],
    });
    const [logo] = ticket.acceptanceCriteria;
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await checkTicketAcceptanceCriterion({
      number: ticket.number,
      id: logo.id,
      checked: true,
    });

    expect(result).toEqual({ ok: true });
    expect(tickets.getTicket(ticket.number)).toMatchObject({
      status: 'Todo',
      acceptanceCriteria: [{ id: logo.id, checked: true }],
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${project.id}`);
  });

  it('returns why an acceptance criterion was refused', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await setTicketAcceptanceCriteria({
      number: ticket.number,
      acceptanceCriteria: [{ text: ' ' }],
    });

    expect(result).toEqual({
      ok: false,
      error: 'Enter text for each acceptance criterion.',
      fieldErrors: {
        acceptanceCriteria: 'Enter text for each acceptance criterion.',
      },
    });
  });
});
