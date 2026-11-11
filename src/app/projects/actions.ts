'use server';

import {
  detectRepository,
  type RepositoryDetection,
} from '../../repository/detect-repository';
import type { ProjectAgentCommands } from '../../tickets/agent-commands';
import { agentKinds } from '../../tickets/agent-kind';
import type {
  SetProjectAgentSettingsInput,
  StyleProjectInput,
} from '../../tickets/tickets';
import type { ActionResult } from '../lib/action-result';
import { userAction } from '../lib/user-action';

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
  return userAction((tickets) => {
    const project = tickets.createProject({
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
  return userAction((tickets) => {
    tickets.archiveProject(Number(input?.projectId));
    return {};
  });
}

/** Restores an archived Project for the UI, returning domain errors. */
export async function restoreProject(input: {
  projectId: number;
}): Promise<ActionResult> {
  return userAction((tickets) => {
    tickets.restoreProject(Number(input?.projectId));
    return {};
  });
}

export type RenameProjectResult = ActionResult<{ name: string }>;

/** Renames a Project for the UI, returning domain errors as `error`. */
export async function renameProject(input: {
  projectId: number;
  name: string;
}): Promise<RenameProjectResult> {
  return userAction((tickets) => {
    const project = tickets.renameProject(Number(input?.projectId), {
      name: String(input?.name ?? ''),
    });
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
  return userAction((tickets) => {
    tickets.styleProject(Number(input?.projectId), {
      ...(input?.color === undefined ? {} : { color: input.color }),
      ...(input?.icon === undefined ? {} : { icon: input.icon }),
    });
    return {};
  });
}

/** A model from the browser: left out, cleared, or its text. */
const modelText = (value: unknown): string | null | undefined =>
  value === undefined ? undefined : value === null ? null : String(value);

/** Models from the browser, by known Agent kind (ADR 0051). */
function agentModelsInput(
  models: NonNullable<SetProjectAgentSettingsInput['models']>,
): NonNullable<SetProjectAgentSettingsInput['models']> {
  return Object.fromEntries(
    agentKinds.flatMap((kind) => {
      const given = models?.[kind];
      if (given === undefined) {
        return [];
      }
      const runModel = modelText(given.runModel);
      const triageModel = modelText(given.triageModel);
      return [
        [
          kind,
          {
            ...(runModel === undefined ? {} : { runModel }),
            ...(triageModel === undefined ? {} : { triageModel }),
          },
        ],
      ];
    }),
  );
}

/** A ceiling field as a number or null, or nothing when it was left out. */
function nullableNumber<Field extends string>(
  field: Field,
  value: number | null | undefined,
): { [Key in Field]?: number | null } {
  return value === undefined
    ? {}
    : ({ [field]: value === null ? null : Number(value) } as {
        [Key in Field]?: number | null;
      });
}

/**
 * Sets a Project's repository path, Parallel runs, default Agent kind, agent
 * mode, run mode and run model for the UI. Only a Server Action does this, never an MCP tool
 * (ADR 0019). Domain errors come back as `error`, with `fieldErrors`.
 */
export async function setProjectAgentSettings(
  input: { projectId: number } & SetProjectAgentSettingsInput,
): Promise<ActionResult> {
  return userAction((tickets) => {
    const { projectId, ...settings } = input ?? { projectId: Number.NaN };
    tickets.setProjectAgentSettings(Number(projectId), {
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
      ...(settings.models === undefined
        ? {}
        : { models: agentModelsInput(settings.models) }),
      ...(settings.autopilot === undefined
        ? {}
        : { autopilot: Boolean(settings.autopilot) }),
      ...nullableNumber('spendCeilingUsd', settings.spendCeilingUsd),
      ...nullableNumber(
        'spendCeilingAiCredits',
        settings.spendCeilingAiCredits,
      ),
      ...(settings.autoTriage === undefined
        ? {}
        : { autoTriage: Boolean(settings.autoTriage) }),
      ...(settings.autoMerge === undefined
        ? {}
        : { autoMerge: Boolean(settings.autoMerge) }),
      ...(settings.defaultAgentKind === undefined
        ? {}
        : { defaultAgentKind: settings.defaultAgentKind }),
      ...nullableNumber('triageCeilingUsd', settings.triageCeilingUsd),
      ...nullableNumber(
        'triageCeilingAiCredits',
        settings.triageCeilingAiCredits,
      ),
    });
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
  return userAction((tickets) => {
    tickets.addReferenceTemplate(Number(input?.projectId), {
      prefix: String(input?.prefix ?? ''),
      url: String(input?.url ?? ''),
    });
    return {};
  });
}

/** Edits a Reference template for the UI, by the rules of adding one. */
export async function updateReferenceTemplate(input: {
  id: number;
  prefix: string;
  url: string;
}): Promise<ActionResult> {
  return userAction((tickets) => {
    tickets.updateReferenceTemplate(Number(input?.id), {
      prefix: String(input?.prefix ?? ''),
      url: String(input?.url ?? ''),
    });
    return {};
  });
}

/** Removes a Reference template for the UI, returning domain errors. */
export async function removeReferenceTemplate(input: {
  id: number;
}): Promise<ActionResult> {
  return userAction((tickets) => {
    tickets.removeReferenceTemplate(Number(input?.id));
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
  return userAction((tickets) => {
    const commands = tickets.setProjectAgentCommands(Number(input?.projectId), {
      triageCommand: String(input?.triageCommand ?? ''),
      startCommand: String(input?.startCommand ?? ''),
      startEpicCommand: String(input?.startEpicCommand ?? ''),
      retroCommand: String(input?.retroCommand ?? ''),
      mergeCommand: String(input?.mergeCommand ?? ''),
      specCommand: String(input?.specCommand ?? ''),
      planCommand: String(input?.planCommand ?? ''),
      sparCommand: String(input?.sparCommand ?? ''),
    });
    return { commands };
  });
}
