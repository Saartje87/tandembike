import { describe, expect, it } from 'vitest';

import { serverPort } from './server-port';

describe('serverPort', () => {
  it('defaults to 4747', () => {
    expect(serverPort([])).toBe(4747);
  });

  it.each([[['-p', '4848']], [['--port', '4848']], [['--port=4848']]])(
    'reads the port from %j',
    (args) => {
      expect(serverPort(args)).toBe(4848);
    },
  );

  it.each([
    [['-H', '0.0.0.0'], /unknown option "-H"/i],
    [['--hostname', '0.0.0.0'], /unknown option "--hostname"/i],
    [['-p'], /needs a port/i],
    [['-p', 'abc'], /not a valid port/i],
    [['-p', '0'], /not a valid port/i],
    [['-p', '65536'], /not a valid port/i],
    [['-p', '48.5'], /not a valid port/i],
  ])('refuses %j', (args, message) => {
    expect(() => serverPort(args)).toThrow(message);
  });
});
