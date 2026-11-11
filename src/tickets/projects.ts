import { and, asc, eq, ne } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { projectAgentModels, projects } from '../db/schema';
import { detectRepository } from '../repository/detect-repository';
import {
  canonicalFolder,
  repositoryRootOf,
} from '../repository/repository-root';
import {
  noAgentCommands,
  normalizeAgentCommands,
  type ProjectAgentCommands,
} from './agent-commands';
import { agentKinds, isAgentKind } from './agent-kind';
import { agentRunModes } from './agent-run-mode';
import {
  agentCostUnits,
  type CeilingsByUnit,
  type CostUnit,
  ceilingsByUnit,
  costUnits,
} from './cost-unit';
import { NameTakenError, NotFoundError, ValidationError } from './errors';
import { isPaletteColor, paletteRule } from './palette';
import { isProjectIcon, projectIconRule } from './project-icons';
import type {
  ReferenceTemplate,
  ReferenceTemplateInput,
} from './reference-templates';
import { throwFieldErrors } from './rules';
import type { TicketRowContext } from './ticket-row-context';
import type {
  AgentModels,
  CreateProjectInput,
  Project,
  ProjectAgentSettings,
  ProjectRef,
  RenameProjectInput,
  SetProjectAgentSettingsInput,
  StyleProjectInput,
} from './tickets';
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const projectColumns = {
  id: projects.id,
  name: projects.name,
  color: projects.color,
  icon: projects.icon,
  archived: projects.archived,
  createdAt: projects.createdAt,
};

const agentCommandColumns = {
  triageCommand: projects.triageCommand,
  startCommand: projects.startCommand,
  startEpicCommand: projects.startEpicCommand,
  retroCommand: projects.retroCommand,
  mergeCommand: projects.mergeCommand,
  specCommand: projects.specCommand,
  planCommand: projects.planCommand,
  sparCommand: projects.sparCommand,
};

const agentSettingsColumns = {
  repositoryPath: projects.repositoryPath,
  checkCommand: projects.checkCommand,
  prepareCommand: projects.prepareCommand,
  parallelRuns: projects.parallelRuns,
  agentMode: projects.agentMode,
  runMode: projects.runMode,
  autopilot: projects.autopilot,
  spendCeilingUsd: projects.spendCeilingUsd,
  spendCeilingAiCredits: projects.spendCeilingAiCredits,
  autoTriage: projects.autoTriage,
  triageCeilingUsd: projects.triageCeilingUsd,
  triageCeilingAiCredits: projects.triageCeilingAiCredits,
  autoMerge: projects.autoMerge,
  defaultAgentKind: projects.defaultAgentKind,
};

/** A trimmed text setting; blank reads as not set. */
function trimmedOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** Why `runMode` is not an Agent run mode, or `undefined` when it is. */
function runModeProblem(
  runMode: SetProjectAgentSettingsInput['runMode'],
): string | undefined {
  return runMode === undefined || agentRunModes.includes(runMode)
    ? undefined
    : 'Choose default or auto.';
}

/** Why `kind` is not an Agent kind, or `undefined` when it is or is left out. */
function agentKindProblem(kind: unknown): string | undefined {
  return kind === undefined || isAgentKind(kind)
    ? undefined
    : 'Choose an Agent kind Tandembike knows.';
}

/** Why a model name is refused, or `undefined` when it can be stored. */
function runModelProblem(model: string | null): string | undefined {
  return model !== null && /\s/.test(model)
    ? 'Enter a model name without spaces.'
    : undefined;
}

/** Why a ceiling is not a positive amount in its unit, or `undefined`. */
function ceilingAmountProblem(
  ceiling: number | null,
  unit: CostUnit,
): string | undefined {
  return ceiling === null || (Number.isFinite(ceiling) && ceiling > 0)
    ? undefined
    : unit === 'usd'
      ? 'Enter an amount in dollars above 0.'
      : 'Enter an amount of AI credits above 0.';
}

