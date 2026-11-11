import { z } from 'zod';

import type { Widget, WidgetAnswer } from './widget';

/** Asks the User a Widget and waits for the answer (ADR 0045). */
export type AskWidget = (widget: Widget) => Promise<WidgetAnswer>;

/**
 * A Widget tool as every runner serves it (ADR 0051): its name, description,
 * input schema and handler, in no agent SDK's terms. Each runner serves the
 * list through its own adapter, such as `claude-widget-server.ts`.
 */
export type WidgetTool = {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  /**
   * Asks the Widget the input describes and resolves with the User's answer,
   * so the run blocks until they answer. The runner has checked the input
   * against `inputSchema`.
   */
  handle(
    input: Record<string, unknown>,
    askWidget: AskWidget,
  ): Promise<WidgetAnswer>;
};

const defineWidgetTool = <Shape extends z.ZodRawShape>(tool: {
  name: string;
  description: string;
  inputSchema: z.ZodObject<Shape>;
  widgetOf(input: z.infer<z.ZodObject<Shape>>): Widget;
}): WidgetTool => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  handle: (input, askWidget) =>
    askWidget(tool.widgetOf(input as z.infer<z.ZodObject<Shape>>)),
});

const otherAndSkip =
  'The User may answer { "other": "<free text>" } instead, or skip with { "skipped": true }; a run that ends first gets { "expired": true }. Never read a skip or an expiry as agreement.';

const prompt = z.string().min(1).describe('The question, in one line.');

/** The Widget tools: `ask_choice`, `ask_rank`, `ask_scale`, `ask_matrix`. */
export const widgetTools: WidgetTool[] = [
  defineWidgetTool({
    name: 'ask_choice',
    description: `Ask the User to pick from choice cards in the chat and wait for the answer: one option, or several with multiSelect. Put the options you recommend in recommended; they start selected and marked. Returns { "selected": [labels] }. ${otherAndSkip}`,
    inputSchema: z.object({
      prompt,
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
    }),
    widgetOf: ({ prompt, options, multiSelect, recommended }) => ({
      kind: 'choice',
      prompt,
      options,
      multiSelect: multiSelect === true,
      ...(recommended === undefined ? {} : { recommended }),
    }),
  }),
  defineWidgetTool({
    name: 'ask_rank',
    description: `Ask the User to drag items into order in the chat, most important first, and wait for the answer. Returns { "order": [items] }. ${otherAndSkip}`,
    inputSchema: z.object({
      prompt,
      items: z.array(z.string().min(1)).min(2).max(12),
    }),
    widgetOf: ({ prompt, items }) => ({ kind: 'rank', prompt, items }),
  }),
  defineWidgetTool({
    name: 'ask_scale',
    description: `Ask the User to set a slider per item between min and max in the chat, to say how much rather than which, and wait for the answer. Returns { "values": [{ "item", "value" }] }. ${otherAndSkip}`,
    inputSchema: z.object({
      prompt,
      items: z.array(z.string().min(1)).min(1).max(12),
      min: z.number().int(),
      max: z.number().int(),
      minLabel: z.string().optional().describe('What min means.'),
      maxLabel: z.string().optional().describe('What max means.'),
    }),
    widgetOf: ({ prompt, items, min, max, minLabel, maxLabel }) => ({
      kind: 'scale',
      prompt,
      items,
      min,
      max,
      ...(minLabel === undefined ? {} : { minLabel }),
      ...(maxLabel === undefined ? {} : { maxLabel }),
    }),
  }),
  defineWidgetTool({
    name: 'ask_matrix',
    description: `Ask the User to place each item on a 2×2 in the chat, whose two axes you label at their low and high ends, and wait for the answer. Returns { "positions": [{ "item", "x", "y", "quadrant" }] }, x and y from 0 to 1, quadrant x first ("high-low" is high on x, low on y). ${otherAndSkip}`,
    inputSchema: z.object({
      prompt,
      items: z.array(z.string().min(1)).min(1).max(12),
      xAxis: z.object({ low: z.string(), high: z.string() }),
      yAxis: z.object({ low: z.string(), high: z.string() }),
    }),
    widgetOf: ({ prompt, items, xAxis, yAxis }) => ({
      kind: 'matrix',
      prompt,
      items,
      xAxis,
      yAxis,
    }),
  }),
];
