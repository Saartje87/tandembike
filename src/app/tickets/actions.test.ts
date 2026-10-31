// @vitest-environment node

import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../test/tickets';
import { appTickets } from '../../tickets/app-tickets';
import {
  addTicketAttachments,
  addTicketComment,
  addTicketExternalReference,
  addTicketLabel,
  archiveTicket,
  archiveTickets,
  attachTicketToEpic,
  checkTicketAcceptanceCriterion,
  clearTicketClaim,
  createTicket,
  deleteTicket,
  editTicketComment,
  moveTickets,
  moveTicketsToEpic,
  removeTicketAttachment,
  removeTicketComment,
  removeTicketExternalReference,
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

  it('archives several Tickets and refreshes the Boards', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const [a, b] = ['A', 'B'].map(
      (title) => tickets.createTicket({ projectId: project.id, title }).number,
    );
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await archiveTickets({ ticketNumbers: [a, b] });

    expect(result).toEqual({ ok: true });
    expect(tickets.getTicket(a).archived).toBe(true);
    expect(tickets.getTicket(b).archived).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith('/project/[id]', 'page');
    expect(revalidatePath).toHaveBeenCalledWith(
      '/project/[id]/cycle/[cycleId]',
      'page',
    );
  });

  it('archives an Epic with its children only when asked to', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const refused = await archiveTicket({ number: epic.number });

    expect(refused).toEqual({
      ok: false,
      error: `Epic T${epic.number} has child Tickets that are not archived: T${child.number}. Archive or detach them first.`,
    });

    const result = await archiveTicket({
      number: epic.number,
      withChildren: true,
    });

    expect(result).toEqual({ ok: true });
    expect(tickets.getTicket(epic.number).archived).toBe(true);
    expect(tickets.getTicket(child.number).archived).toBe(true);
  });

  it('archives a selection with the children of its Epics when asked to', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await archiveTickets({
      ticketNumbers: [epic.number],
      withChildren: true,
    });

    expect(result).toEqual({ ok: true });
    expect(tickets.getTicket(child.number).archived).toBe(true);
  });

  it('refuses to archive several Tickets with the reason the Tickets module gives', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const a = tickets.createTicket({ projectId: project.id, title: 'A' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await archiveTickets({ ticketNumbers: [a.number, 42] });

    expect(result).toEqual({ ok: false, error: 'There is no Ticket T42.' });
    expect(tickets.getTicket(a.number).archived).toBe(false);
  });

  it('moves several Tickets into an Epic and refreshes the Boards', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const [a, b] = ['A', 'B'].map(
      (title) => tickets.createTicket({ projectId: project.id, title }).number,
    );
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await moveTicketsToEpic({
      epic: epic.number,
      children: [a, b],
    });

    expect(result).toEqual({ ok: true });
    expect(
      tickets.getTicket(epic.number).children.map(({ number }) => number),
    ).toEqual([a, b]);
    expect(revalidatePath).toHaveBeenCalledWith('/project/[id]', 'page');
  });

  it('refuses a move into an Epic with the reason the Tickets module gives', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await moveTicketsToEpic({
      epic: epic.number,
      children: [42],
    });

    expect(result).toEqual({ ok: false, error: 'There is no Ticket T42.' });
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

  it("adds and removes an External reference and refreshes the Ticket's drawer", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const added = await addTicketExternalReference({
      number: ticket.number,
      reference: ' #55 ',
    });

    expect(added).toEqual({ ok: true });
    expect(tickets.getTicket(ticket.number).externalReferences).toEqual([
      '#55',
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${project.id}`);

    const removed = await removeTicketExternalReference({
      number: ticket.number,
      reference: '#55',
    });

    expect(removed).toEqual({ ok: true });
    expect(tickets.getTicket(ticket.number).externalReferences).toEqual([]);
  });

  it('returns why an External reference was refused', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const result = await addTicketExternalReference({
      number: ticket.number,
      reference: 'javascript:alert(1)',
    });

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        externalReferences: expect.stringMatching(
          /^"javascript:alert\(1\)" is not a valid URL or key\./,
        ),
      },
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

  it('removes an Attachment as the User and refreshes the drawer', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const attachment = tickets.addAttachment(ticket.number, {
      name: 'a.txt',
      content: new Uint8Array([1]),
      author: 'agent',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    expect(await removeTicketAttachment({ id: attachment.id })).toEqual({
      ok: true,
    });
    expect(tickets.getTicket(ticket.number).attachments).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith('/project/[id]', 'page');

    expect(await removeTicketAttachment({ id: attachment.id })).toEqual({
      ok: false,
      error: `There is no Attachment ${attachment.id}.`,
    });
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

  describe('adding Attachments', () => {
    const setup = () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      const ticket = tickets.createTicket({
        projectId: project.id,
        title: 'Fix the header',
      });
      vi.mocked(appTickets).mockReturnValue(tickets);
      return { tickets, ticket };
    };
    const formOf = (number: number, ...files: File[]) => {
      const form = new FormData();
      form.set('number', String(number));
      for (const file of files) {
        form.append('files', file);
      }
      return form;
    };

    it("adds each file as the User's Attachment and refreshes the drawer", async () => {
      const { tickets, ticket } = setup();

      const result = await addTicketAttachments(
        formOf(
          ticket.number,
          new File(['one'], 'a.txt', { type: 'text/plain' }),
          new File(['two'], 'b.png', { type: 'image/png' }),
        ),
      );

      expect(result).toEqual({ ok: true });
      expect(tickets.getTicket(ticket.number).attachments).toMatchObject([
        { name: 'a.txt', mediaType: 'text/plain', size: 3, author: 'user' },
        { name: 'b.png', mediaType: 'image/png', size: 3, author: 'user' },
      ]);
      expect(tickets.listActivity(ticket.number).slice(-2)).toMatchObject([
        {
          actor: 'user',
          changes: [{ type: 'attachmentAdded', name: 'a.txt' }],
        },
        {
          actor: 'user',
          changes: [{ type: 'attachmentAdded', name: 'b.png' }],
        },
      ]);
      expect(revalidatePath).toHaveBeenCalledWith(
        '/project/[id]/cycle/[cycleId]',
        'page',
      );
    });

    it('refuses a file over 10 MB with the module reason, keeping the files before it', async () => {
      const { tickets, ticket } = setup();

      const result = await addTicketAttachments(
        formOf(
          ticket.number,
          new File(['ok'], 'small.txt'),
          new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.bin'),
          new File(['later'], 'later.txt'),
        ),
      );

      expect(result).toMatchObject({
        ok: false,
        error:
          '"big.bin" was not added: Keep the file to 10 MB or smaller. 1 earlier file was added.',
      });
      expect(
        tickets.getTicket(ticket.number).attachments.map(({ name }) => name),
      ).toEqual(['small.txt']);
      expect(revalidatePath).toHaveBeenCalled();
    });

    it('adds a file whose browser-given type carries a charset', async () => {
      const { tickets, ticket } = setup();

      const result = await addTicketAttachments(
        formOf(
          ticket.number,
          new File(['a'], 'a.txt', { type: 'text/plain;charset=utf-8' }),
        ),
      );

      expect(result).toEqual({ ok: true });
      expect(tickets.getTicket(ticket.number).attachments[0].mediaType).toBe(
        'text/plain',
      );
    });

    it('names the refused file but not the count when none were added before it', async () => {
      const { ticket } = setup();

      const result = await addTicketAttachments(
        formOf(ticket.number, new File([], 'empty.txt')),
      );

      expect(result).toEqual({
        ok: false,
        error: '"empty.txt" was not added: The file is empty.',
      });
    });

    it('refuses a form without files', async () => {
      const { ticket } = setup();

      const result = await addTicketAttachments(formOf(ticket.number));

      expect(result).toMatchObject({ ok: false });
    });
  });
});
