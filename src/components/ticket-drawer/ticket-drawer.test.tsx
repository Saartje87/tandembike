import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { Activity, type FC } from 'react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  addTicketBlocker,
  addTicketLabel,
  archiveTicket,
  checkTicketAcceptanceCriterion,
  clearTicketClaim,
  deleteTicket,
  restoreTicket,
  type UpdateTicketResult,
  updateTicket,
} from '../../app/tickets/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { EpicLink, Ticket } from '../../tickets/tickets';
import { TicketDrawerShell } from '../ticket-drawer-shell/ticket-drawer-shell';
import { TicketDrawer, type TicketDrawerProps } from './ticket-drawer';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/conversations/actions', () => ({
  answerConversationPermission: vi.fn(),
  replyToConversation: vi.fn(),
  startConversation: vi.fn(),
  stopConversation: vi.fn(),
}));
vi.mock('../../app/cycles/actions', () => ({
  planTicket: vi.fn(),
  unplanTicket: vi.fn(),
}));
vi.mock('../../app/tickets/actions', () => ({
  addTicketBlocker: vi.fn(),
  removeTicketBlocker: vi.fn(),
  attachTicketToEpic: vi.fn(),
  detachTicketFromEpic: vi.fn(),
  createTicket: vi.fn(),
  addTicketLabel: vi.fn(),
  removeTicketLabel: vi.fn(),
  addTicketExternalReference: vi.fn(),
  removeTicketExternalReference: vi.fn(),
  clearTicketClaim: vi.fn(),
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
}));

const ticket: Ticket = {
  number: 4,
  title: 'Fix the header',
  description: 'It overlaps the **logo**.',
  status: 'In progress',
  projectId: 1,
  position: 0,
  archived: false,
  labels: [],
  externalReferences: [],
  attachments: [],
  blockedBy: [],
  blocked: false,
  type: 'Ticket',
  color: null,
  epic: null,
  children: [],
  origin: null,
  splitOff: [],
  cycle: null,
  claim: null,
  acceptanceCriteria: [],
  createdAt: new Date('2026-03-01T09:00:00Z'),
  updatedAt: new Date('2026-03-02T10:30:00Z'),
};

type InShellProps = TicketDrawerProps & { boardPath?: string };

/** The drawer's contents in the shell a Board opens them in. */
const InShell: FC<InShellProps> = ({ boardPath = '/project/1', ...props }) => (
  <TicketDrawerShell number={props.ticket.number} boardPath={boardPath}>
    <TicketDrawer {...props} />
  </TicketDrawerShell>
);

const renderDrawer = (shown: Ticket = ticket) =>
  renderWithTheme(<InShell ticket={shown} />);

const drawer = () => screen.getByRole('dialog');
const inDrawer = () => within(drawer());
const button = (name: string) => inDrawer().getByRole('button', { name });
const field = (name: string) => inDrawer().getByLabelText(name);
const titleButton = () => button('Fix the header');
const titleInput = () => inDrawer().getByRole('textbox', { name: 'Title' });
const descriptionInput = () =>
  inDrawer().getByRole('textbox', { name: 'Description' });
/** Opens the description by clicking its text, which starts with "It overlaps". */
const editDescription = () =>
  userEvent.click(inDrawer().getByText(/^It overlaps/));
/** Saves the field being edited by clicking elsewhere in the drawer. */
const leaveField = () =>
  userEvent.click(
    inDrawer().getByRole('heading', { level: 3, name: 'Description' }),
  );

/**
 * An `updateTicket` result the test settles itself, to look at the drawer
 * while the save is pending. Settled after the test either way: React holds
 * pending async transitions together, so one left pending would hold up
 * later tests.
 */
const pendingUpdate = () => {
  const { promise, resolve } = Promise.withResolvers<UpdateTicketResult>();
  vi.mocked(updateTicket).mockReturnValue(promise);
  const settle = (result: UpdateTicketResult) =>
    act(async () => resolve(result));
  onTestFinished(() => settle({ ok: true, projectId: ticket.projectId }));
  return settle;
};

/**
 * A spy on keydowns that reach the document, called with whether each was
 * claimed (`defaultPrevented`), which keeps the Drawer from closing on an
 * Escape. Call it once the edit is open.
 */
const keysReachingDocument = () => {
  const claimed = vi.fn();
  const onKeyDown = (event: KeyboardEvent) => claimed(event.defaultPrevented);
  document.addEventListener('keydown', onKeyDown);
  onTestFinished(() => document.removeEventListener('keydown', onKeyDown));
  return claimed;
};

