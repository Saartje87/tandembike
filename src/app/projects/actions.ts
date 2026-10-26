'use server';

import { revalidatePath } from 'next/cache';

import { appTickets } from '../../tickets/app-tickets';
import type { StyleProjectInput } from '../../tickets/tickets';
import { type ActionResult, actionResult } from '../lib/action-result';
import { boardRoute } from '../lib/paths';

export type CreateProjectResult = ActionResult<{ projectId: number }>;

/**
 * Creates a Project for the UI. Domain errors come back as `error` so the
 * form can show the module's message; anything else is a bug and throws.
 */
export async function createProject(input: {
  name: string;
}): Promise<CreateProjectResult> {
  return actionResult(() => {
    const project = appTickets('user').createProject({
      name: String(input?.name ?? ''),
    });
    revalidatePath('/', 'layout');
    return { projectId: project.id };
  });
}

/**
 * Archives a Project for the UI: it and its Tickets leave every view and
 * become read-only until restored. Domain errors come back as `error`.
 */
export async function archiveProject(input: {
  projectId: number;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets('user').archiveProject(Number(input?.projectId));
    revalidatePath('/', 'layout');
    return {};
  });
}

/** Restores an archived Project for the UI, returning domain errors. */
export async function restoreProject(input: {
  projectId: number;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets('user').restoreProject(Number(input?.projectId));
    revalidatePath('/', 'layout');
    return {};
  });
}

export type RenameProjectResult = ActionResult<{ name: string }>;

/** Renames a Project for the UI, returning domain errors as `error`. */
export async function renameProject(input: {
  projectId: number;
  name: string;
}): Promise<RenameProjectResult> {
  return actionResult(() => {
    const project = appTickets('user').renameProject(Number(input?.projectId), {
      name: String(input?.name ?? ''),
    });
    revalidatePath('/', 'layout');
    return { name: project.name };
  });
}

/**
 * Sets a Project's colour and/or icon for the UI, or clears one with
 * `null`, and refreshes every page that shows the Project. Domain errors
 * come back as `error`.
 */
export async function styleProject(
  input: { projectId: number } & StyleProjectInput,
): Promise<ActionResult> {
  return actionResult(() => {
    appTickets('user').styleProject(Number(input?.projectId), {
      ...(input?.color === undefined ? {} : { color: input.color }),
      ...(input?.icon === undefined ? {} : { icon: input.icon }),
    });
    revalidatePath('/', 'layout');
    return {};
  });
}

/**
 * Adds a Reference template to a Project for the UI and refreshes every page
 * of the Project, so its keys link at once. Domain errors come back as
 * `error`, with `fieldErrors` naming `prefix` or `url`.
 */
export async function addReferenceTemplate(input: {
  projectId: number;
  prefix: string;
  url: string;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets('user').addReferenceTemplate(Number(input?.projectId), {
      prefix: String(input?.prefix ?? ''),
      url: String(input?.url ?? ''),
    });
    revalidatePath(boardRoute, 'layout');
    return {};
  });
}

/** Edits a Reference template for the UI, by the rules of adding one. */
export async function updateReferenceTemplate(input: {
  id: number;
  prefix: string;
  url: string;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets('user').updateReferenceTemplate(Number(input?.id), {
      prefix: String(input?.prefix ?? ''),
      url: String(input?.url ?? ''),
    });
    revalidatePath(boardRoute, 'layout');
    return {};
  });
}

/** Removes a Reference template for the UI, returning domain errors. */
export async function removeReferenceTemplate(input: {
  id: number;
}): Promise<ActionResult> {
  return actionResult(() => {
    appTickets('user').removeReferenceTemplate(Number(input?.id));
    revalidatePath(boardRoute, 'layout');
    return {};
  });
}
