import { describe, expect, it } from 'vitest';

import { isAllowedHost } from './allowed-host';

describe('isAllowedHost', () => {
  it.each([
    'localhost',
    'localhost:3000',
    'LOCALHOST:3000',
    '127.0.0.1',
    '127.0.0.1:8080',
    '[::1]',
    '[::1]:3000',
  ])('allows the loopback Host %s', (host) => {
    expect(isAllowedHost(host)).toBe(true);
  });

  it.each([
    null,
    '',
    'evil.example',
    'evil.example:3000',
    'localhost.evil.example',
    'localhost:3000.evil.example',
    '127.0.0.2',
    '0.0.0.0:3000',
    '192.168.1.10:3000',
    '::1',
    'localhost:',
    'localhost:abc',
  ])('refuses the Host %s', (host) => {
    expect(isAllowedHost(host)).toBe(false);
  });
});
