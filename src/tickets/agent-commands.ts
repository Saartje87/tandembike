import { maxSkillLength } from './skills';
import type { TicketType } from './ticket-type';

/**
 * The commands a Project's Triage and Start buttons send as the first
 * message of a run, each `null` when it has none (T621, ADR 0019).
 */
export type ProjectAgentCommands = {
  triageCommand: string | null;
  startCommand: string | null;
  /** Start on an Epic; falls back to `startCommand` when `null`. */
  startEpicCommand: string | null;
};

/** The commands every Project starts with (T621). */
export const defaultAgentCommands = {
  triageCommand: '/mattpocock-skills:triage',
  startCommand: '/mattpocock-skills:implement',
  startEpicCommand: '/mattpocock-skills:implement-spec',
} satisfies ProjectAgentCommands;

/** No commands: Triage and Start send the plain `Triage T42` / `Start T42`. */
export const noAgentCommands: ProjectAgentCommands = {
  triageCommand: null,
  startCommand: null,
  startEpicCommand: null,
};

/** The buttons that send an agent command. */
export type AgentCommandIntent = 'triage' | 'start';

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
 * Project's command for it followed by `T<number>`, or the plain
 * `Triage T42` / `Start T42` when it has none. Start on an Epic uses the
 * Epic command, falling back to the Start command.
 */
export function agentCommandMessage(
  intent: AgentCommandIntent,
  ticket: { number: number; type: TicketType },
  commands: ProjectAgentCommands,
): string {
  const command =
    intent === 'triage'
      ? commands.triageCommand
      : ticket.type === 'Epic'
        ? (commands.startEpicCommand ?? commands.startCommand)
        : commands.startCommand;
  const fallback = intent === 'triage' ? 'Triage' : 'Start';
  return `${command ?? fallback} T${ticket.number}`;
}
