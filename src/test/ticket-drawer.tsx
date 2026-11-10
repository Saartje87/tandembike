import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import type { FC } from 'react';
import { onTestFinished, vi } from 'vitest';

import { approveMerge } from '../app/conversations/actions';
import {
  addTicketLabel,
  archiveTicket,
  backToTodo,
  clearTicketClaim,
  completeTicket,
  restoreTicket,
  type UpdateTicketResult,
  updateTicket,
} from '../app/tickets/actions';
import { useTicketLiveConversation } from '../components/conversation-activity/conversation-activity';
import { useConversationDialog } from '../components/conversation-dialog-provider/conversation-dialog-provider';
import {
  TicketDrawer,
  type TicketDrawerProps,
} from '../components/ticket-drawer/ticket-drawer';
import { TicketDrawerShell } from '../components/ticket-drawer-shell/ticket-drawer-shell';
import type { Conversation } from '../conversations/conversations';
import type { Ticket } from '../tickets/tickets';
import { aConversation } from './fixtures';
import { mockRouter } from './navigation';
import { renderWithTheme } from './render';

/**
 * Shared by the TicketDrawer test files, which split its tests by area so
 * they run in parallel. Each test file mocks the Server Actions, router and
 * Conversation hooks itself; this module uses those mocks.
 */
export const ticket: Ticket = {
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
export const InShell: FC<InShellProps> = ({
  boardPath = '/project/1',
  ...props
}) => (
  <TicketDrawerShell number={props.ticket.number} boardPath={boardPath}>
    <TicketDrawer {...props} />
  </TicketDrawerShell>
);

export const renderDrawer = (shown: Ticket = ticket) =>
  renderWithTheme(<InShell ticket={shown} />);

export const drawer = () => screen.getByRole('dialog');
export const inDrawer = () => within(drawer());
export const button = (name: string) =>
  inDrawer().getByRole('button', { name });
export const field = (name: string) => inDrawer().getByLabelText(name);
export const titleButton = () => button('Fix the header');
export const titleInput = () =>
  inDrawer().getByRole('textbox', { name: 'Title' });
export const descriptionInput = () =>
  inDrawer().getByRole('textbox', { name: 'Description' });
/** Opens the description by clicking its text, which starts with "It overlaps". */
export const editDescription = () =>
  userEvent.click(inDrawer().getByText(/^It overlaps/));
/** Saves the field being edited by clicking elsewhere in the drawer. */
export const leaveField = () =>
  userEvent.click(
    inDrawer().getByRole('heading', { level: 3, name: 'Description' }),
  );

/**
 * An `updateTicket` result the test settles itself, to look at the drawer
 * while the save is pending. Settled after the test either way: React holds
 * pending async transitions together, so one left pending would hold up
 * later tests.
 */
export const pendingUpdate = () => {
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
export const keysReachingDocument = () => {
  const claimed = vi.fn();
  const onKeyDown = (event: KeyboardEvent) => claimed(event.defaultPrevented);
  document.addEventListener('keydown', onKeyDown);
  onTestFinished(() => document.removeEventListener('keydown', onKeyDown));
  return claimed;
};

/** Whether the elements appear in this order in the document. */
export const inDocumentOrder = (...elements: Element[]) =>
  elements.every(
    (element, index) =>
      index === 0 ||
      Boolean(
        elements[index - 1].compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  );

export const dialog = {
  conversations: [],
  open: vi.fn(),
  show: vi.fn(),
  reopenAndOpen: vi.fn(),
  openDraft: vi.fn(),
  shown: false,
};

export const at = new Date('2026-03-03T09:00:00Z');

export const conversationWithId = (
  id: number,
  values: Partial<Conversation> = {},
): Conversation =>
  aConversation({
    id,
    ticketNumber: 4,
    createdAt: at,
    updatedAt: at,
    ...values,
  });

/** Resets the mocks the drawer tests share and returns a fresh router. */
export const resetDrawerMocks = () => {
  const router = mockRouter();
  vi.mocked(useRouter).mockReturnValue(router);
  vi.mocked(updateTicket).mockReset();
  vi.mocked(archiveTicket).mockReset();
  vi.mocked(restoreTicket).mockReset();
  vi.mocked(addTicketLabel).mockReset();
  vi.mocked(clearTicketClaim).mockReset();
  vi.mocked(completeTicket).mockReset();
  vi.mocked(backToTodo).mockReset();
  vi.mocked(approveMerge).mockReset();
  vi.mocked(useTicketLiveConversation).mockReset().mockReturnValue(undefined);
  vi.mocked(useConversationDialog).mockReturnValue(dialog);
  dialog.open.mockReset();
  dialog.reopenAndOpen.mockReset().mockResolvedValue(undefined);
  dialog.openDraft.mockReset();
  return router;
};
