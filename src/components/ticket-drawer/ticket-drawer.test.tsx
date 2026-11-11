// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  approveMerge,
  startConversation,
} from '../../app/conversations/actions';
import { startSpar } from '../../app/spars/actions';
import {
  backToTodo,
  clearTicketClaim,
  completeTicket,
  updateTicket,
} from '../../app/tickets/actions';
import type { Conversation } from '../../conversations/conversations';
import { liveConversation } from '../../test/conversation-activity';
import { aFootprint } from '../../test/fixtures';
import type { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import {
  button,
  conversationWithId,
  descriptionInput,
  dialog,
  drawer,
  editDescription,
  field,
  InShell,
  inDocumentOrder,
  inDrawer,
  renderDrawer,
  resetDrawerMocks,
  ticket,
} from '../../test/ticket-drawer';
import type { Ticket } from '../../tickets/tickets';
import { useLiveConversations } from '../conversation-activity/conversation-activity';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../conversation-activity/conversation-activity', async (original) => ({
  ...(await original<
    typeof import('../conversation-activity/conversation-activity')
  >()),
  useLiveConversations: vi.fn(),
}));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));
vi.mock('../../app/conversations/actions', () => ({
  // One Agent kind: no agent picker shows (T1368).
  loadAgentChoices: vi.fn(async () => ({ ok: true, choices: null })),
  approveMerge: vi.fn(),
  answerConversationPermission: vi.fn(),
  replyToConversation: vi.fn(),
  startConversation: vi.fn(),
  stopConversation: vi.fn(),
}));
vi.mock('../../app/spars/actions', () => ({ startSpar: vi.fn() }));
vi.mock('../../app/cycles/actions', () => ({
  planTicket: vi.fn(),
  unplanTicket: vi.fn(),
}));
vi.mock('../../app/tickets/actions', () => ({
  addTicketBlocker: vi.fn(),
  backToTodo: vi.fn(),
  removeTicketBlocker: vi.fn(),
  attachTicketToEpic: vi.fn(),
  detachTicketFromEpic: vi.fn(),
  createTicket: vi.fn(),
  addTicketLabel: vi.fn(),
  removeTicketLabel: vi.fn(),
  addTicketExternalReference: vi.fn(),
  removeTicketExternalReference: vi.fn(),
  clearTicketClaim: vi.fn(),
  completeTicket: vi.fn(),
  deleteTicket: vi.fn(),
  updateTicket: vi.fn(),
  archiveTicket: vi.fn(),
  restoreTicket: vi.fn(),
  addTicketComment: vi.fn(),
  editTicketComment: vi.fn(),
  removeTicketComment: vi.fn(),
  checkTicketAcceptanceCriterion: vi.fn(),
  setTicketAcceptanceCriteria: vi.fn(),
  setTicketOrigin: vi.fn(),
  approveTriage: vi.fn(),
  rejectTriage: vi.fn(),
}));

