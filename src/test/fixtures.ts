import type { Conversation } from '../conversations/conversations';
import {
  agentStages,
  type ProjectAgentCommands,
} from '../tickets/agent-commands';
import type { EpicChild } from '../tickets/tickets';

const createdAt = new Date('2026-03-01T09:00:00Z');

/**
 * A Conversation for a test: an idle Start Conversation the User started,
 * with no defaults, worktree or cost, but for `overrides`. A new field on
 * `Conversation` gets its default here, once (T1188).
 */
export const aConversation = (
  overrides: Partial<Conversation> = {},
): Conversation => ({
  id: 1,
  projectId: 1,
  ticketNumber: null,
  intent: 'start',
  state: 'idle',
  startedBy: 'user',
  sdkSessionId: null,
  costUsd: 0,
  hidden: false,
  retroCycleId: null,
  defaultCycleId: null,
  defaultEpicNumber: null,
  defaultType: null,
  worktreePath: null,
  worktreeKept: null,
  worktreeRemoved: false,
  createdAt,
  updatedAt: createdAt,
  ...overrides,
});

const everyStage = <T>(value: T) =>
  Object.fromEntries(agentStages.map(({ field }) => [field, value])) as Record<
    keyof ProjectAgentCommands,
    T
  >;

/**
 * A Project's agent commands, every Stage's none but for `overrides`, so
 * every Stage sends the Playbook's command. Built from `agentStages`, so a
 * new Stage needs no change here.
 */
export const agentCommands = (
  overrides: Partial<ProjectAgentCommands> = {},
): ProjectAgentCommands => ({ ...everyStage(null), ...overrides });

/**
 * Agent commands as the form enters them, as `setProjectAgentCommands`
 * takes them: every Stage's blank but for `overrides`.
 */
export const agentCommandEntries = (
  overrides: Partial<Record<keyof ProjectAgentCommands, string>> = {},
): Record<keyof ProjectAgentCommands, string> => ({
  ...everyStage(''),
  ...overrides,
});

/**
 * A child as its Epic lists it: Todo, unblocked, not archived and with no
 * unchecked criteria, but for `overrides`. A new field on `EpicChild` gets
 * its default here, once (T1226).
 */
export const anEpicChild = (overrides: Partial<EpicChild> = {}): EpicChild => ({
  number: 1,
  title: `Child ${overrides.number ?? 1}`,
  status: 'Todo',
  archived: false,
  blockedBy: [],
  blocked: false,
  uncheckedCriteria: 0,
  ...overrides,
});
