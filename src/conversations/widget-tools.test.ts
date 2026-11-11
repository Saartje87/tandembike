import { describe, expect, it, vi } from 'vitest';

import { widgetTools } from './widget-tools';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const toolNamed = (name: string) => {
  const found = widgetTools.find((tool) => tool.name === name);
  if (!found) throw new Error(`No Widget tool ${name}`);
  return found;
};

describe('The Widget tools, defined once for every runner (ADR 0045, ADR 0051)', () => {
  it('are ask_choice, ask_rank, ask_scale and ask_matrix, each described with how Other and Skip answer', () => {
    expect(widgetTools.map(({ name }) => name)).toEqual([
      'ask_choice',
      'ask_rank',
      'ask_scale',
      'ask_matrix',
    ]);
    for (const tool of widgetTools) {
      expect(tool.description).toContain('{ "skipped": true }');
    }
  });

  it('ask the User the Widget their input describes, and return the answer', async () => {
    const askWidget = vi.fn().mockResolvedValue({ selected: ['B'] });

    const answer = await toolNamed('ask_choice').handle(
      { prompt: 'Which?', options: [{ label: 'A' }, { label: 'B' }] },
      askWidget,
    );

    expect(askWidget).toHaveBeenCalledWith({
      kind: 'choice',
      prompt: 'Which?',
      options: [{ label: 'A' }, { label: 'B' }],
      multiSelect: false,
    });
    expect(answer).toEqual({ selected: ['B'] });
  });

  it('check their input against the schema', () => {
    const { inputSchema } = toolNamed('ask_rank');

    expect(
      inputSchema.safeParse({ prompt: 'Order', items: ['A'] }).success,
    ).toBe(false);
    expect(
      inputSchema.safeParse({ prompt: 'Order', items: ['A', 'B'] }).success,
    ).toBe(true);
  });

  it('import nothing from an agent SDK', () => {
    const source = readFileSync(join(__dirname, 'widget-tools.ts'), 'utf8');

    expect(source).not.toMatch(/claude-agent-sdk|copilot-sdk/);
  });
});
