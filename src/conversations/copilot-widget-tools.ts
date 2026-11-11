import type { Tool, ToolResultObject } from '@github/copilot-sdk';

import { type AskWidget, widgetTools } from './widget-tools';

/** The Widget tools' names, whose calls the chat shows as their Widget. */
export const copilotWidgetToolNames: readonly string[] = widgetTools.map(
  ({ name }) => name,
);

const refused = (text: string): ToolResultObject => ({
  textResultForLlm: text,
  resultType: 'failure',
  error: text,
});

/**
 * The Copilot runner's adapter for the Widget tools (ADR 0045, ADR 0051):
 * each definition as an in-process custom tool that needs no permission. A
 * handler checks the input, awaits the User's answer, so the run blocks
 * until they answer, and returns it as JSON text.
 */
export function copilotWidgetTools(askWidget: AskWidget): Tool[] {
  return widgetTools.map((widgetTool) => ({
    name: widgetTool.name,
    description: widgetTool.description,
    parameters: widgetTool.inputSchema,
    skipPermission: true,
    handler: async (args: unknown) => {
      const input = widgetTool.inputSchema.safeParse(args);
      if (!input.success) {
        return refused(
          `The input does not fit ${widgetTool.name}: ${input.error.message}`,
        );
      }
      return JSON.stringify(await widgetTool.handle(input.data, askWidget));
    },
  }));
}
