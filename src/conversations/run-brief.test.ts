import { describe, expect, it } from 'vitest';

import { runBrief } from './run-brief';

describe('runBrief for a Retro', () => {
  const brief = runBrief({
    conversationId: 5,
    ticketNumber: null,
    ticketTitle: null,
    ticketType: null,
    projectName: 'Website',
    intent: 'retro',
    retroCycle: { id: 44, title: 'Factory p2' },
    parallelRuns: false,
    runMode: 'default',
  });

  it('names the Cycle by title and id', () => {
    expect(brief).toContain('retrospective');
    expect(brief).toContain('"Factory p2" (Cycle 44)');
  });

  it('points at list_tickets with cycleId and at Feedback as Tickets', () => {
    expect(brief).toContain('list_tickets');
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
