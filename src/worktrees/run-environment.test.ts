import { describe, expect, it } from 'vitest';

import { runEnvironment } from './run-environment';

describe('runEnvironment', () => {
  it('is the server environment without NODE_ENV', () => {
    const server = {
      NODE_ENV: 'production',
      PATH: '/usr/bin',
      HOME: '/Users/someone',
      TANDEMBIKE_DATA_DIR: '/data',
      ANTHROPIC_API_KEY: 'key',
    };

    expect(runEnvironment(server)).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/someone',
      TANDEMBIKE_DATA_DIR: '/data',
      ANTHROPIC_API_KEY: 'key',
    });
  });

  it('leaves the server environment itself unchanged', () => {
    const server = { NODE_ENV: 'production', PATH: '/usr/bin' };

    runEnvironment(server);

    expect(server.NODE_ENV).toBe('production');
  });

  it('reads the process environment by default', () => {
    expect(runEnvironment()).toHaveProperty('PATH', process.env.PATH);
    expect(runEnvironment()).not.toHaveProperty('NODE_ENV');
  });
});
