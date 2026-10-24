import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { Activity } from 'react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  addTicketBlocker,
  addTicketLabel,
  archiveTicket,
  checkTicketAcceptanceCriterion,
  clearTicketClaim,
  restoreTicket,
  type UpdateTicketResult,
  updateTicket,
} from '../../app/tickets/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { Ticket } from '../../tickets/tickets';
import { TicketDrawer } from './ticket-drawer';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/tickets/actions', () => ({
  addTicketBlocker: vi.fn(),
  removeTicketBlocker: vi.fn(),
  addTicketLabel: vi.fn(),
  removeTicketLabel: vi.fn(),
  clearTicketClaim: vi.fn(),
  updateTicket: vi.fn(),
  archiveTicket: vi.fn(),
  restoreTicket: vi.fn(),
  addTicketComment: vi.fn(),
  editTicketComment: vi.fn(),
  removeTicketComment: vi.fn(),
  checkTicketAcceptanceCriterion: vi.fn(),
  setTicketAcceptanceCriteria: vi.fn(),
}));

const projects = [
  { id: 1, name: 'Website', createdAt: new Date('2026-01-01') },
  { id: 2, name: 'App', createdAt: new Date('2026-01-02') },
];

const ticket: Ticket = {
  number: 4,
  title: 'Fix the header',
  description: 'It overlaps the **logo**.',
  status: 'In progress',
  projectId: 1,
  position: 0,
  archived: false,
  labels: [],
  blockedBy: [],
  blocked: false,
  claim: null,
  acceptanceCriteria: [],
  createdAt: new Date('2026-03-01T09:00:00Z'),
  updatedAt: new Date('2026-03-02T10:30:00Z'),
};

const renderDrawer = (shown: Ticket = ticket, closeWithBack = false) =>
  renderWithTheme(
    <TicketDrawer
      ticket={shown}
      projects={projects}
      closeWithBack={closeWithBack}
    />,
  );

const drawer = () => screen.getByRole('dialog');
const inDrawer = () => within(drawer());
const button = (name: string) => inDrawer().getByRole('button', { name });
const field = (name: string) => inDrawer().getByLabelText(name);
const titleButton = () => button('Fix the header');
const titleInput = () => inDrawer().getByRole('textbox', { name: 'Title' });
const descriptionInput = () =>
  inDrawer().getByRole('textbox', { name: 'Description' });
const editDescription = () => userEvent.click(button('Edit description'));

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
 * A spy on keydowns that reach the document, where the Drawer closes on
 * Escape. Call it once the edit is open.
 */
