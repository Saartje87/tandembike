import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  tool,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import type { Widget, WidgetAnswer } from './widget';

/** The in-process MCP server of the Widget tools, as its tools are named (`mcp__widgets__ask_choice`). */
export const widgetServerName = 'widgets';

/** Whether an SDK tool name is one of the Widget tools, whose call the chat shows as the Widget. */
export const isWidgetTool = (name: string): boolean =>
  name.startsWith(`mcp__${widgetServerName}__`);

const answerResult = (answer: WidgetAnswer) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(answer) }],
});

const otherAndSkip =
  'The User may answer { "other": "<free text>" } instead, or skip with { "skipped": true }; a run that ends first gets { "expired": true }. Never read a skip or an expiry as agreement.';

/**
 * The Widget tools (ADR 0045), served in-process beside the HTTP `tandembike`
 * server. Each handler awaits `askWidget`, so the run blocks until the User
 * answers in the chat, and returns the answer as JSON text. MCP tools never
 * reach `canUseTool`, so the blocking lives here.
 */
export function createWidgetServer(
  askWidget: (widget: Widget) => Promise<WidgetAnswer>,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: widgetServerName,
    alwaysLoad: true,
    tools: [
      tool(
        'ask_choice',
        `Ask the User to pick from choice cards in the chat and wait for the answer: one option, or several with multiSelect. Put the options you recommend in recommended; they start selected and marked. Returns { "selected": [labels] }. ${otherAndSkip}`,
        {
          prompt: z.string().min(1).describe('The question, in one line.'),
          options: z
            .array(
              z.object({
                label: z.string().min(1),
                description: z.string().optional(),
              }),
            )
            .min(2)
            .max(8),
          multiSelect: z.boolean().optional(),
          recommended: z
            .array(z.string())
            .optional()
            .describe('Labels of the options you recommend.'),
        },
        async ({ prompt, options, multiSelect, recommended }) =>
          answerResult(
            await askWidget({
              kind: 'choice',
              prompt,
              options,
              multiSelect: multiSelect === true,
              ...(recommended === undefined ? {} : { recommended }),
            }),
          ),
      ),
    ],
  });
}