/**
 * Why a ceiling setting and its switch disagree, by field: each amount must
 * be positive, and a switch that is on needs a ceiling in the unit of the
 * Project's default agent (ADR 0051). That need is checked only when the
 * call touches the switch or the ceiling, so changing the default agent is
 * never refused; Autopilot pauses for want of a ceiling instead.
 */
function ceilingProblems(input: {
  name: 'Spend' | 'Triage';
  switchName: 'Autopilot' | 'Auto-triage';
  fields: Record<CostUnit, string>;
  ceilings: CeilingsByUnit;
  on: boolean;
  touched: boolean;
  unit: CostUnit;
}): Record<string, string | undefined> {
  const problems: Record<string, string | undefined> = {};
  for (const unit of costUnits) {
    problems[input.fields[unit]] = ceilingAmountProblem(
      input.ceilings[unit],
      unit,
    );
  }
  if (input.on && input.touched && input.ceilings[input.unit] === null) {
    problems[input.fields[input.unit]] =
      input.unit === 'usd'
        ? `Set a ${input.name} ceiling before turning on ${input.switchName}.`
        : `Set a ${input.name} ceiling in AI credits before turning on ${input.switchName}.`;
  }
  return problems;
}

/**
 * Whether a run worktree can be made of the folder at `path`: a git
 * repository with a default branch to start from (ADR 0033).
 */
function canHoldWorktrees(path: string): boolean {
  const detection = detectRepository(path);
  return detection.ok && detection.defaultBranch !== null;
}

/** Why `path` cannot be a repository path, or `undefined` when it can. */
function repositoryPathProblem(path: string): string | undefined {
  if (!isAbsolute(path)) {
    return 'Enter an absolute path, starting with /.';
  }
  try {
    if (statSync(path).isDirectory()) {
      return undefined;
    }
  } catch {
    return 'There is no directory at this path.';
  }
  return 'This path is not a directory.';
}

/** The name of a Project other than `exceptId` that uses `path`, if any. */
function repositoryPathHolder(
  db: DatabaseConnection,
  path: string,
  exceptId?: number,
): string | undefined {
  const wanted = canonicalFolder(path);
  return db
    .select({
      id: projects.id,
      name: projects.name,
      repositoryPath: projects.repositoryPath,
    })
    .from(projects)
    .all()
    .find(
      (project) =>
        project.id !== exceptId &&
        project.repositoryPath !== null &&
        canonicalFolder(project.repositoryPath) === wanted,
    )?.name;
}

/** Why another Project's use of `path` refuses it, if one does. */
function repositoryPathTakenProblem(
  db: DatabaseConnection,
  path: string,
  exceptId?: number,
): string | undefined {
  const holder = repositoryPathHolder(db, path, exceptId);
  return holder === undefined
    ? undefined
    : `The Project "${holder}" already uses this repository. A repository belongs to one Project.`;
}

/**
 * The id of the Project `ref` names, or `undefined` when it names none.
 * Throws when the name is unknown or names another Project than the id.
 */
export function resolvedProjectId(
  db: DatabaseConnection,
  { projectId, projectName, cwd }: ProjectRef,
): number | undefined {
  if (projectName === undefined) {
    if (projectId === undefined && cwd !== undefined) {
      return projectIdOfFolder(db, cwd, true);
    }
    return projectId;
  }
  const name = projectName.trim();
  const named = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.nameKey, name.toLowerCase()))
    .get();
  if (!named) {
    const names = db
      .select({ name: projects.name })
      .from(projects)
      .orderBy(asc(projects.name))
      .all()
      .map(({ name }) => `"${name}"`);
    throw new NotFoundError(
      names.length === 0
        ? `There is no Project named "${name}", and there are no Projects yet.`
        : `There is no Project named "${name}". The Projects are: ${names.join(', ')}.`,
    );
  }
  if (projectId !== undefined && projectId !== named.id) {
    const project = db
      .select(projectColumns)
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
    if (!project) {
      throw new NotFoundError(`There is no Project with id ${projectId}.`);
    }
    throw new ValidationError({
      projectName: `Project ${projectId} is "${project.name}", not "${name}". Give projectId or projectName, or both for the same Project.`,
    });
  }
  return named.id;
}

