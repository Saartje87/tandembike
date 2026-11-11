import type { AgentKind } from './agent-kind';

/**
 * The units Agent kinds report cost in (ADR 0051): dollars for Claude Code,
 * GitHub AI credits for Copilot. Nothing converts or totals across them.
 */
export const costUnits = ['usd', 'ai_credits'] as const;

export type CostUnit = (typeof costUnits)[number];

/** A ceiling per unit; a unit without one has no ceiling. */
export type CeilingsByUnit = Record<CostUnit, number | null>;

/** A ceiling setting kept per unit, from its dollar and its AI-credit field. */
export const ceilingsByUnit = (
  usd: number | null,
  aiCredits: number | null,
): CeilingsByUnit => ({ usd, ai_credits: aiCredits });

/**
 * The unit each Agent kind reports cost in (ADR 0051), for the settings that
 * check a ceiling in the default agent's unit; each runner declares the same.
 */
export const agentCostUnits: Record<AgentKind, CostUnit> = {
  'claude-code': 'usd',
  copilot: 'ai_credits',
};
