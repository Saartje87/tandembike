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
