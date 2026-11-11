import type { AgentKind } from '../../tickets/agent-kind';
import type { ProjectAgentSettings } from '../../tickets/tickets';

/** An Agent kind as the Settings see it: whether it can run now (ADR 0051). */
export type AgentKindOption = { kind: AgentKind; label: string } & (
  | { available: true }
  | { available: false; reason: string }
);

/** Claude Code alone, which can always run. */
export const claudeCodeOnly: AgentKindOption[] = [
  { kind: 'claude-code', label: 'Claude Code', available: true },
];

/**
 * Whether the Settings show Copilot's models and AI-credit ceilings
 * (ADR 0051): once Copilot can run here, is the default, or has one of them
 * kept.
 */
export function showsCopilot(
  settings: ProjectAgentSettings,
  agentKinds: AgentKindOption[],
): boolean {
  return (
    agentKinds.some(({ kind, available }) => kind === 'copilot' && available) ||
    settings.defaultAgentKind === 'copilot' ||
    settings.spendCeilingAiCredits !== null ||
    settings.triageCeilingAiCredits !== null ||
    settings.models.copilot.runModel !== null ||
    settings.models.copilot.triageModel !== null
  );
}
