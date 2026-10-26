'use server';

import { revalidatePath } from 'next/cache';

import { appTickets } from '../../tickets/app-tickets';
import type { EpicChildInput, EpicChildrenInput } from '../../tickets/epics';
import { ValidationError } from '../../tickets/errors';
import { isStatus, statusRule } from '../../tickets/status';
import type { TicketType } from '../../tickets/ticket-type';
import type {
  AcceptanceCriterionInput,
  BlockerInput,
  MoveTicketsInput,
  ReorderTicketsInput,
  Ticket,
  UpdateTicketInput,
} from '../../tickets/tickets';
import { type ActionResult, actionResult } from '../lib/action-result';
import { boardRoute, cycleRoute, projectPath } from '../lib/paths';

export type CreateTicketResult = ActionResult<{ number: number }>;

/**
 * Creates a Ticket or an Epic in Todo for the UI, under an Epic when
 * `epicNumber` is given; the description defaults to empty.
 * Domain errors come back as `error` (with `fieldErrors` for a validation
 * failure) so the UI can show the module's messages; anything else is a bug
 * and throws.
 */
export async function createTicket(input: {
  projectId: number;
  title: string;
  description?: string;
  /** The Cycle whose tab it was created on, to plan it into. */
  cycleId?: number;
  /** Defaults to a normal Ticket. */
  type?: TicketType;
  /** The Epic whose drawer it was created in, to make it a child of. */
  epicNumber?: number;
}): Promise<CreateTicketResult> {
  return actionResult(() => {
    const ticket = appTickets().createTicket({
      projectId: Number(input?.projectId),
      title: String(input?.title ?? ''),
      description: String(input?.description ?? ''),
      labels: ['needs-triage'],
      ...(input?.cycleId === undefined
        ? {}
        : { cycleId: Number(input.cycleId) }),
      ...(input?.type === undefined ? {} : { type: input.type }),
      ...(input?.epicNumber === undefined
        ? {}
        : { epicNumber: Number(input.epicNumber) }),
    });
    revalidatePath(projectPath(ticket.projectId));
    revalidatePath(cycleRoute, 'page');
    return { number: ticket.number };
  });
}

export type UpdateTicketResult = ActionResult<{ projectId: number }>;

/**
 * Changes the given fields of a Ticket for the UI, which sends only the
 * fields the User changed. Domain errors come back as `error`, like
 * `createTicket`.
 */
export async function updateTicket(
  input: { number: number } & Omit<
    UpdateTicketInput,
    'addLabels' | 'removeLabels' | 'acceptanceCriteria'
  >,
): Promise<UpdateTicketResult> {
  return actionResult(() => {
    const { title, description, status, projectId, color } = input ?? {};
    if (status !== undefined && !isStatus(status)) {
      throw new ValidationError({ status: statusRule });
    }
    const ticket = appTickets().updateTicket(Number(input?.number), {
      ...(title === undefined ? {} : { title: String(title) }),
      ...(description === undefined
        ? {}
        : { description: String(description) }),
      ...(status === undefined ? {} : { status }),
      ...(projectId === undefined ? {} : { projectId: Number(projectId) }),
      // The module checks the colour against the palette.
      ...(color === undefined ? {} : { color }),
    });
    // A moved Ticket leaves one Board for another, and its drawer shows it.
    revalidatePath(boardRoute, 'page');
    revalidatePath(cycleRoute, 'page');
    return { projectId: ticket.projectId };
  });
}

/**
 * Saves a complete Status-lane order and refreshes the Board. A stale lane
 * order is refused by the Tickets module so concurrent changes are not lost.
 */
