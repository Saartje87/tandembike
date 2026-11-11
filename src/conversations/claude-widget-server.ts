import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  tool,
} from '@anthropic-ai/claude-agent-sdk';

import type { WidgetAnswer } from './widget';
import { type AskWidget, widgetTools } from './widget-tools';

/** The in-process MCP server of the Widget tools, as its tools are named (`mcp__widgets__ask_choice`). */
export const widgetServerName = 'widgets';

/** Whether an SDK tool name is one of the Widget tools, whose call the chat shows as the Widget. */
export const isWidgetTool = (name: string): boolean =>
  name.startsWith(`mcp__${widgetServerName}__`);

const answerResult = (answer: WidgetAnswer) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(answer) }],
});

/**
 * The Claude runner's adapter for the Widget tools (ADR 0045, ADR 0051):
 * each definition served in-process beside the HTTP `tandembike` server. A
 * handler awaits the User's answer, so the run blocks until they answer, and
 * returns it as JSON text. MCP tools never reach `canUseTool`, so the
 * blocking lives here.
 */
export function createWidgetServer(
  askWidget: AskWidget,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: widgetServerName,
    alwaysLoad: true,
    tools: widgetTools.map((widgetTool) =>
      tool(
        widgetTool.name,
        widgetTool.description,
        widgetTool.inputSchema.shape,
        async (input) =>
          answerResult(await widgetTool.handle(input, askWidget)),
      ),
    ),
  });
}
