import { describe, expect, it } from 'vitest';

import { isTransientClaudeError } from './claude-run-error';

describe('isTransientClaudeError', () => {
  it.each([
    'API Error: 529 {"type":"overloaded_error"}',
    'The API is overloaded',
    'API Error: 429 too many requests',
    'rate_limit_error: slow down',
    'API Error: 500 Internal server error',
    'API Error: 503 service unavailable',
    '503 Service Unavailable',
    'Request failed with status 502',
    'HTTP 500 from upstream',
    'status code 504',
    'upstream api_error',
    'read ECONNRESET',
    'connect ETIMEDOUT 1.2.3.4:443',
    'getaddrinfo ENOTFOUND api.anthropic.com',
    'TypeError: fetch failed',
    'socket hang up',
  ])('is true for %j', (error) => {
    expect(isTransientClaudeError(error)).toBe(true);
  });

  it.each([
    'error_max_turns',
    'error_during_execution',
    'API Error: 400 invalid request',
    'API Error: 401 unauthorized',
    'The Agent could not finish',
    'could not connect to port 5432',
    'Processed 512 files without a fix',
    'Migration 500 of 600 failed',
  ])('is false for %j', (error) => {
    expect(isTransientClaudeError(error)).toBe(false);
  });

  it('reads the SDK result subtype too', () => {
    expect(isTransientClaudeError('', 'error_during_execution')).toBe(false);
    expect(isTransientClaudeError('', 'api_error')).toBe(true);
    expect(isTransientClaudeError('', 'error_max_turns')).toBe(false);
  });
});
