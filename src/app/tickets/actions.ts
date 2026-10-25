'use server';

import { revalidatePath } from 'next/cache';
import { RedirectType, redirect } from 'next/navigation';

import { appTickets } from '../../tickets/app-tickets';
import { openCycleOf } from '../../tickets/cycles';
import type { EpicChildInput } from '../../tickets/epics';
import { ValidationError } from '../../tickets/errors';
import { isStatus, statusRule } from '../../tickets/status';
import type { TicketType } from '../../tickets/ticket-type';
import type {
  AcceptanceCriterionInput,
  BlockerInput,
  ReorderTicketsInput,
  Ticket,
  UpdateTicketInput,
} from '../../tickets/tickets';
import { type ActionResult, actionResult } from '../lib/action-result';
import {
  boardRoute,
  cyclePath,
  cycleRoute,
  projectPath,
  ticketRoute,
} from '../lib/paths';

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
    // A child shows in its Epic's drawer.
    revalidatePath(ticketRoute, 'page');
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
    const { title, description, status, projectId } = input ?? {};
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
    });
    // A moved Ticket leaves one Board for another, and its drawer shows it.
    revalidatePath(boardRoute, 'page');
    revalidatePath(cycleRoute, 'page');
    revalidatePath(ticketRoute, 'page');
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
    revalidatePath(ticketRoute, 'page');
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
 * Deletes a Ticket for good as the User (ADR 0012) and sends them to the
 * Board it was on: its open Cycle's, or the Backlog, in place of the
 * Ticket's URL. Redirecting, rather than navigating once the result is back,
 * keeps the page from rendering the deleted Ticket first. A refusal comes
 * back as `error`, like `createTicket`.
 */
export async function deleteTicket(input: {
  number: number;
}): Promise<DeleteTicketResult> {
  const result = actionResult(() => {
    const tickets = appTickets();
    const number = Number(input?.number);
    const { projectId } = tickets.getTicket(number);
    const cycle = openCycleOf(tickets.listCycles(projectId), number);
    tickets.deleteTicket(number);
    revalidatePath(projectPath(projectId));
    revalidatePath(cycleRoute, 'page');
    revalidatePath(ticketRoute, 'page');
    return {
      boardPath: cycle
        ? cyclePath(projectId, cycle.id)
        : projectPath(projectId),
    };
  });
  if (result.ok) {
    // Replace the deleted Ticket's URL, so Back does not lead to it.
    redirect(result.boardPath, RedirectType.replace);
  }
  return result;
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
    revalidatePath(ticketRoute, 'page');
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
    revalidatePath(ticketRoute, 'page');
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
    revalidatePath(ticketRoute, 'page');
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
    revalidatePath(ticketRoute, 'page');
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
    revalidatePath(ticketRoute, 'page');
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
    revalidatePath(ticketRoute, 'page');
    return {};
  });
}

/** Makes an existing Ticket a child of an Epic, for the UI. */
export async function attachTicketToEpic(
  input: EpicChildInput,
): Promise<TicketEpicResult> {
  return changeEpic(() =>
    appTickets().attachToEpic({
      epic: Number(input?.epic),
      child: Number(input?.child),
    }),
  );
}

/** Takes a Ticket out of its Epic, for the UI. */
export async function detachTicketFromEpic(input: {
  number: number;
}): Promise<TicketEpicResult> {
  return changeEpic(() => appTickets().detachFromEpic(Number(input?.number)));
}
