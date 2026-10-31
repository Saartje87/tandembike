'use server';

import { revalidatePath } from 'next/cache';

import { appTickets } from '../../tickets/app-tickets';
import type {
  SetProjectAgentSettingsInput,
  StyleProjectInput,
} from '../../tickets/tickets';
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
 * Sets a Project's repository path, Parallel runs, max concurrent Start runs
 * and agent mode for the UI. Only a Server Action does this, never an MCP
 * tool (ADR 0019). Domain errors come back as `error`, with `fieldErrors`.
 */
export async function setProjectAgentSettings(
  input: { projectId: number } & SetProjectAgentSettingsInput,
): Promise<ActionResult> {
  return actionResult(() => {
    const { projectId, ...settings } = input ?? { projectId: Number.NaN };
    appTickets('user').setProjectAgentSettings(Number(projectId), {
      ...(settings.repositoryPath === undefined
        ? {}
        : { repositoryPath: settings.repositoryPath }),
      ...(settings.parallelRuns === undefined
        ? {}
        : { parallelRuns: Boolean(settings.parallelRuns) }),
      ...(settings.maxConcurrentRuns === undefined
        ? {}
        : { maxConcurrentRuns: Number(settings.maxConcurrentRuns) }),
      ...(settings.agentMode === undefined
        ? {}
        : { agentMode: Boolean(settings.agentMode) }),
    });
    revalidatePath(boardRoute, 'layout');
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

/**
 * Replaces a Project's Skills with the lines of the Settings textarea and
 * refreshes its pages; returns them as saved. A refusal names the `skills`
 * field.
 */
export async function setProjectSkills(input: {
  projectId: number;
  text: string;
}): Promise<ActionResult<{ skills: string[] }>> {
  return actionResult(() => {
    const skills = appTickets('user').setProjectSkills(
      Number(input?.projectId),
      String(input?.text ?? '').split('\n'),
    );
    revalidatePath(boardRoute, 'layout');
    return { skills };
  });
}

/**
 * The Skills a Conversation offers as chips: those of the Project, or of the
 * Ticket's Project. It only reads.
 */
export async function loadProjectSkills(input: {
  projectId?: number;
  ticketNumber?: number;
}): Promise<ActionResult<{ skills: string[] }>> {
  return actionResult(() => {
    const tickets = appTickets('user');
    const projectId =
      input?.ticketNumber === undefined
        ? Number(input?.projectId)
        : tickets.getTicket(Number(input.ticketNumber)).projectId;
    return { skills: tickets.getProjectSkills(projectId) };
  });
}