export async function reorderTickets(
  input: ReorderTicketsInput,
): Promise<ActionResult> {
  return actionResult(() => {
    if (!isStatus(input?.status)) {
      throw new ValidationError({ status: statusRule });
    }
    if (!Array.isArray(input?.ticketNumbers)) {
      throw new ValidationError({
        ticketNumbers: 'Choose each Ticket in the lane exactly once.',
      });
    }
    if (
      input.ticketNumbers.some(
        (number) => !Number.isSafeInteger(number) || number < 1,
      )
    ) {
      throw new ValidationError({
        ticketNumbers: 'Choose each Ticket in the lane exactly once.',
      });
    }
    const projectId = Number(input?.projectId);
    const cycleId = input.cycleId;
    const reorder: ReorderTicketsInput = {
      projectId,
      status: input.status,
      ticketNumbers: input.ticketNumbers,
      ...(cycleId === undefined
        ? {}
        : { cycleId: cycleId === null ? null : Number(cycleId) }),
    };
    appTickets().reorderTickets(reorder);
    revalidatePath(projectPath(projectId));
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}

/**
 * Moves a selection of Tickets into one Status lane together, all or
 * nothing, and refreshes the Boards. Domain errors come back as `error`,
 * like `createTicket`.
 */
export async function moveTickets(
  input: MoveTicketsInput,
): Promise<ActionResult> {
  return actionResult(() => {
    if (!isStatus(input?.status)) {
      throw new ValidationError({ status: statusRule });
    }
    const projectId = Number(input?.projectId);
    appTickets().moveTickets({
      projectId,
      ticketNumbers: Array.isArray(input?.ticketNumbers)
        ? input.ticketNumbers.map(Number)
        : [],
      status: input.status,
      before: input.before == null ? null : Number(input.before),
    });
    revalidatePath(projectPath(projectId));
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}

export type ArchiveTicketResult = ActionResult;

/**
 * Archives or restores a Ticket for the UI and refreshes its Board and
 * drawer. Domain errors come back as `error`, like `createTicket`.
 */
function setArchived(
  input: { number: number },
  archived: boolean,
): ArchiveTicketResult {
  return actionResult(() => {
    const tickets = appTickets();
    const number = Number(input?.number);
    const ticket = archived
      ? tickets.archiveTicket(number)
      : tickets.restoreTicket(number);
    revalidatePath(projectPath(ticket.projectId));
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}

/** Archives a Ticket for the UI; it can be restored (ADR 0003). */
export async function archiveTicket(input: {
  number: number;
}): Promise<ArchiveTicketResult> {
  return setArchived(input, true);
}

/** Restores an archived Ticket for the UI. */
export async function restoreTicket(input: {
  number: number;
}): Promise<ArchiveTicketResult> {
  return setArchived(input, false);
}

export type DeleteTicketResult = ActionResult;

/**
 * Deletes a Ticket for good as the User (ADR 0012) and refreshes its Boards.
 * The drawer it was deleted from then closes to its Board; a `?ticket=` for
 * a deleted Ticket shows the Board alone (ADR 0013). A refusal comes back
 * as `error`, like `createTicket`.
 */
export async function deleteTicket(input: {
  number: number;
  /** For an Epic: delete its children too, instead of detaching them. */
  withChildren?: boolean;
}): Promise<DeleteTicketResult> {
  return actionResult(() => {
    const tickets = appTickets();
    const number = Number(input?.number);
    const { projectId } = tickets.getTicket(number);
    tickets.deleteTicket(number, {
      withChildren: input?.withChildren === true,
    });
    revalidatePath(projectPath(projectId));
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}

export type TicketLabelResult = ActionResult;

/** Clears a Ticket claim as the User and refreshes its Board and drawer. */
export async function clearTicketClaim(input: {
  number: number;
}): Promise<ActionResult> {
  return actionResult(() => {
    const ticket = appTickets().clearTicketClaim(Number(input?.number));
    revalidatePath(projectPath(ticket.projectId));
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}

/**
 * Adds or removes one label for the UI and refreshes the Ticket's Board and
 * drawer. Domain errors come back as `error`, like `createTicket`.
 */
function changeLabel(
  input: { number: number; label: string },
  change: 'add' | 'remove',
): TicketLabelResult {
  return actionResult(() => {
    const tickets = appTickets();
    const number = Number(input?.number);
    const labels = [String(input?.label ?? '')];
    const ticket =
      change === 'add'
        ? tickets.addLabels(number, labels)
        : tickets.removeLabels(number, labels);
    revalidatePath(projectPath(ticket.projectId));
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}

/** Adds a label to a Ticket for the UI. */
export async function addTicketLabel(input: {
  number: number;
  label: string;
}): Promise<TicketLabelResult> {
  return changeLabel(input, 'add');
}

/** Removes a label from a Ticket for the UI. */
export async function removeTicketLabel(input: {
  number: number;
  label: string;
}): Promise<TicketLabelResult> {
  return changeLabel(input, 'remove');
}

export type TicketCommentResult = ActionResult;

/**
 * Runs a comment change written by the User and refreshes the Ticket's
 * drawer. Domain errors come back as `error`, like `createTicket`.
 */
function changeComment(change: () => void): TicketCommentResult {
  return actionResult(() => {
    change();
    revalidatePath(boardRoute, 'page');
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}

/** Adds the User's Markdown comment to a Ticket for the UI. */
export async function addTicketComment(input: {
  number: number;
  body: string;
}): Promise<TicketCommentResult> {
  return changeComment(() =>
    appTickets().addComment(Number(input?.number), {
      body: String(input?.body ?? ''),
      author: 'user',
    }),
  );
}

/** Edits any comment as the User, for the UI. */
export async function editTicketComment(input: {
  id: number;
  body: string;
}): Promise<TicketCommentResult> {
  return changeComment(() =>
    appTickets().editComment(Number(input?.id), {
      body: String(input?.body ?? ''),
      by: 'user',
    }),
  );
}

/** Deletes any comment for good as the User (ADR 0006), for the UI. */
export async function removeTicketComment(input: {
  id: number;
}): Promise<TicketCommentResult> {
  return changeComment(() =>
    appTickets().removeComment(Number(input?.id), { by: 'user' }),
  );
}

export type TicketBlockerResult = ActionResult;

/**
 * Adds or removes a Blocker for the UI and refreshes both Tickets' Boards
 * and drawers. Domain errors come back as `error`, like `createTicket`.
 */
function changeBlocker(
  input: BlockerInput,
  change: 'add' | 'remove',
): TicketBlockerResult {
  return actionResult(() => {
    const tickets = appTickets();
    const relationship = {
      blocker: Number(input?.blocker),
      blocked: Number(input?.blocked),
    };
    if (change === 'add') {
      tickets.addBlocker(relationship);
    } else {
      tickets.removeBlocker(relationship);
    }
    revalidatePath(boardRoute, 'page');
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}

/** Makes one Ticket a Blocker of another, for the UI. */
export async function addTicketBlocker(
  input: BlockerInput,
): Promise<TicketBlockerResult> {
  return changeBlocker(input, 'add');
}

/** Stops one Ticket blocking another, for the UI. */
export async function removeTicketBlocker(
  input: BlockerInput,
): Promise<TicketBlockerResult> {
  return changeBlocker(input, 'remove');
}

export type TicketAcceptanceCriteriaResult = ActionResult;

/**
 * Runs an acceptance-criteria change for the UI and refreshes the Ticket's
 * Board, whose cards show progress, and drawer. Domain errors come back as
 * `error`, like `createTicket`.
 */
function changeAcceptanceCriteria(
  change: () => Ticket,
): TicketAcceptanceCriteriaResult {
  return actionResult(() => {
    const ticket = change();
    revalidatePath(projectPath(ticket.projectId));
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}

/**
 * Replaces a Ticket's whole list of acceptance criteria, in order, for the
 * UI: add, edit, remove and reorder. A kept criterion is named by `id`; its
 * checked state stays unless its text changes, which unchecks it.
 */
export async function setTicketAcceptanceCriteria(input: {
  number: number;
  acceptanceCriteria: Omit<AcceptanceCriterionInput, 'checked'>[];
}): Promise<TicketAcceptanceCriteriaResult> {
  return changeAcceptanceCriteria(() => {
    if (!Array.isArray(input?.acceptanceCriteria)) {
      throw new ValidationError({
        acceptanceCriteria: 'Give the acceptance criteria as a list.',
      });
    }
    return appTickets().updateTicket(Number(input.number), {
      acceptanceCriteria: input.acceptanceCriteria.map((criterion) => ({
        ...(criterion?.id === undefined ? {} : { id: Number(criterion.id) }),
        text: String(criterion?.text ?? ''),
      })),
    });
  });
}

/** Checks or unchecks one of a Ticket's acceptance criteria for the UI. */
export async function checkTicketAcceptanceCriterion(input: {
  number: number;
  id: number;
  checked: boolean;
}): Promise<TicketAcceptanceCriteriaResult> {
  return changeAcceptanceCriteria(() =>
    appTickets().setAcceptanceCriteriaChecked(Number(input?.number), [
      { id: Number(input?.id), checked: Boolean(input?.checked) },
    ]),
  );
}

export type TicketEpicResult = ActionResult;

/**
 * Runs an Epic membership change for the UI and refreshes the Boards, whose
 * cards show it, and both drawers. Domain errors come back as `error`, like
 * `createTicket`.
 */
function changeEpic(change: () => void): TicketEpicResult {
  return actionResult(() => {
    change();
    revalidatePath(boardRoute, 'page');
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}

/**
 * Makes an existing Ticket a child of an Epic for the UI, taking it out of
 * the Epic it is in, if any.
 */
export async function attachTicketToEpic(
  input: EpicChildInput,
): Promise<TicketEpicResult> {
  return changeEpic(() =>
    appTickets().moveToEpic({
      epic: Number(input?.epic),
      child: Number(input?.child),
    }),
  );
}

/**
 * Makes several Tickets children of an Epic for the UI, taking each out of
 * the Epic it is in, if any; all or nothing.
 */
export async function moveTicketsToEpic(
  input: EpicChildrenInput,
): Promise<TicketEpicResult> {
  return changeEpic(() =>
    appTickets().moveTicketsToEpic({
      epic: Number(input?.epic),
      children: Array.isArray(input?.children)
        ? input.children.map(Number)
        : [],
    }),
  );
}

/** Takes a Ticket out of its Epic, for the UI. */
export async function detachTicketFromEpic(input: {
  number: number;
}): Promise<TicketEpicResult> {
  return changeEpic(() => appTickets().detachFromEpic(Number(input?.number)));
}

export type TicketOriginResult = ActionResult;

/**
 * Sets the Ticket a Ticket was split from, or clears it with `null`, for the
 * UI, and refreshes the Boards whose drawers show both sides. Domain errors
 * come back as `error`, like `createTicket`.
 */
export async function setTicketOrigin(input: {
  number: number;
  originNumber: number | null;
}): Promise<TicketOriginResult> {
  return actionResult(() => {
    appTickets().updateTicket(Number(input?.number), {
      originNumber:
        input?.originNumber === null ? null : Number(input?.originNumber),
    });
    revalidatePath(boardRoute, 'page');
    revalidatePath(cycleRoute, 'page');
    return {};
  });
}
