// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  noWorkMessage,
  parseCommand,
  planClaudeSession,
  type TerminalStartResult,
  usageText,
} from './session';

describe('parseCommand', () => {
  it('starts the server with no subcommand, passing its arguments on', () => {
    expect(parseCommand([])).toEqual({ command: 'server', args: [] });
    expect(parseCommand(['-p', '4000'])).toEqual({
      command: 'server',
      args: ['-p', '4000'],
    });
  });

  it('knows mcp', () => {
    expect(parseCommand(['mcp'])).toEqual({ command: 'mcp' });
  });

  it('accepts start with T42 or 42', () => {
    expect(parseCommand(['start', 'T42'])).toEqual({
      command: 'start',
      ticketNumber: 42,
    });
    expect(parseCommand(['start', '42'])).toEqual({
      command: 'start',
      ticketNumber: 42,
    });
    expect(parseCommand(['start', 't7'])).toEqual({
      command: 'start',
      ticketNumber: 7,
    });
  });

  it('accepts triage and spec with a Ticket, and next alone (T1240)', () => {
    expect(parseCommand(['triage', 'T42'])).toEqual({
      command: 'triage',
      ticketNumber: 42,
    });
    expect(parseCommand(['spec', '7'])).toEqual({
      command: 'spec',
      ticketNumber: 7,
    });
    expect(parseCommand(['next'])).toEqual({ command: 'next' });
  });

  it.each([
    [['triage']],
    [['spec', 'abc']],
    [['spec', 'T1', 'extra']],
    [['next', 'T1']],
    [['start']],
    [['start', 'abc']],
    [['start', '0']],
    [['start', '1.5']],
    [['start', 'T42', 'extra']],
    [['frobnicate']],
    [['mcp', 'extra']],
  ])('returns usage for %j', (argv) => {
    expect(parseCommand(argv)).toEqual({
      command: 'usage',
      text: usageText,
    });
  });

  it('prints the usage with the start command', () => {
    expect(usageText).toContain('tandembike start <ticket>');
    expect(usageText).toContain('tandembike triage <ticket>');
    expect(usageText).toContain('tandembike spec <ticket>');
    expect(usageText).toContain('tandembike next');
  });

  it('words each reason next_work gives for no work (T1240)', () => {
    expect(noWorkMessage('no-active-cycle')).toMatch(/no Active Cycle/);
    expect(noWorkMessage('nothing-ready')).toMatch(/ready-for-agent/);
    expect(noWorkMessage('all-blocked-or-claimed')).toMatch(
      /blocked or claimed/,
    );
  });
});

describe('planClaudeSession', () => {
  const result: TerminalStartResult = {
    conversationId: 12,
    cwd: '/work/tree',
    firstMessage: '/tandembike:implement T42',
    brief: 'You were started by Tandembike.',
    runMode: 'default',
    model: null,
  };

  it('opens claude in the cwd with the Playbook, the brief, the mode and the prompt last', () => {
    const plan = planClaudeSession(result, '/checkout/playbook');

    expect(plan).toEqual({
      command: 'claude',
      cwd: '/work/tree',
      args: [
        '--plugin-dir',
        '/checkout/playbook',
        '--append-system-prompt',
        'You were started by Tandembike.',
        '--permission-mode',
        'default',
        '/tandembike:implement T42',
      ],
      env: { TANDEMBIKE_RUN: '12' },
    });
  });

  it('passes the model when set and the auto mode', () => {
    const plan = planClaudeSession(
      { ...result, model: 'opus', runMode: 'auto' },
      '/checkout/playbook',
    );

    expect(plan.args).toEqual([
      '--plugin-dir',
      '/checkout/playbook',
      '--append-system-prompt',
      'You were started by Tandembike.',
      '--permission-mode',
      'auto',
      '--model',
      'opus',
      '/tandembike:implement T42',
    ]);
  });
});
