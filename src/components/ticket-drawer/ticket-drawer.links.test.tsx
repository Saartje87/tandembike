// @vitest-environment jsdom
import { within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { noBoardFilter } from '../../app/lib/paths';
import {
  addTicketBlocker,
  addTicketLabel,
  checkTicketAcceptanceCriterion,
  updateTicket,
} from '../../app/tickets/actions';
import { anEpicChild } from '../../test/fixtures';
import type { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import {
  button,
  drawer,
  field,
  InShell,
  inDocumentOrder,
  inDrawer,
  renderDrawer,
  resetDrawerMocks,
  ticket,
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
      children: [anEpicChild({ number: 9, title: 'Pay by card' })],
    };

    it("opens an Epic's children on the Board below over it", () => {
      renderWithTheme(
        <InShell
          ticket={epic}
          board={{ path: '/project/1', filter: noBoardFilter, onBoard: [9] }}
        />,
      );

      expect(
        within(
          inDrawer().getByRole('list', { name: 'Child Tickets' }),
        ).getByRole('link', { name: 'Pay by card' }),
      ).toHaveAttribute('href', '/project/1?ticket=9');
    });

    it("lists an Epic's child Tickets, with no Epic of its own", () => {
      renderDrawer(epic);

      expect(
        within(
          inDrawer().getByRole('list', { name: 'Child Tickets' }),
        ).getByRole('link', { name: 'Pay by card' }),
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
        {
          number: 8,
          title: 'Checkout',
          color: 'teal',
          claim: null,
          hasPullRequest: false,
        },
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
        epic: {
          number: 8,
          title: 'Checkout',
          color: 'teal',
          claim: null,
          hasPullRequest: false,
        },
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
});
