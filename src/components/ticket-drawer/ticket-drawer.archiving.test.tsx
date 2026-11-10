// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { approveMerge } from '../../app/conversations/actions';
import {
  archiveTicket,
  backToTodo,
  clearTicketClaim,
  completeTicket,
  deleteTicket,
  restoreTicket,
  updateTicket,
} from '../../app/tickets/actions';
import { anEpicChild } from '../../test/fixtures';
import type { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import {
  button,
  descriptionInput,
  editDescription,
  field,
  InShell,
  inDrawer,
  leaveField,
  renderDrawer,
  resetDrawerMocks,
  ticket,
  titleButton,
  titleInput,
} from '../../test/ticket-drawer';
import type { EpicLink } from '../../tickets/epic-link';
import type { Ticket } from '../../tickets/tickets';

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

    describe('read-only while archived (T1313)', () => {
      const related = (number: number, title: string) => ({
        number,
        title,
        status: 'Todo' as const,
        projectId: 1,
        archived: false,
        resolved: false,
      });
      const pullRequest = 'https://github.com/owner/repo/pull/87';
      const full: Ticket = {
        ...ticket,
        labels: ['bug'],
        externalReferences: [pullRequest],
        epic: {
          number: 8,
          title: 'Checkout',
          claim: null,
          color: 'teal',
          hasPullRequest: false,
        },
        acceptanceCriteria: [{ id: 1, text: 'Logo visible', checked: true }],
        claim: { agentRunId: 'run-1', agentName: 'A' },
      };
      const epics: EpicLink[] = [
        full.epic as EpicLink,
        {
          number: 12,
          title: 'Search',
          claim: null,
          color: 'red',
          hasPullRequest: false,
        },
      ];
      const props = {
        allLabels: ['bug', 'ui'],
        epics,
        blockers: {
          blockedBy: [related(5, 'Design header')],
          blocks: [related(6, 'Ship it')],
        },
        cycles: [
          {
            id: 7,
            projectId: 1,
            title: 'Beta',
            state: 'Prepared' as const,
            ticketNumbers: [4],
            createdAt: new Date('2026-01-01'),
            archivedAt: null,
          },
        ],
      };
      const renderFull = (shown: Ticket) =>
        renderWithTheme(<InShell ticket={shown} {...props} />);

      const editControls = [
        'Fix the header',
        'Detach from Epic',
        'Set Origin',
        'Remove label bug',
        `Remove External reference ${pullRequest}`,
        'Add External reference',
        'Remove Blocker T5',
        'Add blocker',
        'Stop blocking T6',
        'Add blocked Ticket',
        'Drag criterion: Logo visible',
        'Remove criterion: Logo visible',
        'Add criterion',
      ];

      const expectReadOnly = () => {
        for (const name of editControls) {
          expect(
            inDrawer().queryByRole('button', { name }),
            name,
          ).not.toBeInTheDocument();
        }
        for (const name of ['Status', 'Add a label', 'Move to another Epic']) {
          expect(
            inDrawer().queryByLabelText(name),
            name,
          ).not.toBeInTheDocument();
        }
        expect(
          inDrawer().getByRole('checkbox', { name: 'Logo visible' }),
        ).toBeDisabled();
      };

      it('shows its fields without edit controls', async () => {
        renderFull({ ...full, archived: true });

        expectReadOnly();
        expect(
          inDrawer().getByRole('heading', { level: 2, name: 'Fix the header' }),
        ).toBeInTheDocument();
        expect(inDrawer().getByText('In progress')).toBeInTheDocument();
        expect(
          within(inDrawer().getByRole('list', { name: 'Labels' })).getByText(
            'bug',
          ),
        ).toBeInTheDocument();
        expect(
          inDrawer().getByRole('link', { name: 'T8 Checkout' }),
        ).toBeInTheDocument();
        expect(inDrawer().getByRole('link', { name: 'Beta' })).toBeVisible();
        // ADR 0010: an archived Ticket can still leave its Cycle.
        expect(button('Remove from Cycle')).toBeEnabled();
        expect(
          inDrawer().getByRole('link', { name: 'owner/repo#87' }),
        ).toBeVisible();
        expect(
          inDrawer().getByRole('link', { name: 'T5 Design header' }),
        ).toBeVisible();
        expect(
          inDrawer().getByRole('link', { name: 'T6 Ship it' }),
        ).toBeVisible();
        expect(
          inDrawer().getByRole('checkbox', { name: 'Logo visible' }),
        ).toBeChecked();
        await userEvent.click(inDrawer().getByText(/^It overlaps/));
        expect(
          inDrawer().queryByRole('textbox', { name: 'Description' }),
        ).not.toBeInTheDocument();
        expect(updateTicket).not.toHaveBeenCalled();
      });

      it("offers no Detach on an archived Epic's children", () => {
        renderDrawer({
          ...ticket,
          type: 'Epic',
          archived: true,
          children: [
            anEpicChild({ number: 9, title: 'Pay by card', archived: true }),
          ],
        });

        expect(
          inDrawer().getByRole('link', { name: 'Pay by card' }),
        ).toBeInTheDocument();
        expect(
          inDrawer().queryByRole('button', { name: 'Detach T9' }),
        ).not.toBeInTheDocument();
      });

      it("shows an archived Epic's colour without a picker", () => {
        renderDrawer({
          ...ticket,
          type: 'Epic',
          color: 'teal',
          archived: true,
        });

        expect(
          inDrawer().queryByRole('button', { name: /^Epic colour/ }),
        ).not.toBeInTheDocument();
        expect(inDrawer().getByText('Teal')).toBeInTheDocument();
      });

      it('still offers Restore, comments, Attachments, Delete and Clear claim', () => {
        renderFull({ ...full, archived: true });

        expect(button('Restore')).toBeEnabled();
        expect(
          inDrawer().getByRole('textbox', { name: 'Add a comment' }),
        ).toBeInTheDocument();
        expect(button('Add files')).toBeEnabled();
        expect(button('Delete')).toBeEnabled();
        expect(button('Clear claim')).toBeEnabled();
        expect(button('Ask')).toBeEnabled();
      });

      it.each<[string, Ticket]>([
        ['in Review', { ...ticket, externalReferences: [pullRequest] }],
        ['parked', ticket],
        ['in Intake', { ...ticket, status: 'Todo' }],
      ])('offers no agent action that changes a Ticket %s', (_state, shown) => {
        renderWithTheme(
          <InShell
            ticket={{ ...shown, archived: true }}
            triageProposal={{
              id: 1,
              ticketNumber: 4,
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

        for (const name of [
          /^Merged/,
          /^Done/,
          /^Approve merge/,
          'Back to Todo',
          'Start',
          'Triage',
          'Spec',
          /^Approve/,
        ]) {
          expect(
            inDrawer().queryByRole('button', { name }),
            String(name),
          ).not.toBeInTheDocument();
        }
      });

      it('turns read-only as soon as Archive is pressed, and editable again on Restore', async () => {
        const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
        vi.mocked(archiveTicket).mockReturnValue(promise);
        onTestFinished(() => resolve({ ok: true }));
        vi.mocked(restoreTicket).mockResolvedValue({ ok: true });
        const { rerender } = renderFull(full);

        await userEvent.click(button('Archive'));
        expectReadOnly();

        rerender(<InShell ticket={{ ...full, archived: true }} {...props} />);
        await act(async () => resolve({ ok: true }));
        await userEvent.click(button('Restore'));
        rerender(<InShell ticket={full} {...props} />);

        for (const name of editControls) {
          expect(button(name)).toBeInTheDocument();
        }
        expect(field('Status')).toBeEnabled();
        expect(field('Add a label')).toBeEnabled();
        expect(
          inDrawer().getByRole('checkbox', { name: 'Logo visible' }),
        ).toBeEnabled();
      });
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
      const child = anEpicChild({
        number: 9,
        title: 'Pay by card',
        status: 'In progress',
      });
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

  describe('when an action throws (T1321)', () => {
    const pullRequest = 'https://github.com/owner/repo/pull/87';
    const inReview: Ticket = { ...ticket, externalReferences: [pullRequest] };
    const thrown = () => Promise.reject(new Error('network down'));

    beforeEach(() => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => log.mockRestore());
    });

    it('goes back to the old Status and shows a refusal', async () => {
      vi.mocked(updateTicket).mockImplementation(thrown);
      renderDrawer();

      await userEvent.selectOptions(field('Status'), 'Done');

      await waitFor(() =>
        expect(field('Status')).toHaveAccessibleDescription(
          'The Ticket could not be saved. Try again.',
        ),
      );
      await waitFor(() => expect(field('Status')).toHaveValue('In progress'));
    });

    it("keeps the title input open with the User's text", async () => {
      vi.mocked(updateTicket).mockImplementation(thrown);
      renderDrawer();

      await userEvent.click(titleButton());
      await userEvent.clear(titleInput());
      await userEvent.type(titleInput(), 'Fix the footer{Enter}');

      expect(
        await inDrawer().findByRole('textbox', { name: 'Title' }),
      ).toHaveValue('Fix the footer');
      await waitFor(() =>
        expect(titleInput()).toHaveAccessibleDescription(
          'The Ticket could not be saved. Try again.',
        ),
      );
    });

    it("keeps the User's description text", async () => {
      vi.mocked(updateTicket).mockImplementation(thrown);
      renderDrawer();

      await editDescription();
      await userEvent.type(descriptionInput(), '!');
      await leaveField();

      expect(
        await inDrawer().findByRole('textbox', { name: 'Description' }),
      ).toHaveValue('It overlaps the **logo**.!');
      await waitFor(() =>
        expect(descriptionInput()).toHaveAccessibleDescription(
          'The Ticket could not be saved. Try again.',
        ),
      );
    });

    it('shows an archive as a refusal and the Ticket as not archived', async () => {
      vi.mocked(archiveTicket).mockImplementation(thrown);
      renderDrawer();

      await userEvent.click(button('Archive'));

      await waitFor(() =>
        expect(
          inDrawer()
            .getAllByRole('alert')
            .map((alert) => alert.textContent),
        ).toContain('The Ticket could not be archived. Try again.'),
      );
      await waitFor(() => expect(button('Archive')).toBeEnabled());
    });

    it('shows a restore as a refusal and the Ticket as archived again', async () => {
      vi.mocked(restoreTicket).mockImplementation(thrown);
      renderDrawer({ ...ticket, archived: true });

      await userEvent.click(button('Restore'));

      await waitFor(() =>
        expect(
          inDrawer()
            .getAllByRole('alert')
            .map((alert) => alert.textContent),
        ).toContain('The Ticket could not be restored. Try again.'),
      );
      await waitFor(() => expect(button('Restore')).toBeEnabled());
    });

    it('shows Back to Todo as a refusal', async () => {
      vi.mocked(backToTodo).mockImplementation(thrown);
      renderDrawer();

      await userEvent.click(button('Back to Todo'));

      expect(
        await inDrawer().findByText(
          'The Ticket could not be moved back to Todo. Try again.',
        ),
      ).toBeInTheDocument();
      await waitFor(() => expect(button('Back to Todo')).toBeEnabled());
    });

    it('shows Merged as a refusal', async () => {
      vi.mocked(completeTicket).mockImplementation(thrown);
      renderDrawer(inReview);

      await userEvent.click(button('Merged T4 Fix the header'));

      expect(
        await inDrawer().findByText(
          'The Ticket could not be finished. Try again.',
        ),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(button('Merged T4 Fix the header')).toBeEnabled(),
      );
    });

    it('shows Approve merge as a refusal', async () => {
      vi.mocked(approveMerge).mockImplementation(thrown);
      renderDrawer(inReview);

      await userEvent.click(button('Approve merge T4 Fix the header'));

      expect(
        await inDrawer().findByText(
          'The merge could not be approved. Try again.',
        ),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(button('Approve merge T4 Fix the header')).toBeEnabled(),
      );
    });

    it('shows Clear claim as a refusal and the claim again', async () => {
      vi.mocked(clearTicketClaim).mockImplementation(thrown);
      renderDrawer({
        ...ticket,
        claim: { agentRunId: 'run-1', agentName: 'Frontend Agent' },
      });

      await userEvent.click(button('Clear claim'));

      expect(
        await inDrawer().findByText(
          'The claim could not be cleared. Try again.',
        ),
      ).toBeInTheDocument();
      await waitFor(() => expect(button('Clear claim')).toBeEnabled());
    });
  });
});
