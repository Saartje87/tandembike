import type { ToolPolicy } from './agent-runner';
import { blockedTandembikeTools } from './tool-policy';

/** Claude Code's file-editing tools, which a read-only run may not use (ADR 0046). */
const fileEdits = ['Edit', 'Write', 'NotebookEdit'];

/**
 * The Claude Code tools a run under `policy` may not use (ADR 0051): the
 * policy in Claude Code's tool names, passed to the SDK as
 * `disallowedTools`.
 */
export const claudeDisallowedTools = (policy: ToolPolicy): string[] => [
  ...(policy === 'read-only' ? fileEdits : []),
  ...blockedTandembikeTools[policy].map((name) => `mcp__tandembike__${name}`),
];