/** Whether the elements appear in this order in the document. */
const inDocumentOrder = (...elements: Element[]) =>
  elements.every(
    (element, index) =>
      index === 0 ||
      Boolean(
        elements[index - 1].compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  );

describe('TicketDrawer', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    vi.mocked(updateTicket).mockReset();
    vi.mocked(archiveTicket).mockReset();
    vi.mocked(restoreTicket).mockReset();
    vi.mocked(addTicketLabel).mockReset();
    vi.mocked(clearTicketClaim).mockReset();
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

  it('shows the Ticket’s Conversations above its comments', () => {
    const at = new Date('2026-03-03T09:00:00Z');
    renderWithTheme(
      <InShell
        ticket={ticket}
        conversations={[
          {
            conversation: {
              id: 1,
              projectId: 1,
              ticketNumber: 4,
              intent: 'start',
              state: 'idle',
              sdkSessionId: null,
              costUsd: 0,
              hidden: false,
              defaultCycleId: null,
              defaultEpicNumber: null,
              defaultType: null,
              createdAt: at,
              updatedAt: at,
            },
            transcript: [],
          },
        ]}
      />,
    );

    expect(
      inDrawer().getByRole('textbox', { name: 'Reply' }),
    ).toBeInTheDocument();
    expect(
      inDocumentOrder(
        inDrawer().getByRole('heading', { name: 'Conversations' }),
        inDrawer().getByRole('heading', { name: 'Comments and Activity' }),
      ),
    ).toBe(true);
  });

  it('offers Start, Triage and Ask on the Ticket', () => {
    renderDrawer(ticket);

    expect(button('Start')).toBeInTheDocument();
    expect(button('Triage')).toBeInTheDocument();
    expect(button('Ask')).toBeInTheDocument();
  });

  it('links a Claim made with a Conversation’s id to that Conversation', async () => {
    const at = new Date('2026-03-03T09:00:00Z');
    const conversation = (id: number, state: 'idle' | 'stopped') => ({
      conversation: {
        id,
        projectId: 1,
        ticketNumber: 4,
        intent: 'start' as const,
        state,
        sdkSessionId: null,
        costUsd: 0,
        hidden: false,
        defaultCycleId: null,
        defaultEpicNumber: null,
        defaultType: null,
        createdAt: at,
        updatedAt: at,
      },
      transcript: [],
    });
    renderWithTheme(
      <InShell
        ticket={{
          ...ticket,
          claim: { agentRunId: '7', agentName: 'Claude' },
        }}
        conversations={[conversation(8, 'idle'), conversation(7, 'stopped')]}
      />,
    );
    expect(inDrawer().queryByText(/This Conversation was stopped/)).toBeNull();

    await userEvent.click(button('Conversation 7'));

    expect(
      inDrawer().getByText(/This Conversation was stopped/),
    ).toBeInTheDocument();
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
        field('Status'),
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

  describe('Status', () => {
    it('saves a new Status on its own and shows it at once', async () => {
      pendingUpdate();
      renderDrawer();

      await userEvent.selectOptions(field('Status'), 'Done');

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        status: 'Done',
      });
      expect(field('Status')).toHaveValue('Done');
    });

    it('goes back to the old Status and says why when it is refused', async () => {
      vi.mocked(updateTicket).mockResolvedValue({
        ok: false,
        error: 'There is no Ticket T4.',
      });
      renderDrawer();

      await userEvent.selectOptions(field('Status'), 'Done');

      await waitFor(() => expect(field('Status')).toHaveValue('In progress'));
      expect(field('Status')).toHaveAccessibleDescription(
        'There is no Ticket T4.',
      );
    });
  });

  describe('title', () => {
    it('turns into an input when clicked and saves on Enter', async () => {
      pendingUpdate();
      renderDrawer();

      await userEvent.click(titleButton());
      expect(titleInput()).toHaveValue('Fix the header');
      expect(titleInput()).toHaveFocus();
      await userEvent.clear(titleInput());
      await userEvent.type(titleInput(), 'Fix the footer{Enter}');

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        title: 'Fix the footer',
      });
      expect(
        inDrawer().getByRole('heading', { level: 2, name: 'Fix the footer' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('dialog', { name: 'Fix the footer' }),
      ).toBeInTheDocument();
    });

    it('says it can be edited', () => {
      renderDrawer();

      expect(titleButton()).toHaveAccessibleDescription('Edit title');
    });

    it('turns into an input on Enter', async () => {
      renderDrawer();

      titleButton().focus();
      await userEvent.keyboard('{Enter}');

      expect(titleInput()).toHaveValue('Fix the header');
    });

    it('saves when focus leaves the input, and cancels with Cancel without closing the drawer', async () => {
      pendingUpdate();
      renderDrawer();

      await userEvent.click(titleButton());
      await userEvent.type(titleInput(), '!');
      await userEvent.click(button('Cancel'));
      expect(titleButton()).toHaveFocus();
      expect(updateTicket).not.toHaveBeenCalled();
      await userEvent.click(titleButton());
      await userEvent.type(titleInput(), '?');
      await leaveField();

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        title: 'Fix the header?',
      });
      expect(
        screen.getByRole('dialog', { name: 'Fix the header?' }),
      ).toBeInTheDocument();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('saves nothing when the title is unchanged', async () => {
      renderDrawer();

      await userEvent.click(titleButton());
      await userEvent.keyboard('{Enter}');

      expect(updateTicket).not.toHaveBeenCalled();
      expect(titleButton()).toHaveFocus();
    });

    it('cancels on Escape without closing the drawer', async () => {
      renderDrawer();

      await userEvent.click(titleButton());
      await userEvent.type(titleInput(), '!');
      const keys = keysReachingDocument();
      await userEvent.keyboard('{Escape}');

      expect(keys.mock.calls).toEqual([[true]]);
      expect(updateTicket).not.toHaveBeenCalled();
      expect(titleButton()).toHaveFocus();
      expect(router.replace).not.toHaveBeenCalled();
      expect(router.back).not.toHaveBeenCalled();
    });

    it("keeps the input open with the User's text and says why a title was refused", async () => {
      vi.mocked(updateTicket).mockResolvedValue({
        ok: false,
        error: 'Enter a title.',
        fieldErrors: { title: 'Enter a title.' },
      });
      renderDrawer();

      await userEvent.click(titleButton());
      await userEvent.clear(titleInput());
      await userEvent.keyboard('{Enter}');

      expect(
        await inDrawer().findByRole('textbox', { name: 'Title' }),
      ).toHaveValue('');
      expect(titleInput()).toHaveAccessibleDescription('Enter a title.');
      // With no title heading while it is edited, the number names it.
      expect(
        screen.getByRole('dialog', { name: 'Ticket T4' }),
      ).toBeInTheDocument();
    });

    it('saves again after a refused title is corrected', async () => {
      vi.mocked(updateTicket).mockResolvedValueOnce({
        ok: false,
        error: 'Enter a title.',
        fieldErrors: { title: 'Enter a title.' },
      });
      vi.mocked(updateTicket).mockResolvedValueOnce({ ok: true, projectId: 1 });
      renderDrawer();

      await userEvent.click(titleButton());
      await userEvent.clear(titleInput());
      await userEvent.keyboard('{Enter}');
      await waitFor(() =>
        expect(titleInput()).toHaveAccessibleDescription('Enter a title.'),
      );
      await userEvent.type(titleInput(), 'Fix the footer{Enter}');

      expect(updateTicket).toHaveBeenLastCalledWith({
        number: 4,
        title: 'Fix the footer',
      });
      expect(updateTicket).toHaveBeenCalledTimes(2);
    });

    it('drops a refused reason when the edit is cancelled', async () => {
      vi.mocked(updateTicket).mockResolvedValue({
        ok: false,
        error: 'Enter a title.',
        fieldErrors: { title: 'Enter a title.' },
      });
      renderDrawer();

      await userEvent.click(titleButton());
      await userEvent.clear(titleInput());
      await userEvent.keyboard('{Enter}');
      await inDrawer().findByRole('textbox', { name: 'Title' });
      await waitFor(() =>
        expect(titleInput()).toHaveAccessibleDescription('Enter a title.'),
      );
      await userEvent.keyboard('{Escape}');
      await userEvent.click(titleButton());

      expect(titleInput()).toHaveValue('Fix the header');
      expect(titleInput()).not.toHaveAccessibleDescription();
      expect(inDrawer().queryByText('Enter a title.')).not.toBeInTheDocument();
    });

    it('follows a title changed elsewhere unless it is being edited', async () => {
      const { rerender } = renderDrawer();

      rerender(<InShell ticket={{ ...ticket, title: 'Fix the logo' }} />);
      await userEvent.click(button('Fix the logo'));
      await userEvent.type(titleInput(), '!');
      rerender(<InShell ticket={{ ...ticket, title: 'Fix the menu' }} />);

      expect(titleInput()).toHaveValue('Fix the logo!');
    });
  });

  describe('description', () => {
    it('shows the description as formatted Markdown', () => {
      renderDrawer();

      expect(inDrawer().getByText('logo').tagName).toBe('STRONG');
    });

    it('has no Edit button, and says how to add a missing description', async () => {
      renderDrawer({ ...ticket, description: '' });

      expect(
        inDrawer().queryByRole('button', { name: /edit/i }),
      ).not.toBeInTheDocument();
      await userEvent.click(inDrawer().getByText('Add a description…'));

      expect(descriptionInput()).toHaveValue('');
    });

    it('opens on Enter when the description has focus', async () => {
      renderDrawer();

      inDrawer()
        .getByText(/^It overlaps/)
        .closest<HTMLElement>('[tabindex="0"]')
        ?.focus();
      await userEvent.keyboard('{Enter}');

      expect(descriptionInput()).toHaveValue('It overlaps the **logo**.');
    });

    it('follows a link in the description instead of opening it', async () => {
      const onDocumentClick = vi.fn((event: MouseEvent) =>
        event.preventDefault(),
      );
      document.addEventListener('click', onDocumentClick);
      onTestFinished(() =>
        document.removeEventListener('click', onDocumentClick),
      );
      renderDrawer({
        ...ticket,
        description: 'See [the docs](https://example.com/docs).',
      });

      await userEvent.click(inDrawer().getByRole('link', { name: 'the docs' }));

      expect(onDocumentClick).toHaveBeenCalledOnce();
      expect(
        inDrawer().queryByRole('textbox', { name: 'Description' }),
      ).not.toBeInTheDocument();
    });

    it('edits the description as plain Markdown and saves it on its own', async () => {
      pendingUpdate();
      renderDrawer();

      await editDescription();
      expect(descriptionInput()).toHaveValue('It overlaps the **logo**.');
      expect(button('Cancel')).toBeInTheDocument();
      await userEvent.type(descriptionInput(), ' Use *flex*.');
      await leaveField();

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        description: 'It overlaps the **logo**. Use *flex*.',
      });
      expect(inDrawer().getByText('flex').tagName).toBe('EM');
    });

    it.each([
      ['Cmd', '{Meta>}{Enter}{/Meta}'],
      ['Ctrl', '{Control>}{Enter}{/Control}'],
    ])('saves on %s+Enter', async (_, keys) => {
      vi.mocked(updateTicket).mockResolvedValue({ ok: true, projectId: 1 });
      renderDrawer();

      await editDescription();
      await userEvent.type(descriptionInput(), '!');
      await userEvent.keyboard(keys);

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        description: 'It overlaps the **logo**.!',
      });
    });

    it('cancels on Escape without closing the drawer', async () => {
      renderDrawer();

      await editDescription();
      await userEvent.type(descriptionInput(), '!');
      const keys = keysReachingDocument();
      await userEvent.keyboard('{Escape}');

      expect(keys.mock.calls).toEqual([[true]]);
      expect(updateTicket).not.toHaveBeenCalled();
      expect(inDrawer().getByText('logo').tagName).toBe('STRONG');
      expect(document.activeElement).toHaveAccessibleDescription(
        'Edit description',
      );
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('cancels from the Cancel button', async () => {
      renderDrawer();

      await editDescription();
      await userEvent.type(descriptionInput(), '!');
      await userEvent.click(button('Cancel'));

      expect(updateTicket).not.toHaveBeenCalled();
      expect(
        inDrawer().queryByRole('textbox', { name: 'Description' }),
      ).not.toBeInTheDocument();
    });

    it("keeps the User's text and says why a description was refused", async () => {
      vi.mocked(updateTicket).mockResolvedValue({
        ok: false,
        error: 'Keep the description to 50,000 characters or fewer.',
        fieldErrors: {
          description: 'Keep the description to 50,000 characters or fewer.',
        },
      });
      renderDrawer();

      await editDescription();
      await userEvent.type(descriptionInput(), '!');
      await leaveField();

      expect(
        await inDrawer().findByRole('textbox', { name: 'Description' }),
      ).toHaveValue('It overlaps the **logo**.!');
      expect(descriptionInput()).toHaveAccessibleDescription(
        'Keep the description to 50,000 characters or fewer.',
      );
    });

    it('drops a refused reason when the edit is cancelled', async () => {
      vi.mocked(updateTicket).mockResolvedValue({
        ok: false,
        error: 'There is no Ticket T4.',
      });
      renderDrawer();

      await editDescription();
      await userEvent.type(descriptionInput(), '!');
      await leaveField();
      await waitFor(() =>
        expect(descriptionInput()).toHaveAccessibleDescription(
          'There is no Ticket T4.',
        ),
      );
      await userEvent.click(button('Cancel'));

      expect(
        inDrawer().queryByText('There is no Ticket T4.'),
      ).not.toBeInTheDocument();
      await editDescription();
      expect(descriptionInput()).toHaveValue('It overlaps the **logo**.');
      expect(descriptionInput()).not.toHaveAccessibleDescription();
    });

    it('saves nothing when the text is as the edit began, though it changed elsewhere', async () => {
      const { rerender } = renderDrawer();

      await editDescription();
      rerender(
        <InShell ticket={{ ...ticket, description: 'Changed by an Agent.' }} />,
      );
      await leaveField();

      expect(updateTicket).not.toHaveBeenCalled();
      expect(inDrawer().getByText('Changed by an Agent.')).toBeInTheDocument();
    });

    it('shows the saved description once it comes back', async () => {
      vi.mocked(updateTicket).mockResolvedValue({ ok: true, projectId: 1 });
      const { rerender } = renderDrawer();

      await editDescription();
      await userEvent.clear(descriptionInput());
      await userEvent.type(descriptionInput(), 'Now *shorter*.');
      await leaveField();
      // Awaited: the save's transition may still be pending, and a render
      // during it can suspend until it ends.
      await act(async () =>
        rerender(
          <InShell ticket={{ ...ticket, description: 'Now *shorter*.' }} />,
        ),
      );

      expect(inDrawer().getByText('shorter').tagName).toBe('EM');
    });

    it('keeps the description being edited when the Ticket changes elsewhere', async () => {
      const { rerender } = renderDrawer();

      await editDescription();
      rerender(
        <InShell
          ticket={{
            ...ticket,
            description: 'Changed by an Agent.',
            status: 'Done',
          }}
        />,
      );

      expect(descriptionInput()).toHaveValue('It overlaps the **logo**.');
      expect(field('Status')).toHaveValue('Done');
    });

    it('saves the description being edited when the drawer closes', async () => {
      pendingUpdate();
      renderDrawer();

      await editDescription();
      await userEvent.type(descriptionInput(), '!');
      await userEvent.click(button('Close'));

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        description: 'It overlaps the **logo**.!',
      });
      expect(router.replace).toHaveBeenCalledExactlyOnceWith('/project/1', {
        scroll: false,
      });
    });
  });

  describe('title and description', () => {
    it('saves the title being edited when the description opens', async () => {
      pendingUpdate();
      renderDrawer();

      await userEvent.click(titleButton());
      await userEvent.type(titleInput(), '!');
      await editDescription();

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        title: 'Fix the header!',
      });
      expect(button('Fix the header!')).toBeInTheDocument();
      expect(descriptionInput()).toHaveValue('It overlaps the **logo**.');
    });
  });

  describe('Blockers', () => {
    it('shows the Tickets it is blocked by and the Tickets it blocks', () => {
      const related = (number: number, title: string) => ({
        number,
        title,
        status: 'Todo' as const,
        projectId: 1,
        archived: false,
        resolved: false,
      });
      renderWithTheme(
        <InShell
          ticket={ticket}
          blockers={{
            blockedBy: [related(2, 'Design the header')],
            blocks: [related(7, 'Ship the header')],
          }}
        />,
      );

      expect(
        within(inDrawer().getByRole('list', { name: 'Blocked by' })).getByRole(
          'link',
        ),
      ).toHaveTextContent('T2 Design the header');
      expect(
        within(inDrawer().getByRole('list', { name: 'Blocks' })).getByRole(
          'link',
        ),
      ).toHaveTextContent('T7 Ship the header');
    });

    it('says plainly in the Blocked by row whether the Ticket is blocked', () => {
      renderWithTheme(
        <InShell
          ticket={{ ...ticket, blockedBy: [2], blocked: true }}
          blockers={{
            blockedBy: [
              {
                number: 2,
                title: 'Design the header',
                status: 'In progress',
                projectId: 1,
                archived: false,
                resolved: false,
              },
            ],
            blocks: [],
          }}
        />,
      );

      expect(
        inDocumentOrder(
          inDrawer().getByText('Blocked by', { selector: 'span' }),
          inDrawer().getByText('Blocked', { exact: true }),
          inDrawer().getByRole('list', { name: 'Blocked by' }),
          inDrawer().getByText('Blocks', { exact: true }),
        ),
      ).toBe(true);
    });

    it('says it is ready to start once every Blocker is resolved', () => {
      renderWithTheme(
        <InShell
          ticket={{ ...ticket, blockedBy: [2], blocked: false }}
          blockers={{
            blockedBy: [
              {
                number: 2,
                title: 'Design the header',
                status: 'Done',
                projectId: 1,
                archived: false,
                resolved: true,
              },
            ],
            blocks: [],
          }}
        />,
      );

      expect(inDrawer().getByText('Ready to start')).toBeInTheDocument();
    });

    it('says nothing about readiness without Blockers', () => {
      renderDrawer();

      expect(
        inDrawer().queryByText(/^(Blocked|Ready to start)$/),
      ).not.toBeInTheDocument();
    });

    it('adds a Blocker without closing the drawer', async () => {
      vi.mocked(addTicketBlocker).mockResolvedValue({ ok: true });
      renderDrawer();

      await userEvent.click(button('Add blocker'));
      await userEvent.type(
        inDrawer().getByRole('textbox', {
          name: 'Ticket number of the Blocker',
        }),
        '2{Enter}',
      );

      expect(addTicketBlocker).toHaveBeenCalledExactlyOnceWith({
        blocker: 2,
        blocked: 4,
      });
      expect(drawer()).toBeInTheDocument();
    });
  });

  it("shows the Ticket's External references after its labels, with a way to add one", () => {
    renderDrawer({
      ...ticket,
      externalReferences: ['https://github.com/acme/web/pull/87', 'ABC-33'],
    });

    const list = inDrawer().getByRole('list', { name: 'External references' });
    expect(
      inDocumentOrder(
        inDrawer().getByText('Labels'),
        inDrawer().getByText('External references'),
        list,
      ),
    ).toBe(true);
    expect(
      within(list).getByRole('link', { name: 'acme/web#87' }),
    ).toHaveAttribute('target', '_blank');
    expect(within(list).getByText('ABC-33')).toBeInTheDocument();
    expect(button('Add External reference')).toBeInTheDocument();
  });

  it("links a key by the Project's Reference templates", () => {
    renderWithTheme(
      <InShell
        ticket={{ ...ticket, externalReferences: ['#55'] }}
        referenceTemplates={[
          { prefix: '#', url: 'https://github.com/acme/web/issues/{n}' },
        ]}
      />,
    );

    expect(inDrawer().getByRole('link', { name: '#55' })).toHaveAttribute(
      'href',
      'https://github.com/acme/web/issues/55',
    );
  });

  describe('labels', () => {
    it("shows the Ticket's labels with a way to remove each", () => {
      renderDrawer({ ...ticket, labels: ['bug'] });

      expect(
        within(inDrawer().getByRole('list', { name: 'Labels' })).getByText(
          'bug',
        ),
      ).toBeInTheDocument();
      expect(button('Remove label bug')).toBeInTheDocument();
    });

    it('adds an existing label from the select without closing the drawer', async () => {
      vi.mocked(addTicketLabel).mockResolvedValue({ ok: true });
      renderWithTheme(<InShell ticket={ticket} allLabels={['bug']} />);

      const select = inDrawer().getByRole('combobox', { name: 'Add a label' });
      await userEvent.selectOptions(select, 'bug');

      expect(addTicketLabel).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        label: 'bug',
      });
      expect(select).toBeInTheDocument();
      expect(drawer()).toBeInTheDocument();
      expect(router.replace).not.toHaveBeenCalled();
    });
  });

  describe('acceptance criteria', () => {
    const criteria = [
      { id: 1, text: 'The logo is centred', checked: false },
      { id: 2, text: 'The header is sticky', checked: true },
    ];

    it('shows the section with a way to add one when there are none', () => {
      renderDrawer();

      expect(
        inDrawer().getByRole('heading', { name: 'Acceptance criteria' }),
      ).toBeInTheDocument();
      expect(
        inDrawer().getByText('No acceptance criteria'),
      ).toBeInTheDocument();
      expect(button('Add criterion')).toBeInTheDocument();
    });

    it("shows the Ticket's criteria, checked or not", () => {
      renderDrawer({ ...ticket, acceptanceCriteria: criteria });

      expect(
        inDrawer().getByRole('checkbox', { name: 'The logo is centred' }),
      ).not.toBeChecked();
      expect(
        inDrawer().getByRole('checkbox', { name: 'The header is sticky' }),
      ).toBeChecked();
    });

    it('checks the last unchecked criterion without changing the Status or closing', async () => {
      vi.mocked(checkTicketAcceptanceCriterion).mockResolvedValue({ ok: true });
      renderDrawer({ ...ticket, acceptanceCriteria: criteria });

      await userEvent.click(
        inDrawer().getByRole('checkbox', { name: 'The logo is centred' }),
      );

      expect(checkTicketAcceptanceCriterion).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        id: 1,
        checked: true,
      });
      expect(updateTicket).not.toHaveBeenCalled();
      expect(field('Status')).toHaveValue('In progress');
      expect(drawer()).toBeInTheDocument();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('sets the Status to Done with criteria still unchecked', async () => {
      vi.mocked(updateTicket).mockResolvedValue({ ok: true, projectId: 1 });
      renderDrawer({ ...ticket, acceptanceCriteria: criteria });

      await userEvent.selectOptions(field('Status'), 'Done');

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        status: 'Done',
      });
    });
  });

  describe('Epics', () => {
    const epic: Ticket = {
      ...ticket,
      number: 8,
      title: 'Checkout',
      type: 'Epic',
      children: [
        {
          number: 9,
          title: 'Pay by card',
          status: 'Todo',
          archived: false,
          blockedBy: [],
          blocked: false,
        },
      ],
    };

    it("lists an Epic's child Tickets, with no Epic of its own", () => {
      renderDrawer(epic);

      expect(
        within(
          inDrawer().getByRole('list', { name: 'Child Tickets' }),
        ).getByRole('link', { name: 'T9 Pay by card' }),
      ).toBeInTheDocument();
      expect(
        inDrawer().queryByRole('button', { name: 'Detach from Epic' }),
      ).not.toBeInTheDocument();
      expect(inDrawer().getByText('Epic')).toBeInTheDocument();
    });

    it("offers an Epic's colour, and no colour for a normal Ticket", () => {
      const { unmount } = renderDrawer({ ...epic, color: 'indigo' });

      expect(
        inDrawer().getByRole('button', { name: 'Epic colour: Indigo' }),
      ).toBeInTheDocument();
      unmount();
      renderDrawer(ticket);

      expect(
        inDrawer().queryByRole('button', { name: /^Epic colour/ }),
      ).not.toBeInTheDocument();
    });

    it("shows an Epic's Status as derived, with no control to set it", () => {
      renderDrawer({ ...epic, status: 'In progress' });

      expect(
        inDrawer().queryByRole('combobox', { name: 'Status' }),
      ).not.toBeInTheDocument();
      expect(
        inDrawer().getByText('In progress · follows its child Tickets'),
      ).toBeInTheDocument();
    });

    it("offers a normal Ticket the Project's Epics to attach it to, but not an Epic", () => {
      const epics: EpicLink[] = [
        { number: 8, title: 'Checkout', color: 'teal' },
      ];
      const { unmount } = renderWithTheme(
        <InShell ticket={ticket} epics={epics} />,
      );

      expect(
        inDrawer().getByRole('combobox', { name: 'Attach to Epic' }),
      ).toBeInTheDocument();
      unmount();

      renderWithTheme(
        <InShell ticket={{ ...epic, number: 10 }} epics={epics} />,
      );

      expect(
        inDrawer().queryByRole('combobox', { name: 'Attach to Epic' }),
      ).not.toBeInTheDocument();
    });

    it('links a child to its Epic and lists no children', () => {
      renderDrawer({
        ...ticket,
        epic: { number: 8, title: 'Checkout', color: 'teal' },
      });

      expect(
        inDrawer().getByRole('link', { name: 'T8 Checkout' }),
      ).toHaveAttribute('href', '/ticket/8');
      expect(
        inDrawer().queryByRole('heading', { name: 'Child Tickets' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Origins', () => {
    it('links a Ticket to its Origin and lists no split-off Tickets', () => {
      renderDrawer({
        ...ticket,
        origin: { number: 2, title: 'Checkout spec', status: 'Done' },
      });

      expect(
        inDrawer().getByRole('link', { name: 'T2 Checkout spec' }),
      ).toHaveAttribute('href', '/ticket/2');
      expect(button('Change Origin')).toBeInTheDocument();
      expect(
        inDrawer().queryByRole('heading', { name: 'Split-off Tickets' }),
      ).not.toBeInTheDocument();
    });

    it("lists an Origin's split-off Tickets with their Status", () => {
      renderDrawer({
        ...ticket,
        splitOff: [
          { number: 9, title: 'Pay by card', status: 'Todo', archived: false },
        ],
      });

      const list = inDrawer().getByRole('list', { name: 'Split-off Tickets' });
      expect(
        within(list).getByRole('link', { name: 'T9 Pay by card' }),
      ).toBeInTheDocument();
      expect(list).toHaveTextContent('Todo');
      expect(button('Set Origin')).toBeInTheDocument();
    });
  });

  describe('archiving', () => {
    it('archives an active Ticket from the footer', async () => {
      vi.mocked(archiveTicket).mockResolvedValue({ ok: true });
      renderDrawer();

      expect(
        inDrawer().queryByText('This Ticket is archived'),
      ).not.toBeInTheDocument();
      await userEvent.click(button('Archive'));

      expect(archiveTicket).toHaveBeenCalledExactlyOnceWith({ number: 4 });
      expect(restoreTicket).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('says an archived Ticket is archived and restores it from the banner', async () => {
      vi.mocked(restoreTicket).mockResolvedValue({ ok: true });
      renderDrawer({ ...ticket, archived: true });

      const banner = inDrawer().getByRole('alert');
      expect(banner).toHaveTextContent('This Ticket is archived');
      expect(
        inDrawer().queryByRole('button', { name: 'Archive' }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        within(banner).getByRole('button', { name: 'Restore' }),
      );

      expect(restoreTicket).toHaveBeenCalledExactlyOnceWith({ number: 4 });
      expect(archiveTicket).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('keeps an archived Ticket editable', async () => {
      vi.mocked(updateTicket).mockResolvedValue({ ok: true, projectId: 1 });
      renderDrawer({ ...ticket, archived: true });

      await userEvent.selectOptions(field('Status'), 'Done');
      await userEvent.click(titleButton());

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        status: 'Done',
      });
      expect(titleInput()).toBeEnabled();
    });

    it('offers Restore as soon as the Ticket is archived', async () => {
      vi.mocked(archiveTicket).mockResolvedValue({ ok: true });
      const { rerender } = renderDrawer();

      await userEvent.click(button('Archive'));
      rerender(<InShell ticket={{ ...ticket, archived: true }} />);

      expect(button('Restore')).toBeInTheDocument();
    });

    it('follows an archive or restore made elsewhere', () => {
      const { rerender } = renderDrawer();

      rerender(<InShell ticket={{ ...ticket, archived: true }} />);
      expect(
        inDrawer().getByText('This Ticket is archived'),
      ).toBeInTheDocument();

      rerender(<InShell ticket={ticket} />);
      expect(button('Archive')).toBeInTheDocument();
    });

    it('explains a refused archive', async () => {
      vi.mocked(archiveTicket).mockResolvedValue({
        ok: false,
        error: 'There is no Ticket T4.',
      });
      renderDrawer();

      await userEvent.click(button('Archive'));

      expect(
        inDrawer()
          .getAllByRole('alert')
          .some((alert) => alert.textContent === 'There is no Ticket T4.'),
      ).toBe(true);
    });

    describe('an Epic', () => {
      const child = {
        number: 9,
        title: 'Pay by card',
        status: 'In progress' as const,
        archived: false,
        blockedBy: [],
        blocked: false,
      };
      const epic: Ticket = {
        ...ticket,
        number: 8,
        title: 'Checkout',
        type: 'Epic',
        children: [
          child,
          { ...child, number: 10, title: 'Old idea', archived: true },
        ],
      };

      it('asks before archiving it with its children that are not archived', async () => {
        vi.mocked(archiveTicket).mockResolvedValue({ ok: true });
        renderWithTheme(
          <InShell
            ticket={epic}
            epicChildren={[
              {
                number: 9,
                title: 'Pay by card',
                claim: { agentRunId: 'run-1', agentName: null },
                blocks: [],
              },
              { number: 10, title: 'Old idea', claim: null, blocks: [] },
            ]}
          />,
        );

        await userEvent.click(button('Archive'));
        const dialog = screen.getByRole('dialog', {
          name: 'Archive T8 and its children?',
        });

        expect(
          within(dialog).getByRole('list', { name: 'Children' }),
        ).toHaveTextContent('T9 Pay by card · In progress');
        expect(dialog).not.toHaveTextContent('Old idea');
        expect(dialog).toHaveTextContent('Agent run run-1 has claimed T9');
        expect(archiveTicket).not.toHaveBeenCalled();

        await userEvent.click(
          within(dialog).getByRole('button', { name: 'Archive T8' }),
        );

        expect(archiveTicket).toHaveBeenCalledExactlyOnceWith({
          number: 8,
          withChildren: true,
        });
      });

      it('archives it at once when every child is archived', async () => {
        vi.mocked(archiveTicket).mockResolvedValue({ ok: true });
        renderDrawer({
          ...epic,
          children: epic.children.map((each) => ({ ...each, archived: true })),
        });

        await userEvent.click(button('Archive'));

        expect(archiveTicket).toHaveBeenCalledExactlyOnceWith({ number: 8 });
        expect(
          screen.queryByRole('dialog', { name: /Archive T8/ }),
        ).not.toBeInTheDocument();
      });
    });

    it.each([false, true])(
      'offers Delete in the footer, archived: %s (ADR 0012)',
      (archived) => {
        renderDrawer({ ...ticket, archived });

        expect(
          inDrawer().getByRole('button', { name: 'Delete' }),
        ).toBeInTheDocument();
      },
    );

    it('closes to its Board by replacing the URL once the Ticket is deleted', async () => {
      vi.mocked(deleteTicket).mockResolvedValue({ ok: true });
      renderWithTheme(
        <InShell ticket={ticket} boardPath="/project/1/cycle/7" />,
      );

      await userEvent.click(button('Delete'));
      await userEvent.click(
        screen.getByRole('button', { name: `Delete T${ticket.number}` }),
      );

      expect(deleteTicket).toHaveBeenCalledWith({
        number: ticket.number,
        withChildren: false,
      });
      expect(router.replace).toHaveBeenCalledExactlyOnceWith(
        '/project/1/cycle/7',
        { scroll: false },
      );
    });

    it('stays open while the Delete dialog takes an Escape', async () => {
      renderDrawer();

      await userEvent.click(button('Delete'));
      await userEvent.keyboard('{Escape}');

      expect(router.replace).not.toHaveBeenCalled();
      expect(router.back).not.toHaveBeenCalled();
    });
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
