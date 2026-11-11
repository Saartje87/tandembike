import { describe, expect, it } from 'vitest';

import {
  noWorkMessage,
  parseCommand,
  planClaudeSession,
  type TerminalStartResult,
  usageText,
} from './session';

describe('parseCommand', () => {
  it('prints the help for no subcommand, help and --help (T1350)', () => {
    for (const argv of [[], ['help'], ['--help']]) {
      expect(parseCommand(argv)).toEqual({ command: 'help', text: usageText });
    }
  });

  it('knows start with its port and --foreground (T1350)', () => {
    expect(parseCommand(['start'])).toEqual({
      command: 'start',
      port: null,
      foreground: false,
    });
    expect(parseCommand(['start', '-p', '4848'])).toEqual({
      command: 'start',
      port: 4848,
      foreground: false,
    });
    expect(parseCommand(['start', '--port', '4848', '--foreground'])).toEqual({
      command: 'start',
      port: 4848,
      foreground: true,
    });
    expect(parseCommand(['start', '--port=4848'])).toEqual({
      command: 'start',
      port: 4848,
      foreground: false,
    });
  });

  it('knows stop, stop --force, restart and status (T1350)', () => {
    expect(parseCommand(['stop'])).toEqual({ command: 'stop', force: false });
    expect(parseCommand(['stop', '--force'])).toEqual({
      command: 'stop',
      force: true,
    });
    expect(parseCommand(['restart'])).toEqual({ command: 'restart' });
    expect(parseCommand(['status'])).toEqual({ command: 'status' });
  });

  it('knows logs and logs -f (T1351)', () => {
    expect(parseCommand(['logs'])).toEqual({ command: 'logs', follow: false });
    expect(parseCommand(['logs', '-f'])).toEqual({
      command: 'logs',
      follow: true,
    });
    expect(parseCommand(['logs', '--follow'])).toEqual({
      command: 'logs',
      follow: true,
    });
    expect(parseCommand(['logs', 'x'])).toMatchObject({ command: 'usage' });
    expect(usageText).toContain('tandembike logs [-f]');
  });

  it('lists the server commands in the help (T1350)', () => {
    for (const line of [
      'tandembike start',
      '--foreground',
      'tandembike stop',
      'tandembike restart',
      'tandembike status',
      'tandembike help',
    ]) {
      expect(usageText).toContain(line);
    }
  });

  it('knows plugin', () => {
    expect(parseCommand(['plugin'])).toEqual({ command: 'plugin' });
    expect(parseCommand(['plugin', 'x'])).toEqual({
      command: 'usage',
      text: usageText,
    });
  });

  it('knows mcp', () => {
    expect(parseCommand(['mcp'])).toEqual({ command: 'mcp' });
  });

  it('accepts implement with T42 or 42, and alone (T1353)', () => {
    expect(parseCommand(['implement', 'T42'])).toEqual({
      command: 'implement',
      ticketNumber: 42,
    });
    expect(parseCommand(['implement', '42'])).toEqual({
      command: 'implement',
      ticketNumber: 42,
    });
    expect(parseCommand(['implement', 't7'])).toEqual({
      command: 'implement',
      ticketNumber: 7,
    });
    expect(parseCommand(['implement'])).toEqual({
      command: 'implement',
      ticketNumber: null,
    });
  });

  it('accepts triage and spec with a Ticket (T1240)', () => {
    expect(parseCommand(['triage', 'T42'])).toEqual({
      command: 'triage',
      ticketNumber: 42,
    });
    expect(parseCommand(['spec', '7'])).toEqual({
      command: 'spec',
      ticketNumber: 7,
    });
  });

  it('accepts plan with a goal and refuses a missing one (T1249)', () => {
    expect(parseCommand(['plan', 'Ship the blog'])).toEqual({
      command: 'plan',
      goal: 'Ship the blog',
    });
    expect(parseCommand(['plan', 'Ship', 'the', 'blog'])).toEqual({
      command: 'plan',
      goal: 'Ship the blog',
    });
    for (const argv of [['plan'], ['plan', '  ']]) {
      expect(parseCommand(argv)).toMatchObject({ command: 'usage' });
    }
    expect(usageText).toContain('tandembike plan "<goal>"');
  });

  it.each([
    [['triage']],
    [['spec', 'abc']],
    [['spec', 'T1', 'extra']],
    [['next']],
    [['next', 'T1']],
    [['implement', 'abc']],
    [['implement', '0']],
    [['implement', '1.5']],
    [['implement', 'T42', 'extra']],
    [['start', 'T42']],
    [['start', '-p']],
    [['start', '-p', 'abc']],
    [['start', '--verbose']],
    [['stop', 'now']],
    [['restart', '-p', '4848']],
    [['status', 'x']],
    [['help', 'x']],
    [['frobnicate']],
    [['mcp', 'extra']],
  ])('returns usage for %j', (argv) => {
    expect(parseCommand(argv)).toEqual({
      command: 'usage',
      text: usageText,
    });
  });

  it('prints the usage with the session commands (T1353)', () => {
    expect(usageText).toContain('tandembike implement [ticket]');
    expect(usageText).not.toContain('tandembike next');
    expect(usageText).not.toContain('start <ticket>');
    expect(usageText).toContain('tandembike triage <ticket>');
    expect(usageText).toContain('tandembike spec <ticket>');
  });

  it('words each reason next_work gives for no work (T1240)', () => {
    expect(noWorkMessage('no-active-cycle')).toMatch(/no Active Cycle/);
    expect(noWorkMessage('nothing-ready')).toMatch(/ready-for-agent/);
    expect(noWorkMessage('all-blocked-or-claimed')).toMatch(
      /blocked or claimed/,
    );
  });
});

describe('parseCommand resume', () => {
  it('accepts resume with a Conversation id', () => {
    expect(parseCommand(['resume', '12'])).toEqual({
      command: 'resume',
      conversationId: 12,
    });
  });

  it.each([
    [['resume']],
    [['resume', 'abc']],
    [['resume', '0']],
    [['resume', 'T12']],
    [['resume', '12', 'extra']],
  ])('returns usage for %j', (argv) => {
    expect(parseCommand(argv)).toEqual({ command: 'usage', text: usageText });
  });

  it('prints the usage with the resume command', () => {
    expect(usageText).toContain('tandembike resume <conversation>');
  });
});

describe('planClaudeSession for a resume', () => {
  it('resumes the session in the cwd with the Playbook, the brief and the env', () => {
    const plan = planClaudeSession(
      {
        conversationId: 12,
        sessionId: 'sess-1',
        cwd: '/work/tree',
        brief: 'You were started by Tandembike.',
        runMode: 'auto',
        model: 'opus',
      },
      '/checkout/playbook',
    );

    expect(plan).toEqual({
      command: 'claude',
      cwd: '/work/tree',
      args: [
        '--resume',
        'sess-1',
        '--plugin-dir',
        '/checkout/playbook',
        '--append-system-prompt',
        'You were started by Tandembike.',
        '--permission-mode',
        'auto',
        '--model',
        'opus',
      ],
      env: { TANDEMBIKE_RUN: '12' },
    });
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
