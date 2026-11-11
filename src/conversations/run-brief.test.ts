import { describe, expect, it } from 'vitest';

import { conversationIntents } from './conversation-state';
import { runBrief } from './run-brief';

describe('runBrief for a Retro', () => {
  const brief = runBrief({
    conversationId: 5,
    ticketNumber: null,
    ticketTitle: null,
    ticketType: null,
    projectName: 'Website',
    agentKind: 'claude-code' as const,
    intent: 'retro',
    retroCycle: { id: 44, title: 'Factory p2' },
    parallelRuns: false,
    runMode: 'default',
  });

  it('names the Cycle by title and id', () => {
    expect(brief).toContain('retrospective');
    expect(brief).toContain('"Factory p2" (Cycle 44)');
  });

  it('points at find_tickets with cycleId and at Feedback as Tickets', () => {
    expect(brief).toContain('find_tickets');
    expect(brief).toContain('cycleId');
    expect(brief).toContain('"Feedback as Tickets"');
  });

  it('copies no Ticket list, Status or cost', () => {
    expect(brief).not.toMatch(/\bT\d+\b|\$\d|Todo|In progress/);
  });
});

describe('runBrief and the Check command', () => {
  const base = {
    conversationId: 5,
    ticketNumber: 7,
    ticketTitle: 'Fix it',
    ticketType: 'Ticket' as const,
    projectName: 'Website',
    agentKind: 'claude-code' as const,
    parallelRuns: false,
    runMode: 'default' as const,
  };

  it('tells a Start run to run the command and see it pass before a PR', () => {
    const brief = runBrief({
      ...base,
      intent: 'start',
      checkCommand: 'npm run check',
    });

    expect(brief).toContain('`npm run check`');
    expect(brief).toMatch(/see it pass before you open a pull request/);
  });

  it('tells a Start run with none to follow the repository instructions', () => {
    const brief = runBrief({ ...base, intent: 'start', checkCommand: null });

    expect(brief).toContain('no Check command');
    expect(brief).toContain("repository's own instructions");
  });

  it('leaves other intents without a Check command line', () => {
    for (const intent of ['triage', 'ask', 'setup'] as const) {
      expect(
        runBrief({ ...base, intent, checkCommand: 'npm run check' }),
      ).not.toContain('Check command');
    }
  });
});

describe('runBrief and the worktree', () => {
  const base = {
    conversationId: 5,
    ticketNumber: 7,
    ticketTitle: 'Fix it',
    ticketType: 'Ticket' as const,
    projectName: 'Website',
    agentKind: 'claude-code' as const,
    intent: 'start' as const,
    parallelRuns: true,
    runMode: 'default' as const,
  };

  it('replaces the Parallel runs line with the worktree line when there is a worktree', () => {
    const brief = runBrief({
      ...base,
      worktree: { path: '/w/1/c5', base: 'origin/main' },
    });

    expect(brief).toContain(
      'You are in a git worktree Tandembike made for this Conversation at /w/1/c5, detached at origin/main. Create your branch here; do not create or enter another worktree; Tandembike removes it when the Conversation closes or the Ticket is Done.',
    );
    expect(brief).not.toContain('Other runs may work in this repository');
  });

  it('tells a Merge its worktree is detached, not that it creates a branch', () => {
    const brief = runBrief({
      ...base,
      intent: 'merge',
      worktree: { path: '/w/1/c5', base: 'origin/main' },
    });

    expect(brief).toContain('at /w/1/c5, detached at origin/main');
    expect(brief).toContain('checks that branch out here');
    expect(brief).not.toContain('Create your branch here');
  });

  it('keeps the Parallel runs line without a worktree', () => {
    const brief = runBrief({ ...base, worktree: null });

    expect(brief).toContain('Other runs may work in this repository');
    expect(brief).not.toContain('Tandembike made for this Conversation');
  });
});

describe('runBrief per Agent kind (ADR 0051)', () => {
  const situations = conversationIntents.flatMap((intent) =>
    [false, true].flatMap((parallelRuns) =>
      [false, true].map((terminal) => ({
        conversationId: 5,
        ticketNumber: 7,
        ticketTitle: 'Fix it',
        ticketType: 'Ticket' as const,
        projectName: 'Website',
        agentKind: 'claude-code' as const,
        intent,
        parallelRuns,
        terminal,
        runMode: 'auto' as const,
        checkCommand: 'npm run check',
        planEstimateUsd: 1.5,
        retroCycle: { id: 44, title: 'Factory p2' },
      })),
    ),
  );

  it("keeps a Claude Code run's brief word for word", () => {
    expect(
      situations.map((situation) =>
        runBrief({ ...situation, agentKind: 'claude-code' }),
      ),
    ).toMatchSnapshot();
  });

  it('gives the Claude-only lines to Claude Code runs only', () => {
    const claudeOnly = /EnterWorktree|ExitWorktree|AskUserQuestion|CLAUDE\.md/;
    for (const situation of situations) {
      expect(runBrief({ ...situation, agentKind: 'copilot' })).not.toMatch(
        claudeOnly,
      );
    }
    expect(
      situations.some((situation) =>
        claudeOnly.test(runBrief({ ...situation, agentKind: 'claude-code' })),
      ),
    ).toBe(true);
  });

  it('keeps the shared parts for every kind', () => {
    const brief = runBrief({
      ...situations[0],
      intent: 'start',
      agentKind: 'copilot',
    });

    expect(brief).toContain('Ticket T7, "Fix it"');
    expect(brief).toContain('ask_choice');
    expect(brief).toContain('Your Agent-run ID: 5.');
    expect(brief).toContain('`npm run check`');
  });
});
