/** The permission modes a Project's Agent runs can use (ADR 0029). */
export const agentRunModes = ['default', 'auto'] as const;

export type AgentRunMode = (typeof agentRunModes)[number];
