import { describe, expect, it } from 'vitest';

import { classifyRunError, runResultOf } from './run-outcome';

describe('classifyRunError', () => {
  it.each([
    'API Error: 529 {"type":"overloaded_error"}',
    'The API is overloaded',
    'API Error: 429 too many requests',
    'rate_limit_error: slow down',
    'API Error: 500 Internal server error',
    'API Error: 503 service unavailable',
    'upstream api_error',
    'read ECONNRESET',
    'connect ETIMEDOUT 1.2.3.4:443',
    'getaddrinfo ENOTFOUND api.anthropic.com',
    'TypeError: fetch failed',
    'socket hang up',
  ])('marks %j transient', (error) => {
    expect(classifyRunError(error)).toBe('transient');
  });

  it.each([
    'error_max_turns',
    'error_during_execution',
    'API Error: 400 invalid request',
    'API Error: 401 unauthorized',
    'The Agent could not finish',
  ])('marks %j substantive', (error) => {
    expect(classifyRunError(error)).toBe('substantive');
  });

  it('reads the SDK result subtype too', () => {
    expect(classifyRunError('', 'error_during_execution')).toBe('substantive');
    expect(classifyRunError('', 'api_error')).toBe('transient');
  });
});

describe('runResultOf', () => {
  const base = {
    stopped: false,
    error: undefined,
    ticketStatus: null,
    hasPullRequest: false,
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

  it('classifies an error before the Ticket', () => {
    expect(
      runResultOf({ ...base, error: 'API Error: 529', ticketStatus: 'Done' }),
    ).toBe('failed_transient');
    expect(
      runResultOf({ ...base, error: 'error_max_turns', ticketStatus: 'Done' }),
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
      runResultOf({ ...base, intent: 'triage', ticketStatus: 'Todo' }),
    ).toBe('needs_reply');
  });

  it('uses only the error and stopped rules without a Ticket', () => {
    expect(runResultOf({ ...base })).toBe('needs_reply');
    expect(runResultOf({ ...base, error: 'socket hang up' })).toBe(
      'failed_transient',
    );
  });
});
