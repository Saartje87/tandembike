/**
 * The units Agent kinds report cost in (ADR 0051): dollars for Claude Code,
 * GitHub AI credits for Copilot. Nothing converts or totals across them.
 */
export const costUnits = ['usd', 'ai_credits'] as const;

export type CostUnit = (typeof costUnits)[number];

/** A ceiling per unit; a unit without one has no ceiling. */
export type CeilingsByUnit = Record<CostUnit, number | null>;

/**
 * The ceilings kept per unit: the existing settings are the dollar ones, and
 * no other unit has a ceiling until one is added (T602).
 */
export const dollarCeiling = (usd: number | null): CeilingsByUnit => ({
  usd,
  ai_credits: null,
});
