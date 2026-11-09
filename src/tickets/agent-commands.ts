import { maxSkillLength } from './skills';
import type { TicketType } from './ticket-type';

/**
 * The commands a Project's Triage, Start and Retro buttons send as the
 * first message of a run, each `null` when it has none and the Playbook's command runs (T621, ADR 0032).
 */
export type ProjectAgentCommands = {
  triageCommand: string | null;
  startCommand: string | null;
  /** Start on an Epic; blank is the Playbook's, not `startCommand`. */
  startEpicCommand: string | null;
  /** Retro on a Cycle, sent with the Cycle's title and id (T1171). */
  retroCommand: string | null;
  /** Spec on a Ticket: turns an idea into an Epic of build Tickets (T1222). */
  specCommand: string | null;
};

/**
 * The Playbook: Tandembike's own plugin, loaded into every run (ADR 0032).
 * Its commands are always namespaced, so they never collide with a
 * repository's own skills or the User's plugins.
 */
export const playbookPluginName = 'tandembike';

/**
 * Every Stage of the flow that sends an agent command, in the order the
 * agent commands form shows them. One list drives which command a Stage
 * sends and the form's fields: a Stage is added here with one entry, its
 * `field` in `ProjectAgentCommands`, and its skill folder in `playbook/`.
 */
export const agentStages = [
  {
    stage: 'triage',
    field: 'triageCommand',
    skill: 'triage',
    label: 'Triage command',
  },
  {
    stage: 'start',
    field: 'startCommand',
    skill: 'implement',
    label: 'Start command',
  },
  {
    stage: 'startEpic',
    field: 'startEpicCommand',
    skill: 'implement-epic',
    label: 'Start command for Epics',
  },
  {
    stage: 'retro',
    field: 'retroCommand',
    skill: 'retro',
    label: 'Retro command',
  },
  {
    stage: 'spec',
    field: 'specCommand',
    skill: 'spec',
    label: 'Spec command',
  },
] as const satisfies readonly {
  stage: string;
  field: keyof ProjectAgentCommands;
  skill: string;
  label: string;
}[];

export type AgentStage = (typeof agentStages)[number]['stage'];

/** The Playbook's command for the skill of a Stage, `/tandembike:<skill>`. */
export const playbookCommand = (skill: string): string =>
  `/${playbookPluginName}:${skill}`;

/**
 * The command a Stage sends: the Project's own when it set one, otherwise
 * the Playbook's. Each Stage resolves on its own; a blank command for
 * Epics does not fall back to the Start command.
 */
export function commandForStage(
  stage: AgentStage,
  commands: ProjectAgentCommands,
): string {
  const entry = agentStages.find((candidate) => candidate.stage === stage);
  if (!entry) {
    throw new Error(`There is no Stage "${stage}".`);
  }
  return commands[entry.field] ?? playbookCommand(entry.skill);
}

/** No commands: every Stage sends the Playbook's command. */
export const noAgentCommands: ProjectAgentCommands = {
  triageCommand: null,
  startCommand: null,
  startEpicCommand: null,
  retroCommand: null,
  specCommand: null,
};

/** The buttons that send an agent command. */
export type AgentCommandIntent = 'triage' | 'start' | 'spec';

/**
 * `entry` as an agent command, by the rules of a Skill: trimmed, a missing
 * leading `/` added, and `null` when blank. Returns why it cannot be one.
 */
export function normalizeAgentCommand(
  entry: string,
): { command: string | null } | { problem: string } {
  const trimmed = entry.trim();
  if (trimmed === '') {
    return { command: null };
  }
  const command = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (/\s/.test(command)) {
    return { problem: `"${command}" has a space. Enter one command.` };
  }
  if (command.length > maxSkillLength) {
    return {
      problem: `"${command}" is longer than ${maxSkillLength} characters.`,
    };
  }
  return { command };
}

/**
 * `entries` as a Project's agent commands, each by `normalizeAgentCommand`.
 * Returns why they cannot be, keyed by the field of each one at fault.
 */
export function normalizeAgentCommands(
  entries: Record<keyof ProjectAgentCommands, string>,
): { commands: ProjectAgentCommands } | { problems: Record<string, string> } {
  const commands = { ...noAgentCommands };
  const problems: Record<string, string> = {};
  for (const field of Object.keys(noAgentCommands) as Array<
    keyof ProjectAgentCommands
  >) {
    const result = normalizeAgentCommand(String(entries[field] ?? ''));
    if ('problem' in result) {
      problems[field] = result.problem;
    } else {
      commands[field] = result.command;
    }
  }
  return Object.keys(problems).length > 0 ? { problems } : { commands };
}

/**
 * The first message Triage or Start sends about Ticket `number`: the
 * command of its Stage followed by `T<number>`, such as
 * `/tandembike:implement T42` when the Project set none. Start on an Epic
 * uses the Epic Stage.
 */
export function agentCommandMessage(
  intent: AgentCommandIntent,
  ticket: { number: number; type: TicketType },
  commands: ProjectAgentCommands,
): string {
  const stage: AgentStage =
    intent === 'triage'
      ? 'triage'
      : intent === 'spec'
        ? 'spec'
        : ticket.type === 'Epic'
          ? 'startEpic'
          : 'start';
  return `${commandForStage(stage, commands)} T${ticket.number}`;
}