/**
 * The id of the Project whose repository contains `folder`: the longest
 * repository path that is a prefix of the folder's repository wins, so a
 * nested repository belongs to its own Project. Throws when none contains it
 * (naming the Projects) or when two Projects tie.
 */
function projectIdOfFolder(
  db: DatabaseConnection,
  folder: string,
  refuseUnknown: true,
): number;
function projectIdOfFolder(
  db: DatabaseConnection,
  folder: string,
  refuseUnknown: false,
): number | undefined;
function projectIdOfFolder(
  db: DatabaseConnection,
  folder: string,
  refuseUnknown: boolean,
): number | undefined {
  const root = repositoryRootOf(folder) ?? canonicalFolder(folder);
  const candidates = db
    .select({
      id: projects.id,
      name: projects.name,
      repositoryPath: projects.repositoryPath,
      archived: projects.archived,
    })
    .from(projects)
    .orderBy(asc(projects.name))
    .all();
  let best: { id: number; name: string }[] = [];
  let bestLength = -1;
  for (const { id, name, repositoryPath } of candidates) {
    if (repositoryPath === null) {
      continue;
    }
    const path = canonicalFolder(repositoryPath);
    const contains =
      root === path || root.startsWith(`${path}/`) || path === '/';
    if (!contains || path.length < bestLength) {
      continue;
    }
    if (path.length > bestLength) {
      best = [];
      bestLength = path.length;
    }
    best.push({ id, name });
  }
  const [first, second] = best;
  if (first === undefined) {
    if (!refuseUnknown) {
      return undefined;
    }
    const names = candidates
      .filter(({ archived }) => !archived)
      .map(({ name }) => `"${name}"`);
    throw new ValidationError({
      cwd: `No Project has a repository containing ${folder}. ${
        names.length === 0
          ? 'There are no Projects yet.'
          : `Pass projectName: one of ${names.join(', ')}.`
      }`,
    });
  }
  if (second !== undefined) {
    throw new ValidationError({
      cwd: `The folder ${folder} is in the repository of both "${first.name}" and "${second.name}". Pass projectName.`,
    });
  }
  return first.id;
}

/**
 * Trims `rawName` and checks it is non-empty and not used by another Project
 * (ignoring case). `exceptId` is the Project being renamed, which may keep
 * its own name.
 */
function availableProjectName(
  db: DatabaseConnection,
  rawName: string,
  exceptId?: number,
) {
  const name = rawName.trim();
  if (name === '') {
    throw new ValidationError({ name: 'Enter a Project name.' });
  }

  const nameKey = name.toLowerCase();
  const taken = db
    .select({ name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.nameKey, nameKey),
        exceptId === undefined ? undefined : ne(projects.id, exceptId),
      ),
    )
    .get();
  if (taken) {
    throw new NameTakenError(taken.name);
  }
  return { name, nameKey };
}

/** The functions of the Projects area the others build on. */
export type ProjectsDeps = {
  addReferenceTemplate: (
    projectId: number,
    input: ReferenceTemplateInput,
  ) => ReferenceTemplate;
};

/**
 * The Projects area of the Tickets module: Projects, their folders, agent
 * settings and agent commands.
 */
