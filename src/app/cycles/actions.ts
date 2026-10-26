'use server';

import { revalidatePath } from 'next/cache';

import { appTickets } from '../../tickets/app-tickets';
import type { BatchFailure } from '../../tickets/errors';
import { type ActionResult, actionResult } from '../lib/action-result';
import { boardRoute } from '../lib/paths';

/** Every page of every Project shows its Cycle tabs, so refresh them all. */
function revalidateProjects() {
  revalidatePath(boardRoute, 'layout');
}

export type CreateCycleResult = ActionResult<{ cycleId: number }>;

/**
 * Creates a Prepared Cycle for the UI. Domain errors come back as `error`
 * (with `fieldErrors` for a validation failure); anything else throws.
 */
export async function createCycle(input: {
  projectId: number;
  title: string;
}): Promise<CreateCycleResult> {
  return actionResult(() => {
    const cycle = appTickets().createCycle({
      projectId: Number(input?.projectId),
      title: String(input?.title ?? ''),
    });
    revalidateProjects();
    return { cycleId: cycle.id };
  });
}

/** Renames a Cycle for the UI, returning domain errors as `error`. */
export async function renameCycle(input: {
  cycleId: number;
  title: string;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets().renameCycle(Number(input?.cycleId), {
      title: String(input?.title ?? ''),
    });
    revalidateProjects();
    return {};
  });
}

/** Discards a Prepared Cycle for the UI, returning domain errors as `error`. */
export async function discardCycle(input: {
  cycleId: number;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets().discardCycle(Number(input?.cycleId));
    revalidateProjects();
    return {};
  });
}

/** Plans a Ticket into a Cycle for the UI, returning domain errors as `error`. */
export async function planTicket(input: {
  cycleId: number;
  number: number;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets().planTicket({
      cycleId: Number(input?.cycleId),
      number: Number(input?.number),
    });
    revalidateProjects();
    return {};
  });
}

/** Takes a Ticket out of a Cycle for the UI, returning domain errors as `error`. */
export async function unplanTicket(input: {
  cycleId: number;
  number: number;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets().unplanTicket({
      cycleId: Number(input?.cycleId),
      number: Number(input?.number),
    });
    revalidateProjects();
    return {};
  });
}

export type CycleTicketsActionResult = ActionResult<{
  /** The Tickets left as they were, each with the reason. */
  failed: BatchFailure[];
}>;

type CycleTicketsActionInput = { cycleId: number; ticketNumbers: number[] };

/** The batch input as the Tickets module takes it. */
function cycleTicketsInput(input: CycleTicketsActionInput) {
  return {
    cycleId: Number(input?.cycleId),
    ticketNumbers: Array.isArray(input?.ticketNumbers)
      ? input.ticketNumbers.map(Number)
      : [],
  };
}

/**
 * Plans a selection of Tickets into a Cycle for the UI. Each Ticket that
 * cannot be planned comes back in `failed` and the others are still planned;
 * a refused batch as a whole comes back as `error`.
 */
export async function planTickets(
  input: CycleTicketsActionInput,
): Promise<CycleTicketsActionResult> {
  return actionResult(() => {
    const { failed } = appTickets().planTickets(cycleTicketsInput(input));
    revalidateProjects();
    return { failed };
  });
}

/**
 * Takes a selection of Tickets out of a Cycle, back to the Backlog, for the
 * UI, reporting the ones it cannot as `planTickets` does.
 */
export async function unplanTickets(
  input: CycleTicketsActionInput,
): Promise<CycleTicketsActionResult> {
  return actionResult(() => {
    const { failed } = appTickets().unplanTickets(cycleTicketsInput(input));
    revalidateProjects();
    return { failed };
  });
}

/**
 * Starts a Prepared Cycle for the UI; `archiveActive` is the User's
 * confirmation to archive the Active Cycle `activeCycleId` and roll its open
 * Tickets over.
 * Domain errors come back as `error`.
 */
export async function startCycle(input: {
  cycleId: number;
  archiveActive?: boolean;
  /** The Active Cycle the User confirmed archiving. */
  activeCycleId?: number;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets().startCycle(Number(input?.cycleId), {
      archiveActive: input?.archiveActive === true,
      ...(input?.activeCycleId === undefined
        ? {}
        : { activeCycleId: Number(input.activeCycleId) }),
    });
    revalidateProjects();
    return {};
  });
}

/** Archives an Active Cycle for the UI, returning domain errors as `error`. */
export async function archiveCycle(input: {
  cycleId: number;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets().archiveCycle(Number(input?.cycleId));
    revalidateProjects();
    return {};
  });
}