describe('TicketDrawer', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    router = resetDrawerMocks();
  });

  it("starts a Spar about the Ticket from 'Spar about this' and opens its page", async () => {
    vi.mocked(startSpar).mockResolvedValue({
      ok: true,
      spar: { id: 21 } as never,
    });
    renderDrawer();

    await userEvent.click(button('Spar about this'));
    await userEvent.click(button('Start sparring'));

    expect(startSpar).toHaveBeenCalledWith({
      projectId: 1,
      focusTicketNumber: 4,
      topic: '',
    });
    expect(router.push).toHaveBeenCalledWith('/project/1/spar/21');
  });

  it('shows a pending triage proposal in its own section, and none without one', () => {
    const { unmount } = renderWithTheme(<InShell ticket={ticket} />);
    expect(inDrawer().queryByText('Triage proposal')).toBeNull();
    unmount();

    renderWithTheme(
      <InShell
        ticket={ticket}
        triageProposal={{
          id: 1,
          ticketNumber: ticket.number,
          runId: null,
          category: 'bug',
          state: 'ready-for-agent',
          reasoning: 'Reproduced.',
          acceptanceCriteria: null,
          duplicateOf: null,
          splits: null,
          status: 'pending',
          createdAt: new Date('2026-03-03T09:00:00Z'),
          decidedAt: null,
        }}
      />,
    );

    expect(inDrawer().getByText('Triage proposal')).toBeVisible();
    expect(inDrawer().getByText('Reproduced.')).toBeVisible();
  });

  it('is named after the Ticket and shows its number, with no form-wide Save', () => {
    renderDrawer();

    expect(
      screen.getByRole('dialog', { name: 'Fix the header' }),
    ).toBeInTheDocument();
    expect(button('Copy Ticket number T4')).toHaveTextContent('T4');
    expect(
      inDrawer().getByRole('heading', { level: 2, name: 'Fix the header' }),
    ).toBeInTheDocument();
    expect(
      inDrawer().queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
  });

  it('lists the Ticket’s Conversations compactly above its comments, and opens one in the dialog', async () => {
    renderWithTheme(
      <InShell
        ticket={ticket}
        conversations={[
          conversationWithId(2, { intent: 'ask', cost: 1.234 }),
          conversationWithId(1, { state: 'stopped', hidden: true }),
        ]}
        conversationFootprints={{
          2: aFootprint({ energyWh: 12, co2eG: 5.7 }),
        }}
      />,
    );

    const list = inDrawer().getByRole('list', { name: 'Conversations' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Ask · waiting for you · $1.23',
      'Start · closed · $0.00',
    ]);
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Ask · waiting for you · $1.23·~12 Wh · ~5.7 g CO₂e est.',
      'Start · closed · $0.00·Footprint not measured',
    ]);
    expect(
      inDrawer().queryByRole('textbox', { name: 'Reply' }),
    ).not.toBeInTheDocument();
    expect(
      inDocumentOrder(
        inDrawer().getByRole('heading', { name: 'Conversations' }),
        inDrawer().getByRole('heading', { name: 'Comments and Activity' }),
      ),
    ).toBe(true);

    await userEvent.click(rows[1]);

    expect(dialog.reopenAndOpen).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, hidden: true }),
    );
  });

  it('opens the dialog on the new Conversation when Start, Triage or Ask begins one', async () => {
    vi.mocked(startConversation).mockResolvedValue({
      ok: true,
      conversation: conversationWithId(12),
    });
    renderDrawer(ticket);

    await userEvent.click(button('Start'));

    await waitFor(() => expect(dialog.open).toHaveBeenCalledWith(12));
  });

  it('opens an Ask draft for the Ticket, with no inline field', async () => {
    renderDrawer(ticket);

    await userEvent.click(button('Ask'));

    expect(dialog.openDraft).toHaveBeenCalledExactlyOnceWith({
      intent: 'ask',
      ticketNumber: ticket.number,
    });
    expect(screen.queryByLabelText('Question')).toBeNull();
  });

  it('offers Start, Triage and Ask on the Ticket', () => {
    renderDrawer(ticket);

    expect(button('Start')).toBeInTheDocument();
    expect(button('Triage')).toBeInTheDocument();
    expect(button('Ask')).toBeInTheDocument();
  });

  it('offers Spec on a Todo Ticket in Intake and an Epic without children only (T1222)', () => {
    const { unmount } = renderDrawer({ ...ticket, status: 'Todo', labels: [] });
    expect(button('Spec')).toBeInTheDocument();
    unmount();

    const queued = renderDrawer({
      ...ticket,
      status: 'Todo',
      labels: ['ready-for-agent'],
    });
    expect(screen.queryByRole('button', { name: 'Spec' })).toBeNull();
    queued.unmount();

    renderDrawer({
      ...ticket,
      status: 'Todo',
      type: 'Epic',
      children: [],
      labels: [],
    });
    expect(button('Spec')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask' })).not.toBeNull();
    expect(button('Spec')).toBeInTheDocument();
  });

  it('links a Claim made with a Conversation’s id to that Conversation in the dialog', async () => {
    renderWithTheme(
      <InShell
        ticket={{
          ...ticket,
          claim: { agentRunId: '7', agentName: 'Claude' },
        }}
        conversations={[
          conversationWithId(8),
          conversationWithId(7, { state: 'stopped', hidden: true }),
        ]}
      />,
    );

    await userEvent.click(button('Conversation 7'));

    expect(dialog.reopenAndOpen).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
    );
  });

  it('does not link a Claim whose run is no Conversation of the Ticket', () => {
    renderDrawer({
      ...ticket,
      claim: { agentRunId: 'run-1', agentName: 'Frontend Agent' },
    });

    expect(
      inDrawer().queryByRole('button', { name: /^Conversation / }),
    ).toBeNull();
  });

  it('shows the number and Close, title, details, description, then the footer', () => {
    renderDrawer({ ...ticket, archived: true });

    expect(
      inDocumentOrder(
        button('Copy Ticket number T4'),
        button('Close'),
        inDrawer().getByText('This Ticket is archived'),
        inDrawer().getByRole('heading', { level: 2 }),
        inDrawer().getByText('Status'),
        inDrawer().getByText('Labels'),
        inDrawer().getByRole('heading', { name: 'Description' }),
        inDrawer().getByRole('heading', { name: 'Acceptance criteria' }),
        inDrawer().getByText(/^Created/),
      ),
    ).toBe(true);
  });

  it('shows the Cycle the Ticket is planned into', () => {
    renderWithTheme(
      <InShell
        ticket={ticket}
        cycles={[
          {
            id: 7,
            projectId: 1,
            title: 'Beta',
            state: 'Prepared',
            ticketNumbers: [4],
            createdAt: new Date('2026-01-01'),
            archivedAt: null,
          },
        ]}
      />,
    );

    expect(inDrawer().getByRole('link', { name: 'Beta' })).toHaveAttribute(
      'href',
      '/project/1/cycle/7',
    );
    expect(button('Remove from Cycle')).toBeInTheDocument();
  });

  it('closes to the tab it was opened over', async () => {
    renderWithTheme(<InShell ticket={ticket} boardPath="/project/1/cycle/7" />);

    await userEvent.click(button('Close'));

    expect(router.replace).toHaveBeenCalledExactlyOnceWith(
      '/project/1/cycle/7',
      { scroll: false },
    );
  });

  it("shows the Ticket's Status, with no way to move it to another Project", () => {
    renderDrawer();

    expect(field('Status')).toHaveValue('In progress');
    expect(inDrawer().queryByLabelText('Project')).not.toBeInTheDocument();
  });

  it('shows who claimed the Ticket and lets the User clear the claim', async () => {
    vi.mocked(clearTicketClaim).mockResolvedValue({ ok: true });
    renderDrawer({
      ...ticket,
      claim: { agentRunId: 'run-1', agentName: 'Frontend Agent' },
    });

    expect(inDrawer().getByText('Frontend Agent (run-1)')).toBeInTheDocument();
    await userEvent.click(button('Clear claim'));

    expect(clearTicketClaim).toHaveBeenCalledExactlyOnceWith({ number: 4 });
  });

  it('shows the reason when clearing a claim is refused', async () => {
    vi.mocked(clearTicketClaim).mockResolvedValue({
      ok: false,
      error: 'The claim could not be cleared.',
    });
    renderDrawer({
      ...ticket,
      claim: { agentRunId: 'run-1', agentName: 'Frontend Agent' },
    });

    await userEvent.click(button('Clear claim'));

    expect(
      await inDrawer().findByText('The claim could not be cleared.'),
    ).toBeInTheDocument();
  });

  describe('Merged', () => {
    const pullRequest = 'https://github.com/owner/repo/pull/87';
    const inReview: Ticket = { ...ticket, externalReferences: [pullRequest] };
    const merged = () => inDrawer().queryByRole('button', { name: /^Merged/ });

    it('completes a Ticket in Review and shows a pending state meanwhile', async () => {
      const { promise, resolve } = Promise.withResolvers<{
        ok: true;
        projectId: number;
      }>();
      vi.mocked(completeTicket).mockReturnValue(promise);
      onTestFinished(() => resolve({ ok: true, projectId: 1 }));
      renderDrawer(inReview);

      await userEvent.click(button('Merged T4 Fix the header'));

      expect(completeTicket).toHaveBeenCalledExactlyOnceWith({ number: 4 });
      expect(button('Merged T4 Fix the header')).toBeDisabled();
      await act(async () => resolve({ ok: true, projectId: 1 }));
      expect(button('Merged T4 Fix the header')).toBeEnabled();
    });

    it('shows Merged on an Epic in Review, beside its Status text', async () => {
      vi.mocked(completeTicket).mockResolvedValue({ ok: true, projectId: 1 });
      renderDrawer({ ...inReview, type: 'Epic', title: 'Login' });

      await userEvent.click(button('Merged T4 Login'));

      expect(completeTicket).toHaveBeenCalledExactlyOnceWith({ number: 4 });
    });

    it('asks to confirm unchecked criteria, then completes with confirmed', async () => {
      vi.mocked(completeTicket)
        .mockResolvedValueOnce({
          ok: true,
          projectId: 1,
          unchecked: [{ number: 4, text: 'Menu opens' }],
        })
        .mockResolvedValueOnce({ ok: true, projectId: 1 });
      renderDrawer(inReview);

      await userEvent.click(button('Merged T4 Fix the header'));
      const dialog = await screen.findByRole('dialog', {
        name: 'Merge T4 with unchecked criteria?',
      });
      expect(within(dialog).getByText('T4: Menu opens')).toBeInTheDocument();
      const anyway = within(dialog).getByRole('button', {
        name: 'Merged anyway',
      });
      // The dialog can open while the first click is still pending, with
      // the button disabled: a click then does nothing.
      await waitFor(() => {
        expect(anyway).toBeEnabled();
      });
      await userEvent.click(anyway);

      await waitFor(() =>
        expect(completeTicket).toHaveBeenLastCalledWith({
          number: 4,
          confirmed: true,
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', {
            name: 'Merge T4 with unchecked criteria?',
          }),
        ).toBeNull(),
      );
    });

    it('shows nothing while a Conversation is live', () => {
      vi.mocked(useLiveConversations).mockReturnValue({
        4: liveConversation({ state: 'running' }),
      });
      renderDrawer(inReview);

      expect(merged()).toBeNull();
    });

    it.each([
      ['not In progress', { ...inReview, status: 'Done' as const }],
      ['without a PR reference', ticket],
    ])('shows nothing for a Ticket %s', (_name, shown) => {
      renderDrawer(shown);

      expect(merged()).toBeNull();
    });

    it('shows the reason when refused', async () => {
      vi.mocked(completeTicket).mockResolvedValue({
        ok: false,
        error: 'The Project is archived.',
      });
      renderDrawer(inReview);

      await userEvent.click(button('Merged T4 Fix the header'));

      expect(
        await inDrawer().findByText('The Project is archived.'),
      ).toBeInTheDocument();
    });

    it('leaves the Status select as it is', () => {
      renderDrawer(inReview);

      expect(field('Status')).toHaveValue('In progress');
    });
  });

  describe('Done (T1268)', () => {
    const forHuman: Ticket = {
      ...ticket,
      labels: ['enhancement', 'ready-for-human'],
    };
    const done = () => inDrawer().queryByRole('button', { name: /^Done T/ });

    it.each([
      ['Todo', forHuman],
      ['In progress', { ...forHuman, status: 'In progress' as const }],
    ])('finishes a ready-for-human Ticket in %s', async (_name, shown) => {
      vi.mocked(completeTicket).mockResolvedValue({ ok: true, projectId: 1 });
      renderDrawer(shown);

      await userEvent.click(button('Done T4 Fix the header'));

      expect(completeTicket).toHaveBeenCalledExactlyOnceWith({ number: 4 });
    });

    it('finishes a ready-for-human Epic', async () => {
      vi.mocked(completeTicket).mockResolvedValue({ ok: true, projectId: 1 });
      renderDrawer({ ...forHuman, type: 'Epic', title: 'Login' });

      await userEvent.click(button('Done T4 Login'));

      expect(completeTicket).toHaveBeenCalledExactlyOnceWith({ number: 4 });
    });

    it('shows beside an idle Conversation, not while one runs', () => {
      vi.mocked(useLiveConversations).mockReturnValue({
        4: liveConversation({ state: 'idle' }),
      });
      const { unmount } = renderDrawer(forHuman);
      expect(button('Done T4 Fix the header')).toBeInTheDocument();
      unmount();

      vi.mocked(useLiveConversations).mockReturnValue({
        4: liveConversation({ state: 'running' }),
      });
      renderDrawer(forHuman);
      expect(done()).toBeNull();
    });

    it('asks to confirm unchecked criteria, then finishes with confirmed', async () => {
      vi.mocked(completeTicket)
        .mockResolvedValueOnce({
          ok: true,
          projectId: 1,
          unchecked: [{ number: 4, text: 'Menu opens' }],
        })
        .mockResolvedValueOnce({ ok: true, projectId: 1 });
      renderDrawer(forHuman);

      await userEvent.click(button('Done T4 Fix the header'));
      const dialog = await screen.findByRole('dialog', {
        name: 'Finish T4 with unchecked criteria?',
      });
      const anyway = within(dialog).getByRole('button', {
        name: 'Done anyway',
      });
      // The dialog can open while the first click is still pending, with
      // the button disabled: a click then does nothing.
      await waitFor(() => {
        expect(anyway).toBeEnabled();
      });
      await userEvent.click(anyway);

      await waitFor(() =>
        expect(completeTicket).toHaveBeenLastCalledWith({
          number: 4,
          confirmed: true,
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', {
            name: 'Finish T4 with unchecked criteria?',
          }),
        ).toBeNull(),
      );
    });

    it.each([
      ['without ready-for-human', { ...ticket, labels: ['ready-for-agent'] }],
      ['that is Done', { ...forHuman, status: 'Done' as const }],
    ])('shows nothing for a Ticket %s', (_name, shown) => {
      renderDrawer(shown);

      expect(done()).toBeNull();
    });

    it('shows Merged, not Done, for a ready-for-human Ticket in Review', () => {
      renderDrawer({
        ...forHuman,
        status: 'In progress',
        externalReferences: ['https://github.com/owner/repo/pull/87'],
      });

      expect(button('Merged T4 Fix the header')).toBeInTheDocument();
      expect(done()).toBeNull();
    });

    it('shows the reason when refused', async () => {
      vi.mocked(completeTicket).mockResolvedValue({
        ok: false,
        error: 'The Project is archived.',
      });
      renderDrawer(forHuman);

      await userEvent.click(button('Done T4 Fix the header'));

      expect(
        await inDrawer().findByText('The Project is archived.'),
      ).toBeInTheDocument();
    });
  });

  describe('Approve merge', () => {
    const pullRequest = 'https://github.com/owner/repo/pull/87';
    const inReview: Ticket = { ...ticket, externalReferences: [pullRequest] };
    const approve = () =>
      inDrawer().queryByRole('button', { name: /^Approve merge/ });

    it('approves a Ticket in Review beside Merged and opens the Conversation', async () => {
      vi.mocked(approveMerge).mockResolvedValue({
        ok: true,
        conversation: { id: 31 } as Conversation,
      });
      renderDrawer(inReview);

      expect(button('Merged T4 Fix the header')).toBeInTheDocument();
      await userEvent.click(button('Approve merge T4 Fix the header'));

      expect(approveMerge).toHaveBeenCalledExactlyOnceWith({ number: 4 });
      await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledWith(31));
    });

    it('shows on an Epic in Review and for an idle Start Conversation', () => {
      vi.mocked(useLiveConversations).mockReturnValue({
        4: liveConversation({ state: 'idle' }),
      });
      renderDrawer({ ...inReview, type: 'Epic', title: 'Login' });

      expect(button('Approve merge T4 Login')).toBeInTheDocument();
    });

    it('shows the reason when refused', async () => {
      vi.mocked(approveMerge).mockResolvedValue({
        ok: false,
        error: 'A Conversation is working on T4.',
      });
      renderDrawer(inReview);

      await userEvent.click(button('Approve merge T4 Fix the header'));

      expect(
        await inDrawer().findByText('A Conversation is working on T4.'),
      ).toBeInTheDocument();
    });

    it('shows the cap refusal naming the Conversations holding the slots (T1331)', async () => {
      const refusal =
        'The machine runs its cap of 2 runs, held by T3 (waiting on you) and T7. Wait for one to finish, answer or close one, or raise the cap in Settings.';
      vi.mocked(approveMerge).mockResolvedValue({ ok: false, error: refusal });
      renderDrawer(inReview);

      await userEvent.click(button('Approve merge T4 Fix the header'));

      expect(await inDrawer().findByText(refusal)).toBeInTheDocument();
    });

    it('shows nothing while a Conversation is running', () => {
      vi.mocked(useLiveConversations).mockReturnValue({
        4: liveConversation({ state: 'running' }),
      });
      renderDrawer(inReview);

      expect(approve()).toBeNull();
    });

    it.each([
      ['Done', { ...inReview, status: 'Done' as const }],
      ['without a PR reference', ticket],
      ['Todo', { ...inReview, status: 'Todo' as const }],
    ])('shows nothing for a Ticket %s', (_name, shown) => {
      renderDrawer(shown);

      expect(approve()).toBeNull();
    });
  });

  describe('Back to Todo', () => {
    const pullRequest = 'https://github.com/owner/repo/pull/87';
    const parkedTickets: [string, Ticket][] = [
      ['Action needed', ticket],
      [
        'Running',
        { ...ticket, claim: { agentRunId: 'run-1', agentName: 'A' } },
      ],
      ['Review', { ...ticket, externalReferences: [pullRequest] }],
    ];
    const backToTodoButton = () =>
      inDrawer().queryByRole('button', { name: 'Back to Todo' });

    it.each(parkedTickets)(
      'sends a parked Ticket in %s Back to Todo, pending meanwhile',
      async (_section, shown) => {
        const { promise, resolve } = Promise.withResolvers<{
          ok: true;
          projectId: number;
        }>();
        vi.mocked(backToTodo).mockReturnValue(promise);
        onTestFinished(() => resolve({ ok: true, projectId: 1 }));
        renderDrawer(shown);

        await userEvent.click(button('Back to Todo'));

        expect(backToTodo).toHaveBeenCalledExactlyOnceWith({ number: 4 });
        expect(button('Back to Todo')).toBeDisabled();
        await act(async () => resolve({ ok: true, projectId: 1 }));
        expect(button('Back to Todo')).toBeEnabled();
      },
    );

    it('shows both Merged and Back to Todo in Review', () => {
      renderDrawer({ ...ticket, externalReferences: [pullRequest] });

      expect(button('Merged T4 Fix the header')).toBeInTheDocument();
      expect(button('Back to Todo')).toBeInTheDocument();
    });

    it.each(['running', 'idle'] as const)(
      'does not show while a %s Conversation is live',
      (state) => {
        vi.mocked(useLiveConversations).mockReturnValue({
          4: liveConversation({ state }),
        });
        renderDrawer(ticket);

        expect(backToTodoButton()).toBeNull();
      },
    );

    it('does not show for a Ticket that is not In progress', () => {
      renderDrawer({ ...ticket, status: 'Todo' });

      expect(backToTodoButton()).toBeNull();
    });

    it('sends a parked Epic Back to Todo, in Review too', async () => {
      vi.mocked(backToTodo).mockResolvedValue({ ok: true, projectId: 1 });
      renderDrawer({
        ...ticket,
        type: 'Epic',
        title: 'Login',
        externalReferences: [pullRequest],
      });

      expect(button('Merged T4 Login')).toBeInTheDocument();
      await userEvent.click(button('Back to Todo'));

      expect(backToTodo).toHaveBeenCalledExactlyOnceWith({ number: 4 });
    });

    it('does not show on an Epic while a Conversation is live', () => {
      vi.mocked(useLiveConversations).mockReturnValue({
        4: liveConversation({ state: 'running' }),
      });
      renderDrawer({ ...ticket, type: 'Epic', title: 'Login' });

      expect(backToTodoButton()).toBeNull();
    });

    it('shows the reason when an Epic is refused', async () => {
      vi.mocked(backToTodo).mockResolvedValue({
        ok: false,
        error: 'The Project is archived.',
      });
      renderDrawer({ ...ticket, type: 'Epic', title: 'Login' });

      await userEvent.click(button('Back to Todo'));

      expect(
        await inDrawer().findByText('The Project is archived.'),
      ).toBeInTheDocument();
    });

    it('shows the reason when refused', async () => {
      vi.mocked(backToTodo).mockResolvedValue({
        ok: false,
        error: 'The Project is archived.',
      });
      renderDrawer(ticket);

      await userEvent.click(button('Back to Todo'));

      expect(
        await inDrawer().findByText('The Project is archived.'),
      ).toBeInTheDocument();
    });
  });

  it('renders without React warnings', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    onTestFinished(() => consoleError.mockRestore());

    renderDrawer();

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("shows the Ticket's comments with a way to add one", () => {
    renderWithTheme(
      <InShell
        ticket={ticket}
        comments={[
          {
            id: 1,
            ticketNumber: 4,
            author: 'agent',
            body: 'Started on it.',
            createdAt: new Date('2026-03-03T09:00:00Z'),
            editedAt: null,
          },
        ]}
      />,
    );

    expect(
      within(
        inDrawer().getByRole('list', { name: 'Comments and Activity' }),
      ).getByText('Started on it.'),
    ).toBeInTheDocument();
    expect(
      inDrawer().getByRole('textbox', { name: 'Add a comment' }),
    ).toBeInTheDocument();
  });

  it('shows its Attachments below the description', () => {
    renderDrawer({
      ...ticket,
      attachments: [
        {
          id: 3,
          ticketNumber: 4,
          name: 'shot.png',
          mediaType: 'image/png',
          size: 10,
          author: 'agent',
          createdAt: new Date('2026-03-01T09:00:00Z'),
        },
      ],
    });

    const heading = inDrawer().getByRole('heading', { name: 'Attachments' });
    const description = inDrawer().getByRole('heading', {
      name: 'Description',
    });
    expect(
      description.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      inDrawer().getByRole('img', { name: 'shot.png' }),
    ).toBeInTheDocument();
  });

  it('shows when the Ticket was created and last updated on one line', () => {
    renderDrawer();

    const line = inDrawer().getByText(
      (_, element) =>
        element?.tagName === 'P' &&
        /^Created .+ · Updated .+$/.test(element.textContent ?? ''),
    );
    const times = within(line).getAllByRole('time');
    expect(times.map((time) => time.getAttribute('datetime'))).toEqual([
      '2026-03-01T09:00:00.000Z',
      '2026-03-02T10:30:00.000Z',
    ]);
  });

  // Next.js keeps a route the User left in a hidden <Activity>, and shows it
  // again when they come back. Reopening moves focus into the drawer, so a
  // field left mid-edit saves, as leaving it does.
  it('closes its dialog while its route is hidden and saves a draft on reopening', async () => {
    const at = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <InShell ticket={ticket} />
      </Activity>
    );
    const { rerender } = renderWithTheme(at('visible'));
    await editDescription();
    await userEvent.type(descriptionInput(), '!');

    rerender(at('hidden'));
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');

    rerender(at('visible'));
    expect(drawer()).toHaveAttribute('open');
    expect(updateTicket).toHaveBeenCalledWith({
      number: 4,
      description: `${ticket.description}!`,
    });
  });
});