export function createProjects(ctx: TicketRowContext, deps: ProjectsDeps) {
  const { db, changes, checkProjectWritable } = ctx;

  /** Project `id`'s settings for Agent runs. */
  function getProjectAgentSettings(id: number): ProjectAgentSettings {
    const settings = db
      .select(agentSettingsColumns)
      .from(projects)
      .where(eq(projects.id, id))
      .get();
    if (!settings) {
      throw new NotFoundError(`There is no Project with id ${id}.`);
    }
    const rows = db
      .select()
      .from(projectAgentModels)
      .where(eq(projectAgentModels.projectId, id))
      .all();
    const models = Object.fromEntries(
      agentKinds.map((kind) => {
        const row = rows.find(({ agentKind }) => agentKind === kind);
        return [
          kind,
          {
            runModel: row?.runModel ?? null,
            triageModel: row?.triageModel ?? null,
          },
        ];
      }),
    ) as AgentModels;
    return { ...settings, models };
  }

  /**
   * Sets Project `id`'s settings for Agent runs; fields left out stay as
   * they are. The repository path must be an existing absolute directory,
   * or `null` to clear it, which also turns agent mode off; agent mode
   * needs a path.
   */
  function setProjectAgentSettings(
    id: number,
    input: SetProjectAgentSettingsInput,
  ): ProjectAgentSettings {
    checkProjectWritable(id);
    const before = getProjectAgentSettings(id);
    const {
      repositoryPath,
      checkCommand,
      prepareCommand,
      parallelRuns,
      agentMode,
      runMode,
      models,
      autopilot,
      spendCeilingUsd,
      spendCeilingAiCredits,
      autoTriage,
      triageCeilingUsd,
      triageCeilingAiCredits,
      autoMerge,
      defaultAgentKind,
    } = input;
    const kept = <T>(given: T | undefined, was: T): T =>
      given === undefined ? was : given;
    const nextTriageCeiling = kept(triageCeilingUsd, before.triageCeilingUsd);
    const nextTriageCredits = kept(
      triageCeilingAiCredits,
      before.triageCeilingAiCredits,
    );
    const nextAutoTriage = autoTriage ?? before.autoTriage;
    const nextCeiling = kept(spendCeilingUsd, before.spendCeilingUsd);
    const nextCredits = kept(
      spendCeilingAiCredits,
      before.spendCeilingAiCredits,
    );
    const nextAutopilot = autopilot ?? before.autopilot;
    const nextUnit =
      agentCostUnits[
        isAgentKind(defaultAgentKind)
          ? defaultAgentKind
          : before.defaultAgentKind
      ];
    const nextModels = Object.fromEntries(
      agentKinds.map((kind) => {
        const given = models?.[kind] ?? {};
        const was = before.models[kind];
        return [
          kind,
          {
            runModel:
              given.runModel === undefined
                ? was.runModel
                : trimmedOrNull(given.runModel),
            triageModel:
              given.triageModel === undefined
                ? was.triageModel
                : trimmedOrNull(given.triageModel),
          },
        ];
      }),
    ) as AgentModels;
    const modelProblems = Object.fromEntries(
      agentKinds.flatMap((kind) =>
        (['runModel', 'triageModel'] as const).flatMap((field) =>
          models?.[kind]?.[field] === undefined
            ? []
            : [
                [
                  `models.${kind}.${field}`,
                  runModelProblem(nextModels[kind][field]),
                ],
              ],
        ),
      ),
    );
    const nextPath =
      repositoryPath === undefined
        ? before.repositoryPath
        : trimmedOrNull(repositoryPath);
    throwFieldErrors({
      repositoryPath:
        repositoryPath === undefined || nextPath === null
          ? undefined
          : (repositoryPathProblem(nextPath) ??
            repositoryPathTakenProblem(db, nextPath, id)),
      agentMode:
        agentMode === true && nextPath === null
          ? 'Set a repository path before turning on agent mode.'
          : undefined,
      runMode: runModeProblem(runMode),
      defaultAgentKind: agentKindProblem(defaultAgentKind),
      ...modelProblems,
      ...ceilingProblems({
        name: 'Spend',
        switchName: 'Autopilot',
        fields: {
          usd: 'spendCeilingUsd',
          ai_credits: 'spendCeilingAiCredits',
        },
        ceilings: ceilingsByUnit(nextCeiling, nextCredits),
        on: nextAutopilot,
        touched:
          autopilot !== undefined ||
          spendCeilingUsd !== undefined ||
          spendCeilingAiCredits !== undefined,
        unit: nextUnit,
      }),
      ...ceilingProblems({
        name: 'Triage',
        switchName: 'Auto-triage',
        fields: {
          usd: 'triageCeilingUsd',
          ai_credits: 'triageCeilingAiCredits',
        },
        ceilings: ceilingsByUnit(nextTriageCeiling, nextTriageCredits),
        on: nextAutoTriage,
        touched:
          autoTriage !== undefined ||
          triageCeilingUsd !== undefined ||
          triageCeilingAiCredits !== undefined,
        unit: nextUnit,
      }),
    });
    db.update(projects)
      .set({
        repositoryPath: nextPath,
        checkCommand:
          checkCommand === undefined
            ? before.checkCommand
            : trimmedOrNull(checkCommand),
        prepareCommand:
          prepareCommand === undefined
            ? before.prepareCommand
            : trimmedOrNull(prepareCommand),
        ...(parallelRuns === undefined ? {} : { parallelRuns }),
        agentMode: nextPath === null ? false : (agentMode ?? before.agentMode),
        ...(runMode === undefined ? {} : { runMode }),
        autopilot: nextAutopilot,
        spendCeilingUsd: nextCeiling,
        spendCeilingAiCredits: nextCredits,
        autoTriage: nextAutoTriage,
        triageCeilingUsd: nextTriageCeiling,
        triageCeilingAiCredits: nextTriageCredits,
        ...(autoMerge === undefined ? {} : { autoMerge }),
        ...(defaultAgentKind === undefined ? {} : { defaultAgentKind }),
      })
      .where(eq(projects.id, id))
      .run();
    for (const kind of agentKinds) {
      if (models?.[kind] === undefined) continue;
      db.insert(projectAgentModels)
        .values({ projectId: id, agentKind: kind, ...nextModels[kind] })
        .onConflictDoUpdate({
          target: [projectAgentModels.projectId, projectAgentModels.agentKind],
          set: nextModels[kind],
        })
        .run();
    }
    changes.publish({ type: 'project', id });
    return getProjectAgentSettings(id);
  }

  /** Sets Project `id`'s archived flag, announcing it only when it changed. */
  function setProjectArchived(id: number, archived: boolean): Project {
    const changed = db
      .update(projects)
      .set({ archived })
      .where(and(eq(projects.id, id), ne(projects.archived, archived)))
      .returning({ id: projects.id })
      .get();
    const project = db
      .select(projectColumns)
      .from(projects)
      .where(eq(projects.id, id))
      .get();
    if (!project) {
      throw new NotFoundError(`There is no Project with id ${id}.`);
    }
    if (changed) {
      changes.publish({ type: 'project', id });
    }
    return project;
  }

  return {
    /** All Projects, oldest first. */
    listProjects(): Project[] {
      return db
        .select(projectColumns)
        .from(projects)
        .orderBy(asc(projects.id))
        .all();
    },

    getProject(id: number): Project {
      const project = db
        .select(projectColumns)
        .from(projects)
        .where(eq(projects.id, id))
        .get();
      if (!project) {
        throw new NotFoundError(`There is no Project with id ${id}.`);
      }
      return project;
    },

    /**
     * The id of the Project `ref` names. An unknown name is refused with the
     * names of the existing Projects, so a stale one is caught at once.
     */
    resolveProjectId(ref: ProjectRef): number {
      const projectId = resolvedProjectId(db, ref);
      if (projectId === undefined) {
        throw new ValidationError({
          projectId: 'Choose a Project by projectId or projectName.',
        });
      }
      return projectId;
    },

    /**
     * The id of the Project whose repository contains `folder`, or
     * `undefined` when none does. Two Projects that tie are still refused.
     */
    findProjectIdOfFolder(folder: string): number | undefined {
      return projectIdOfFolder(db, folder, false);
    },

    /** Creates a Project with a trimmed name, unique ignoring case. */
    createProject(input: CreateProjectInput): Project {
      const { name, nameKey } = availableProjectName(db, input.name);
      const { repositoryPath, checkCommand, referenceTemplate } = input;
      // The Project and its repository settings are saved all or nothing.
      const project = db.transaction(() => {
        const created = db
          .insert(projects)
          .values({
            name,
            nameKey,
            createdAt: new Date(),
            // New Projects run the Playbook's commands, in `auto` mode
            // (T1218); the column defaults are the old ones, kept for the
            // Projects already stored.
            ...noAgentCommands,
            runMode: 'auto',
          })
          .returning(projectColumns)
          .get();
        const folder = trimmedOrNull(repositoryPath ?? null);
        if (repositoryPath !== undefined || checkCommand !== undefined) {
          setProjectAgentSettings(created.id, {
            ...(repositoryPath === undefined ? {} : { repositoryPath }),
            ...(checkCommand === undefined ? {} : { checkCommand }),
            // A Project created with a folder works hands-off from its first
            // Start (T1228, ADR 0029): agent mode on, and Parallel runs on
            // when the folder can give each Start run a worktree (ADR 0033).
            ...(folder === null
              ? {}
              : { agentMode: true, parallelRuns: canHoldWorktrees(folder) }),
          });
        }
        if (referenceTemplate !== undefined) {
          deps.addReferenceTemplate(created.id, referenceTemplate);
        }
        return created;
      });
      changes.publish({ type: 'project', id: project.id });
      return project;
    },

    /**
     * Renames a Project by the same rules as creating one. Changing only the
     * casing of its own name is allowed.
     */
    renameProject(id: number, input: RenameProjectInput): Project {
      checkProjectWritable(id);
      const { name, nameKey } = availableProjectName(db, input.name, id);
      const project = db
        .update(projects)
        .set({ name, nameKey })
        .where(eq(projects.id, id))
        .returning(projectColumns)
        .get();
      if (!project) {
        throw new NotFoundError(`There is no Project with id ${id}.`);
      }
      changes.publish({ type: 'project', id });
      return project;
    },

    /**
     * Sets a Project's colour and/or icon from the fixed sets, or clears one
     * with `null`; fields left out stay as they are.
     */
    styleProject(id: number, input: StyleProjectInput): Project {
      checkProjectWritable(id);
      const { color, icon } = input;
      throwFieldErrors({
        color:
          color === undefined || color === null || isPaletteColor(color)
            ? undefined
            : paletteRule,
        icon:
          icon === undefined || icon === null || isProjectIcon(icon)
            ? undefined
            : projectIconRule,
      });
      const values = {
        ...(color === undefined ? {} : { color }),
        ...(icon === undefined ? {} : { icon }),
      };
      const project =
        Object.keys(values).length === 0
          ? db
              .select(projectColumns)
              .from(projects)
              .where(eq(projects.id, id))
              .get()
          : db
              .update(projects)
              .set(values)
              .where(eq(projects.id, id))
              .returning(projectColumns)
              .get();
      if (!project) {
        throw new NotFoundError(`There is no Project with id ${id}.`);
      }
      changes.publish({ type: 'project', id });
      return project;
    },

    getProjectAgentSettings,

    setProjectAgentSettings,

    /**
     * Project `id`'s agent commands: what its Triage, Start and Retro buttons
     * send before the Ticket number. Like the agent settings, only the User
     * sets them.
     */
    getProjectAgentCommands(id: number): ProjectAgentCommands {
      const commands = db
        .select(agentCommandColumns)
        .from(projects)
        .where(eq(projects.id, id))
        .get();
      if (!commands) {
        throw new NotFoundError(`There is no Project with id ${id}.`);
      }
      return commands;
    },

    /**
     * Replaces Project `id`'s agent commands, each trimmed, a missing leading
     * `/` added and blank stored as none. One with a space or over 100
     * characters is refused under its field name, and nothing changes.
     */
    setProjectAgentCommands(
      id: number,
      input: Record<keyof ProjectAgentCommands, string>,
    ): ProjectAgentCommands {
      checkProjectWritable(id);
      const result = normalizeAgentCommands(input);
      if ('problems' in result) {
        throw new ValidationError(result.problems);
      }
      const saved = db
        .update(projects)
        .set(result.commands)
        .where(eq(projects.id, id))
        .returning(agentCommandColumns)
        .get();
      changes.publish({ type: 'project', id });
      return saved;
    },

    /**
     * Archives Project `id`: it and its Tickets leave the normal views and
     * become read-only, but nothing is lost and its name stays reserved.
     * Its Tickets are not changed. Archiving it again changes nothing.
     */
    archiveProject(id: number): Project {
      return setProjectArchived(id, true);
    },

    /** Brings archived Project `id` back, its Tickets exactly as they were. */
    restoreProject(id: number): Project {
      return setProjectArchived(id, false);
    },
  };
}
