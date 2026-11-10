// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { updateTicket } from '../../app/tickets/actions';
import type { mockRouter } from '../../test/navigation';
import {
  button,
  descriptionInput,
  editDescription,
  field,
  InShell,
  inDrawer,
  keysReachingDocument,
  leaveField,
  pendingUpdate,
  renderDrawer,
  resetDrawerMocks,
  ticket,
  titleButton,
  titleInput,
} from '../../test/ticket-drawer';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../conversation-activity/conversation-activity', async (original) => ({
  ...(await original<
    typeof import('../conversation-activity/conversation-activity')
  >()),
  useTicketLiveConversation: vi.fn(),
}));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));
vi.mock('../../app/conversations/actions', () => ({
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
});
