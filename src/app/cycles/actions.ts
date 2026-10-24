'use server';

import { revalidatePath } from 'next/cache';

import { appTickets } from '../../tickets/app-tickets';
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
