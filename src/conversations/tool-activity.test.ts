import { describe, expect, it } from 'vitest';

import { statusLine, toolPhrase } from './status-line';

const step = (activity: unknown, toolName = 'shell') => ({
  role: 'tool' as const,
  text: `${toolName} {}`,
  permissionRules: null,
  toolName,
  toolInput: {},
  toolActivity: activity as never,
});

describe("The status line reads a tool's activity, whatever agent ran it (ADR 0051)", () => {
  it('reads a verb and its target', () => {
    expect(statusLine(step({ verb: 'Running', target: 'npm test' }))).toBe(
      'Running npm test',
    );
    expect(toolPhrase(step({ verb: 'Reading' }))).toBe('Reading');
  });

  it('reads a Tandembike tool by its own name, with the Ticket it names', () => {
    expect(
      statusLine(step({ tandembike: 'start_work', ticketNumber: 42 })),
    ).toBe('Starting T42');
    expect(statusLine(step({ tandembike: 'start_work' }))).toBe(
      'Starting a Ticket',
    );
    expect(statusLine(step({ tandembike: 'new_tool' }))).toBe('New tool');
  });

  it('prefers the activity over the agent tool name', () => {
    expect(statusLine(step({ verb: 'Editing', target: 'a.ts' }, 'Read'))).toBe(
      'Editing a.ts',
    );
  });
});
