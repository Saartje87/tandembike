/** The tokens a run used on one model, by type (ADR 0050). */
export type TokenUsage = {
  input: number;
  output: number;
  /** Prompt-cache writes (the SDK's cache creation tokens). */
  cacheWrite: number;
  cacheRead: number;
};

/** Tokens per model, keyed by model id such as `claude-opus-5-5`. */
export type UsageByModel = Record<string, TokenUsage>;

export const noTokens: TokenUsage = {
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
};

/** `a` plus `b`, per token type. */
export function addTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
  };
}
