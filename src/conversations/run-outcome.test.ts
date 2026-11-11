import { describe, expect, it } from 'vitest';

import { runResultOf } from './run-outcome';

describe('runResultOf', () => {
  const base = {
    stopped: false,
    error: undefined,
    transient: false,
    ticketStatus: null,
    hasPullRequest: false,
    waitingOnUser: false,
    intent: 'start',
  } as const;

  it('puts stopped before an error, Done and the rest', () => {
    expect(
      runResultOf({
        ...base,
        stopped: true,
        error: 'x',
        ticketStatus: 'Done',
      }),
    ).toBe('stopped');
  });

  it("classifies an error before the Ticket, by the runner's transient verdict (ADR 0034, ADR 0051)", () => {
    expect(
      runResultOf({
        ...base,
        error: 'anything',
        transient: true,
        ticketStatus: 'Done',
      }),
    ).toBe('failed_transient');
    expect(
      runResultOf({
        ...base,
        error: 'API Error: 529',
        transient: false,
        ticketStatus: 'Done',
      }),
    ).toBe('failed');
  });

  it('follows the Ticket: Done, then a PR, then Todo for a Start', () => {
    expect(runResultOf({ ...base, ticketStatus: 'Done' })).toBe('completed');
    expect(
      runResultOf({
        ...base,
        ticketStatus: 'In progress',
        hasPullRequest: true,
      }),
    ).toBe('pr_open');
    expect(runResultOf({ ...base, ticketStatus: 'Todo' })).toBe('abandoned');
    expect(runResultOf({ ...base, ticketStatus: 'In progress' })).toBe(
      'needs_reply',
    );
  });

  it('does not call a Todo Ticket abandoned for other intents', () => {
    expect(
      runResultOf({
        ...base,
        intent: 'triage',
        ticketStatus: 'Todo',
        waitingOnUser: true,
      }),
    ).toBe('needs_reply');
  });

  it('uses only the error and stopped rules for a Start without a Ticket', () => {
    expect(runResultOf({ ...base })).toBe('needs_reply');
    expect(
      runResultOf({ ...base, error: 'socket hang up', transient: true }),
    ).toBe('failed_transient');
  });

  describe.each([
    'triage',
    'spec',
    'plan',
    'retro',
    'ask',
    'new_ticket',
    'setup',
    'batch_triage',
  ] as const)('a %s run, which never ends in Done or a PR', (intent) => {
    it('is completed when it ends cleanly, with or without a Ticket', () => {
      expect(runResultOf({ ...base, intent })).toBe('completed');
      expect(runResultOf({ ...base, intent, ticketStatus: 'Todo' })).toBe(
        'completed',
      );
      expect(
        runResultOf({ ...base, intent, ticketStatus: 'In progress' }),
      ).toBe('completed');
    });

    it('is needs_reply when it ends waiting on the User', () => {
      expect(runResultOf({ ...base, intent, waitingOnUser: true })).toBe(
        'needs_reply',
      );
    });

    it('still puts stopped and an error first', () => {
      expect(runResultOf({ ...base, intent, stopped: true })).toBe('stopped');
      expect(runResultOf({ ...base, intent, error: 'error_max_turns' })).toBe(
        'failed',
      );
    });
  });

  it.each(['start', 'merge'] as const)(
    'leaves a clean %s end that is not Done, PR or Todo at needs_reply',
    (intent) => {
      expect(
        runResultOf({ ...base, intent, ticketStatus: 'In progress' }),
      ).toBe('needs_reply');
      expect(runResultOf({ ...base, intent })).toBe('needs_reply');
    },
  );

  it("leaves a Spar, the User's own thinking turn by turn, at needs_reply", () => {
    expect(runResultOf({ ...base, intent: 'spar' })).toBe('needs_reply');
  });
});
