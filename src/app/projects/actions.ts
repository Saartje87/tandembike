'use server';

import { revalidatePath } from 'next/cache';

import { appTickets } from '../../tickets/app-tickets';
import { type ActionResult, actionResult } from '../lib/action-result';

export type CreateProjectResult = ActionResult<{ projectId: number }>;

/**
 * Creates a Project for the UI. Domain errors come back as `error` so the
 * form can show the module's message; anything else is a bug and throws.
 */
export async function createProject(input: {
  name: string;
}): Promise<CreateProjectResult> {
  return actionResult(() => {
    const project = appTickets().createProject({
      name: String(input?.name ?? ''),
    });
    revalidatePath('/', 'layout');
    return { projectId: project.id };
  });
}

export type RenameProjectResult = ActionResult<{ name: string }>;

/** Renames a Project for the UI, returning domain errors as `error`. */
export async function renameProject(input: {
  projectId: number;
  name: string;
}): Promise<RenameProjectResult> {
  return actionResult(() => {
    const project = appTickets().renameProject(Number(input?.projectId), {
      name: String(input?.name ?? ''),
    });
    revalidatePath('/', 'layout');
    return { name: project.name };
  });
}