const keysReachingDocument = () => {
  const onKeyDown = vi.fn();
  document.addEventListener('keydown', onKeyDown);
  onTestFinished(() => document.removeEventListener('keydown', onKeyDown));
  return onKeyDown;
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
    expect(inDrawer().getByText('#4')).toBeInTheDocument();
    expect(
      inDrawer().getByRole('heading', { level: 2, name: 'Fix the header' }),
    ).toBeInTheDocument();
    expect(
      inDrawer().queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
  });

  it('shows the number and Close, title, details, description, then the footer', () => {
    renderDrawer({ ...ticket, archived: true });

    expect(
      inDocumentOrder(
        inDrawer().getByText('#4'),
        button('Close'),
        inDrawer().getByText('This Ticket is archived'),
        inDrawer().getByRole('heading', { level: 2 }),
        field('Status'),
        field('Project'),
        inDrawer().getByText('Labels'),
        inDrawer().getByRole('heading', { name: 'Description' }),
        inDrawer().getByRole('heading', { name: 'Acceptance criteria' }),
        inDrawer().getByText(/^Created/),
      ),
    ).toBe(true);
  });

  it("shows the Ticket's Status and Project", () => {
    renderDrawer();

    expect(field('Status')).toHaveValue('In progress');
    expect(field('Project')).toHaveDisplayValue('Website');
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
      <TicketDrawer
        ticket={ticket}
        projects={projects}
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
      within(inDrawer().getByRole('list', { name: 'Comments' })).getByText(
        'Started on it.',
      ),
    ).toBeInTheDocument();
    expect(
      inDrawer().getByRole('textbox', { name: 'Add a comment' }),
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

  describe('Status and Project', () => {
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
        error: 'There is no Ticket #4.',
      });
      renderDrawer();

      await userEvent.selectOptions(field('Status'), 'Done');

      await waitFor(() => expect(field('Status')).toHaveValue('In progress'));
      expect(field('Status')).toHaveAccessibleDescription(
        'There is no Ticket #4.',
      );
    });

    it('saves a new Project on its own and shows it at once', async () => {
      pendingUpdate();
      renderDrawer();

      await userEvent.selectOptions(field('Project'), 'App');

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        projectId: 2,
      });
      expect(field('Project')).toHaveDisplayValue('App');
    });

    it('goes back to the old Project and says why when it is refused', async () => {
      vi.mocked(updateTicket).mockResolvedValue({
        ok: false,
        error: 'There is no Project with id 2.',
      });
      renderDrawer();

      await userEvent.selectOptions(field('Project'), 'App');

      await waitFor(() =>
        expect(field('Project')).toHaveDisplayValue('Website'),
      );
      expect(field('Project')).toHaveAccessibleDescription(
        'There is no Project with id 2.',
      );
    });

    it('updates its URL and close destination when moved to another Project', async () => {
      vi.mocked(updateTicket).mockResolvedValue({ ok: true, projectId: 2 });
      renderDrawer(ticket, true);

      await userEvent.selectOptions(field('Project'), 'App');

      expect(router.replace).toHaveBeenCalledExactlyOnceWith(
        '/project/2/ticket/4',
      );

      await userEvent.click(button('Close'));

      expect(router.push).toHaveBeenCalledExactlyOnceWith('/project/2');
      expect(router.back).not.toHaveBeenCalled();
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

    it('saves when the input loses focus', async () => {
      vi.mocked(updateTicket).mockResolvedValue({ ok: true, projectId: 1 });
      renderDrawer();

      await userEvent.click(titleButton());
      await userEvent.type(titleInput(), '!');
      await userEvent.tab();

      expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        title: 'Fix the header!',
      });
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

      expect(keys).not.toHaveBeenCalled();
      expect(updateTicket).not.toHaveBeenCalled();
      expect(titleButton()).toHaveFocus();
      expect(router.push).not.toHaveBeenCalled();
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
      // The optimistic title gives way once the refused save settles.
      expect(
        await screen.findByRole('dialog', { name: 'Fix the header' }),
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

      rerender(
        <TicketDrawer
          ticket={{ ...ticket, title: 'Fix the logo' }}
          projects={projects}
        />,
      );
      await userEvent.click(button('Fix the logo'));
      await userEvent.type(titleInput(), '!');
      rerender(
        <TicketDrawer
          ticket={{ ...ticket, title: 'Fix the menu' }}
          projects={projects}
        />,
      );

      expect(titleInput()).toHaveValue('Fix the logo!');
    });
  });

  describe('description', () => {
    it('shows the description as formatted Markdown', () => {
      renderDrawer();

      expect(inDrawer().getByText('logo').tagName).toBe('STRONG');
    });

    it('says when there is no description', () => {
      renderDrawer({ ...ticket, description: '' });

      expect(inDrawer().getByText('No description')).toBeInTheDocument();
    });

    it('edits the description as plain Markdown and saves it on its own', async () => {
      pendingUpdate();
      renderDrawer();

      await editDescription();
      expect(descriptionInput()).toHaveValue('It overlaps the **logo**.');
      expect(button('Cancel')).toBeInTheDocument();
      await userEvent.type(descriptionInput(), ' Use *flex*.');
      await userEvent.click(button('Save'));

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

      expect(keys).not.toHaveBeenCalled();
      expect(updateTicket).not.toHaveBeenCalled();
      expect(inDrawer().getByText('logo').tagName).toBe('STRONG');
      expect(button('Edit description')).toHaveFocus();
      expect(router.push).not.toHaveBeenCalled();
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

    // The drawer closes on a document click whose target has left the dialog,
    // and the button is gone by the time the click gets there.
    it('keeps the click that starts editing from closing the drawer', async () => {
      const onDocumentClick = vi.fn();
      document.addEventListener('click', onDocumentClick);
      onTestFinished(() =>
        document.removeEventListener('click', onDocumentClick),
      );
      renderDrawer();

      await editDescription();

      expect(descriptionInput()).toBeInTheDocument();
      expect(onDocumentClick).not.toHaveBeenCalled();
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
      await userEvent.click(button('Save'));

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
        error: 'There is no Ticket #4.',
      });
      renderDrawer();

      await editDescription();
      await userEvent.type(descriptionInput(), '!');
      await userEvent.click(button('Save'));
      await waitFor(() =>
        expect(descriptionInput()).toHaveAccessibleDescription(
          'There is no Ticket #4.',
        ),
      );
      await userEvent.click(button('Cancel'));

      expect(
        inDrawer().queryByText('There is no Ticket #4.'),
      ).not.toBeInTheDocument();
      await editDescription();
      expect(descriptionInput()).toHaveValue('It overlaps the **logo**.');
      expect(descriptionInput()).not.toHaveAccessibleDescription();
    });

    it('saves nothing when the text is as the edit began, though it changed elsewhere', async () => {
      const { rerender } = renderDrawer();

      await editDescription();
      rerender(
        <TicketDrawer
          ticket={{ ...ticket, description: 'Changed by an Agent.' }}
          projects={projects}
        />,
      );
      await userEvent.click(button('Save'));

      expect(updateTicket).not.toHaveBeenCalled();
      expect(inDrawer().getByText('Changed by an Agent.')).toBeInTheDocument();
    });

    it('shows the saved description once it comes back', async () => {
      vi.mocked(updateTicket).mockResolvedValue({ ok: true, projectId: 1 });
      const { rerender } = renderDrawer();

      await editDescription();
      await userEvent.clear(descriptionInput());
      await userEvent.type(descriptionInput(), 'Now *shorter*.');
      await userEvent.click(button('Save'));
      rerender(
        <TicketDrawer
          ticket={{ ...ticket, description: 'Now *shorter*.' }}
          projects={projects}
        />,
      );

      expect(inDrawer().getByText('shorter').tagName).toBe('EM');
    });

    it('keeps the description being edited when the Ticket changes elsewhere', async () => {
      const { rerender } = renderDrawer();

      await editDescription();
      rerender(
        <TicketDrawer
          ticket={{
            ...ticket,
            description: 'Changed by an Agent.',
            status: 'Done',
          }}
          projects={projects}
        />,
      );

      expect(descriptionInput()).toHaveValue('It overlaps the **logo**.');
      expect(field('Status')).toHaveValue('Done');
    });

    describe('closing with unsaved changes', () => {
      const confirm = (answer: boolean) => {
        const spy = vi.spyOn(window, 'confirm').mockReturnValue(answer);
        onTestFinished(() => spy.mockRestore());
        return spy;
      };

      it('asks first, and stays open with the draft when declined', async () => {
        const asked = confirm(false);
        renderDrawer();

        await editDescription();
        await userEvent.type(descriptionInput(), '!');
        await userEvent.click(button('Close'));

        expect(asked).toHaveBeenCalledExactlyOnceWith(
          'Discard changes to the description?',
        );
        expect(router.push).not.toHaveBeenCalled();
        expect(descriptionInput()).toHaveValue('It overlaps the **logo**.!');
      });

      it('asks first on an Escape from outside the editor', async () => {
        const asked = confirm(false);
        renderDrawer();

        await editDescription();
        await userEvent.type(descriptionInput(), '!');
        button('Close').focus();
        await userEvent.keyboard('{Escape}');

        expect(asked).toHaveBeenCalledOnce();
        expect(router.push).not.toHaveBeenCalled();
      });

      it('closes when the User agrees to discard them', async () => {
        confirm(true);
        renderDrawer();

        await editDescription();
        await userEvent.type(descriptionInput(), '!');
        await userEvent.click(button('Close'));

        expect(router.push).toHaveBeenCalledExactlyOnceWith('/project/1');
      });

      it('closes without asking when the description is typed back to how it was', async () => {
        const asked = confirm(false);
        renderDrawer();

        await editDescription();
        await userEvent.type(descriptionInput(), '!');
        await userEvent.type(descriptionInput(), '{Backspace}');
        await userEvent.click(button('Close'));

        expect(asked).not.toHaveBeenCalled();
        expect(router.push).toHaveBeenCalledExactlyOnceWith('/project/1');
      });

      it('asks again after a refused description reopens with its text', async () => {
        vi.mocked(updateTicket).mockResolvedValue({
          ok: false,
          error: 'There is no Ticket #4.',
        });
        const asked = confirm(false);
        renderDrawer();

        await editDescription();
        await userEvent.type(descriptionInput(), '!');
        await userEvent.click(button('Save'));
        await inDrawer().findByRole('textbox', { name: 'Description' });
        await userEvent.click(button('Close'));

        expect(asked).toHaveBeenCalledOnce();
        expect(router.push).not.toHaveBeenCalled();
      });

      it('closes without asking when the description is unchanged', async () => {
        const asked = confirm(false);
        renderDrawer();

        await editDescription();
        await userEvent.click(button('Close'));

        expect(asked).not.toHaveBeenCalled();
        expect(router.push).toHaveBeenCalledExactlyOnceWith('/project/1');
      });
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
        <TicketDrawer
          ticket={ticket}
          projects={projects}
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
      ).toHaveTextContent('#2 Design the header');
      expect(
        within(inDrawer().getByRole('list', { name: 'Blocks' })).getByRole(
          'link',
        ),
      ).toHaveTextContent('#7 Ship the header');
    });

    it('says plainly in the Blocked by row whether the Ticket is blocked', () => {
      renderWithTheme(
        <TicketDrawer
          ticket={{ ...ticket, blockedBy: [2], blocked: true }}
          projects={projects}
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
        <TicketDrawer
          ticket={{ ...ticket, blockedBy: [2], blocked: false }}
          projects={projects}
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
      renderWithTheme(
        <TicketDrawer
          ticket={ticket}
          projects={projects}
          allLabels={['bug']}
        />,
      );

      const select = inDrawer().getByRole('combobox', { name: 'Add a label' });
      await userEvent.selectOptions(select, 'bug');

      expect(addTicketLabel).toHaveBeenCalledExactlyOnceWith({
        number: 4,
        label: 'bug',
      });
      expect(select).toBeInTheDocument();
      expect(drawer()).toBeInTheDocument();
      expect(router.push).not.toHaveBeenCalled();
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
      expect(router.push).not.toHaveBeenCalled();
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
      expect(router.push).not.toHaveBeenCalled();
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
      expect(router.push).not.toHaveBeenCalled();
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
      rerender(
        <TicketDrawer
          ticket={{ ...ticket, archived: true }}
          projects={projects}
        />,
      );

      expect(button('Restore')).toBeInTheDocument();
    });

    it('follows an archive or restore made elsewhere', () => {
      const { rerender } = renderDrawer();

      rerender(
        <TicketDrawer
          ticket={{ ...ticket, archived: true }}
          projects={projects}
        />,
      );
      expect(
        inDrawer().getByText('This Ticket is archived'),
      ).toBeInTheDocument();

      rerender(<TicketDrawer ticket={ticket} projects={projects} />);
      expect(button('Archive')).toBeInTheDocument();
    });

    it('explains a refused archive', async () => {
      vi.mocked(archiveTicket).mockResolvedValue({
        ok: false,
        error: 'There is no Ticket #4.',
      });
      renderDrawer();

      await userEvent.click(button('Archive'));

      expect(
        inDrawer()
          .getAllByRole('alert')
          .some((alert) => alert.textContent === 'There is no Ticket #4.'),
      ).toBe(true);
    });

    it('has no way to delete the Ticket', () => {
      renderDrawer();

      expect(
        inDrawer().queryByRole('button', { name: /delete/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("closes to the Ticket's Board", async () => {
    renderDrawer();

    await userEvent.click(button('Close'));

    expect(router.push).toHaveBeenCalledExactlyOnceWith('/project/1');
  });

  it('uses browser history to close an intercepted Ticket drawer', async () => {
    renderDrawer(ticket, true);

    await userEvent.click(button('Close'));

    expect(router.back).toHaveBeenCalledExactlyOnceWith();
    expect(router.push).not.toHaveBeenCalled();
  });

  // Next.js keeps a route the User left in a hidden <Activity>, and shows it
  // again when they come back.
  it('takes its dialog down while its route is hidden and reopens fresh', async () => {
    const at = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <TicketDrawer ticket={ticket} projects={projects} />
      </Activity>
    );
    const { rerender } = renderWithTheme(at('visible'));
    await editDescription();
    await userEvent.type(descriptionInput(), '!');

    rerender(at('hidden'));
    expect(document.querySelector('dialog')).toBeNull();

    rerender(at('visible'));
    expect(drawer()).toHaveAttribute('open');
    expect(
      inDrawer().queryByRole('textbox', { name: 'Description' }),
    ).not.toBeInTheDocument();
  });
});
