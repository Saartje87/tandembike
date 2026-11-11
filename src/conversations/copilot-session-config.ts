import type {
  SessionConfigBase,
  SessionEventHandler,
} from '@github/copilot-sdk';

import type { RunOptions } from './agent-runner';
import { copilotPermissionHandler } from './copilot-permissions';
import { copilotQuestionHandler } from './copilot-questions';
import { copilotToolFilters } from './copilot-tool-policy';
import { copilotWidgetTools } from './copilot-widget-tools';

/** Copilot's own GitHub MCP server, which a Tandembike run does without (ADR 0051). */
const githubMcpServer = 'github-mcp-server';

/**
 * The Copilot session a run starts or resumes, from its agent-neutral
 * options (ADR 0051): the Copilot runner's one place for session config.
 * Handlers, tools and MCP servers are not kept by a session, so a resume
 * gets the same config again.
 */
export function copilotSessionConfig(
  options: RunOptions,
  run: {
    onEvent: SessionEventHandler;
    /** Whether the run acts on Copilot's Assisted verdicts, its `auto`. */
    assisted(): boolean;
  },
): SessionConfigBase {
  return {
    workingDirectory: options.cwd,
    // The run's folder and ID as literal headers, as on Claude Code runs
    // (ADR 0019, ADR 0037).
    mcpServers: {
      tandembike: {
        type: 'http',
        url: options.mcpUrl,
        headers: {
          'X-Tandembike-Cwd': options.cwd,
          'X-Tandembike-Run': options.agentRunId,
        },
        tools: ['*'],
      },
    },
    disabledMcpServers: [githubMcpServer],
    // The Playbook as a plugin: its skills run as /tandembike:<skill>, as on
    // Claude Code (ADR 0032, ADR 0051).
    pluginDirectories: options.plugins.map(({ path }) => path),
    tools: copilotWidgetTools(options.askWidget),
    systemMessage: { mode: 'append', content: options.systemPrompt },
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.toolPolicy === undefined
      ? {}
      : copilotToolFilters(options.toolPolicy)),
    // Never Copilot's autopilot loop or approve-all: every request the User
    // must judge reaches the relay below (ADR 0051). An `auto` run turns on
    // Assisted once the session says it can.
    permissionMode: 'manual',
    autopilot: { continuationEnabled: false },
    // Commits carry only the attribution the repository asks for.
    coauthorEnabled: false,
    onPermissionRequest: copilotPermissionHandler(
      options.askPermission,
      run.assisted,
    ),
    onUserInputRequest: copilotQuestionHandler(options.askWidget),
    onEvent: run.onEvent,
  };
}
