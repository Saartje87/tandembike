// @vitest-environment node

import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../test/tickets';
import { appTickets } from '../../tickets/app-tickets';
import {
  addTicketComment,
  addTicketLabel,
  archiveTicket,
  attachTicketToEpic,
  checkTicketAcceptanceCriterion,
  clearTicketClaim,
  createTicket,
  deleteTicket,
  editTicketComment,
  moveTickets,
  removeTicketComment,
  removeTicketLabel,
  restoreTicket,
  setTicketAcceptanceCriteria,
  setTicketOrigin,
  updateTicket,
} from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));

describe('Ticket actions', () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it('deletes a Ticket and refreshes its Boards, leaving navigation to the drawer', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await deleteTicket({ number: ticket.number });

    expect(result).toEqual({ ok: true });
    expect(tickets.listTickets({ projectId: project.id })).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${project.id}`);
  });

  it('moves several Tickets into a lane and refreshes the Boards', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const [a, b] = ['A', 'B'].map(
      (title) => tickets.createTicket({ projectId: project.id, title }).number,
    );
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await moveTickets({
      projectId: project.id,
      ticketNumbers: [b, a],
      status: 'Done',
      before: null,
    });

    expect(result).toEqual({ ok: true });
    expect(
      tickets
        .listTickets({ projectId: project.id, status: 'Done' })
        .sort((left, right) => left.position - right.position)
        .map(({ number }) => number),
    ).toEqual([b, a]);
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${project.id}`);
  });

  it('refuses a move with the reason the Tickets module gives', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await moveTickets({
      projectId: project.id,
      ticketNumbers: [42],
      status: 'Done',
      before: null,
    });

    expect(result).toEqual({ ok: false, error: 'There is no Ticket T42.' });
  });

  it('deletes an Epic and detaches its children, or deletes them too when asked', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epicWith = (title: string) => {
      const epic = tickets.createTicket({
        projectId: project.id,
        title,
        type: 'Epic',
      });
      const child = tickets.createTicket({
        projectId: project.id,
        title: `${title} child`,
        epicNumber: epic.number,
      });
      return { epic, child };
    };
    const kept = epicWith('Kept');
    const gone = epicWith('Gone');
    vi.mocked(appTickets).mockReturnValue(tickets);

    await deleteTicket({ number: kept.epic.number });
    await deleteTicket({ number: gone.epic.number, withChildren: true });

    expect(
      tickets.listTickets({ projectId: project.id }).map(({ title }) => title),
    ).toEqual(['Kept child']);
  });

  it('moves a Ticket from its Epic to another and refreshes the Boards', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const from = tickets.createTicket({
      projectId: project.id,
      title: 'Payments',
      type: 'Epic',
    });
    const to = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: from.number,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await attachTicketToEpic({
      epic: to.number,
      child: child.number,
    });

    expect(result).toEqual({ ok: true });
    expect(tickets.getTicket(child.number).epic?.number).toBe(to.number);
    expect(revalidatePath).toHaveBeenCalledWith('/project/[id]', 'page');
  });

  it("changes an Epic's colour and refreshes the Boards", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await updateTicket({ number: epic.number, color: 'teal' });

    expect(result).toEqual({ ok: true, projectId: project.id });
    expect(tickets.getTicket(epic.number).color).toBe('teal');
    expect(revalidatePath).toHaveBeenCalledWith('/project/[id]', 'page');
  });

  it('returns a refused deletion as an error', async () => {
    const tickets = createTestTickets();
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await deleteTicket({ number: 42 });

    expect(result).toEqual({ ok: false, error: 'There is no Ticket T42.' });
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

  it('revalidates the Cycle Boards, whose drawers show the Ticket, after updates and archiving', async () => {
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
          ([path]) => path === '/project/[id]/cycle/[cycleId]',
        ),
    ).toEqual([
      ['/project/[id]/cycle/[cycleId]', 'page'],
      ['/project/[id]/cycle/[cycleId]', 'page'],
      ['/project/[id]/cycle/[cycleId]', 'page'],
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
      '/project/[id]/cycle/[cycleId]',
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
      '/project/[id]/cycle/[cycleId]',
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
      '/project/[id]/cycle/[cycleId]',
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
      '/project/[id]/cycle/[cycleId]',
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

  it("sets and clears a Ticket's Origin and refreshes the Boards whose drawers show it", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const spec = tickets.createTicket({ projectId: project.id, title: 'Spec' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const set = await setTicketOrigin({
      number: ticket.number,
      originNumber: spec.number,
    });
    const origin = tickets.getTicket(ticket.number).origin;
    const cleared = await setTicketOrigin({
      number: ticket.number,
      originNumber: null,
    });

    expect(set).toEqual({ ok: true });
    expect(origin?.number).toBe(spec.number);
    expect(cleared).toEqual({ ok: true });
    expect(tickets.getTicket(ticket.number).origin).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith('/project/[id]', 'page');
    expect(revalidatePath).toHaveBeenCalledWith(
      '/project/[id]/cycle/[cycleId]',
      'page',
    );
  });

  it('returns why an Origin was refused', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await setTicketOrigin({
      number: ticket.number,
      originNumber: ticket.number,
    });

    expect(result).toEqual({
      ok: false,
      error: 'A Ticket cannot be its own Origin.',
      fieldErrors: { originNumber: 'A Ticket cannot be its own Origin.' },
    });
  });
});
