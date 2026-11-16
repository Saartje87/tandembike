import { describe, expect, it } from 'vitest';

import { runEnvironment } from './run-environment';

describe('runEnvironment', () => {
  it('is the server environment without NODE_ENV and TANDEMBIKE_PACKAGE_DIR', () => {
    const server = {
      NODE_ENV: 'production',
      TANDEMBIKE_PACKAGE_DIR: '/main-checkout',
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
    expect(runEnvironment()).not.toHaveProperty('TANDEMBIKE_PACKAGE_DIR');
  });
});
