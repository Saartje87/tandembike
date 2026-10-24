import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { appTickets } from '../../../tickets/app-tickets';
import { NotFoundError } from '../../../tickets/errors';

export type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export type CyclePageProps = {
  params: Promise<{ id: string; cycleId: string }>;
};

/** `run()`, or the not-found page when it throws a `NotFoundError`. */
function orNotFound<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
}

/** The Project for the `[id]` segment, or the not-found page. */
export async function loadProject(params: ProjectPageProps['params']) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) {
    notFound();
  }
  return orNotFound(() => appTickets().getProject(id));
}

/**
 * The Project and Cycle for the `[id]` and `[cycleId]` segments, or the
 * not-found page when either is missing or the Cycle is another Project's.
 */
export async function loadProjectCycle(params: CyclePageProps['params']) {
  const project = await loadProject(params);
  const cycleId = Number((await params).cycleId);
  if (!Number.isSafeInteger(cycleId)) {
    notFound();
  }
  const cycle = orNotFound(() => appTickets().getCycle(cycleId));
  if (cycle.projectId !== project.id) {
    notFound();
  }
  return { project, cycle };
}
