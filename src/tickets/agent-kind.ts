/**
 * The agents Tandembike can start a run on (ADR 0051): a fixed list in code.
 * Each Conversation runs on one for life; each Project has a default.
 */
export const agentKinds = ['claude-code', 'copilot'] as const;

export type AgentKind = (typeof agentKinds)[number];

/** How the UI names each Agent kind. */
export const agentKindLabels: Record<AgentKind, string> = {
  'claude-code': 'Claude Code',
  copilot: 'Copilot',
};

/** The Agent kind of existing Conversations and of every new Project. */
export const defaultAgentKind: AgentKind = 'claude-code';

export const isAgentKind = (value: unknown): value is AgentKind =>
  agentKinds.includes(value as AgentKind);
