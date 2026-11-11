import type { ToolPolicy } from './agent-runner';
import { blockedTandembikeTools } from './tool-policy';

/**
 * Copilot's built-in tools a read-only run keeps: reading, searching, its
 * shell (whose writes still ask the User, as Claude Code's Bash does), its
 * skills and its questions. Edit and create are left out.
 */
const readingBuiltIns = ['view', 'grep', 'glob', 'bash', 'skill', 'ask_user'];

/** A session's tool filters, in Copilot's filter syntax. */
export type CopilotToolFilters = {
  availableTools?: string[];
  excludedTools?: string[];
};

/**
 * A tool policy in Copilot's tool filters (ADR 0051). Copilot's permission
 * handler cannot see read-only shell commands or read-only MCP tools, so the
 * filters alone enforce it; `excludedTools` wins over `availableTools`, and
 * `custom:*` keeps the Widget tools.
 */
export function copilotToolFilters(policy: ToolPolicy): CopilotToolFilters {
  const excludedTools = blockedTandembikeTools[policy].map(
    (name) => `mcp:tandembike-${name}`,
  );
  return policy === 'read-only'
    ? {
        availableTools: [
          ...readingBuiltIns.map((name) => `builtin:${name}`),
          'mcp:*',
          'custom:*',
        ],
        excludedTools,
      }
    : { excludedTools };
}
