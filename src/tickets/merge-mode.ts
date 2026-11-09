/**
 * How an Agent run ends at an open PR (ADR 0043): `auto` merges it itself
 * when the merge conditions hold, `approve` hands off at the Merge gate.
 */
export const mergeModes = ['auto', 'approve'] as const;
export type MergeMode = (typeof mergeModes)[number];

/** The mode a Project's Auto-merge setting gives its runs. */
export const mergeModeOf = (autoMerge: boolean): MergeMode =>
  autoMerge ? 'auto' : 'approve';
