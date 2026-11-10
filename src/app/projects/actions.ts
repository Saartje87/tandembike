'use server';

import { revalidatePath } from 'next/cache';

import {
  detectRepository,
  type RepositoryDetection,
} from '../../repository/detect-repository';
import type { ProjectAgentCommands } from '../../tickets/agent-commands';
import { appTickets } from '../../tickets/app-tickets';
import type {
  SetProjectAgentSettingsInput,
  StyleProjectInput,
} from '../../tickets/tickets';
import { type ActionResult, actionResult } from '../lib/action-result';
import { boardRoute } from '../lib/paths';

export type CreateProjectResult = ActionResult<{ projectId: number }>;

/** A setting that may be cleared: left out when undefined, null stays null, anything else is a string. */
const nullableString = <Key extends string>(
  key: Key,
  value: string | null | undefined,
): { [K in Key]?: string | null } =>
  value === undefined
    ? {}
    : ({ [key]: value === null ? null : String(value) } as {
        [K in Key]?: string | null;
      });

/**
 * Creates a Project for the UI. Domain errors come back as `error` so the
 * form can show the module's message; anything else is a bug and throws.
 */
export async function createProject(input: {
  name: string;
  /** The repository folder, with what the User accepted of its detection. */
  repositoryPath?: string;
  checkCommand?: string | null;
  referenceTemplate?: { prefix: string; url: string };
}): Promise<CreateProjectResult> {
  return actionResult(() => {
    const project = appTickets('user').createProject({
      name: String(input?.name ?? ''),
      ...(input?.repositoryPath === undefined
        ? {}
        : { repositoryPath: String(input.repositoryPath) }),
      ...nullableString('checkCommand', input?.checkCommand),
      ...(input?.referenceTemplate === undefined
        ? {}
        : {
            referenceTemplate: {
              prefix: String(input.referenceTemplate.prefix ?? ''),
              url: String(input.referenceTemplate.url ?? ''),
            },
          }),
    });
    revalidatePath('/', 'layout');
    return { projectId: project.id };
  });
}

export type DetectedRepository = Extract<RepositoryDetection, { ok: true }>;

/**
 * What the folder at `path` is: a git repository with its default branch,
 * origin remote and Check command candidates, or a refusal naming why not.
 * It only reads files, and changes nothing.
 */
export async function detectProjectRepository(input: {
  path: string;
}): Promise<ActionResult<{ repository: DetectedRepository }>> {
  const detection = detectRepository(String(input?.path ?? '').trim());
  return detection.ok
    ? { ok: true, repository: detection }
    : { ok: false, error: detection.message };
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
 * Sets a Project's repository path, Parallel runs, agent mode, run mode and
 * run model for the UI. Only a Server Action does this, never an MCP tool
 * (ADR 0019). Domain errors come back as `error`, with `fieldErrors`.
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
      ...nullableString('checkCommand', settings.checkCommand),
      ...nullableString('prepareCommand', settings.prepareCommand),
      ...(settings.parallelRuns === undefined
        ? {}
        : { parallelRuns: Boolean(settings.parallelRuns) }),
      ...(settings.agentMode === undefined
        ? {}
        : { agentMode: Boolean(settings.agentMode) }),
      ...(settings.runMode === undefined ? {} : { runMode: settings.runMode }),
      ...(settings.runModel === undefined
        ? {}
        : {
            runModel:
              settings.runModel === null ? null : String(settings.runModel),
          }),
      ...(settings.triageModel === undefined
        ? {}
        : {
            triageModel:
              settings.triageModel === null
                ? null
                : String(settings.triageModel),
          }),
      ...(settings.autopilot === undefined
        ? {}
        : { autopilot: Boolean(settings.autopilot) }),
      ...(settings.spendCeilingUsd === undefined
        ? {}
        : {
            spendCeilingUsd:
              settings.spendCeilingUsd === null
                ? null
                : Number(settings.spendCeilingUsd),
          }),
      ...(settings.autoTriage === undefined
        ? {}
        : { autoTriage: Boolean(settings.autoTriage) }),
      ...(settings.autoMerge === undefined
        ? {}
        : { autoMerge: Boolean(settings.autoMerge) }),
      ...(settings.triageCeilingUsd === undefined
        ? {}
        : {
            triageCeilingUsd:
              settings.triageCeilingUsd === null
                ? null
                : Number(settings.triageCeilingUsd),
          }),
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
 * Replaces a Project's agent commands, the ones its Triage and Start buttons
 * send, and refreshes its pages; returns them as saved. A refusal names the
 * field at fault: `triageCommand`, `startCommand`, `startEpicCommand` or
 * `retroCommand`, `mergeCommand`, `specCommand`, `planCommand` or
 * `sparCommand`.
 */
export async function setProjectAgentCommands(input: {
  projectId: number;
  triageCommand: string;
  startCommand: string;
  startEpicCommand: string;
  retroCommand: string;
  mergeCommand: string;
  specCommand: string;
  planCommand: string;
  sparCommand: string;
}): Promise<ActionResult<{ commands: ProjectAgentCommands }>> {
  return actionResult(() => {
    const commands = appTickets('user').setProjectAgentCommands(
      Number(input?.projectId),
      {
        triageCommand: String(input?.triageCommand ?? ''),
        startCommand: String(input?.startCommand ?? ''),
        startEpicCommand: String(input?.startEpicCommand ?? ''),
        retroCommand: String(input?.retroCommand ?? ''),
        mergeCommand: String(input?.mergeCommand ?? ''),
        specCommand: String(input?.specCommand ?? ''),
        planCommand: String(input?.planCommand ?? ''),
        sparCommand: String(input?.sparCommand ?? ''),
      },
    );
    revalidatePath(boardRoute, 'layout');
    return { commands };
  });
}
