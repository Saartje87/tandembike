import type { ToolPolicy } from './agent-runner';
import { widgetServerName } from './claude-widget-server';
import { blockedTandembikeTools } from './tool-policy';
import { widgetTools } from './widget-tools';

/** Claude Code's file-editing tools, which a read-only run may not use (ADR 0046). */
const fileEdits = ['Edit', 'Write', 'NotebookEdit'];

/**
 * The Claude Code tools a run under `policy` may not use (ADR 0051): the
 * policy in Claude Code's tool names, passed to the SDK as
 * `disallowedTools`.
 */
export const claudeDisallowedTools = (policy: ToolPolicy): string[] => [
  ...(policy === 'read-only' ? fileEdits : []),
  // A judgment run reads with Read, Grep and Glob, and nobody answers it: no
  // shell, whose writes would ask, and no question (ADR 0054).
  ...(policy === 'judgment'
    ? [
        ...fileEdits,
        'Bash',
        'AskUserQuestion',
        ...widgetTools.map(({ name }) => `mcp__${widgetServerName}__${name}`),
      ]
    : []),
  ...blockedTandembikeTools[policy].map((name) => `mcp__tandembike__${name}`),
];
