import { describe, expect, it } from 'vitest';

import { isLoopbackAddress } from './loopback-address';

describe('isLoopbackAddress', () => {
  it.each([
    '127.0.0.1',
    '127.0.0.2',
    '127.255.255.254',
    '::1',
    '::ffff:127.0.0.1',
    '::FFFF:127.1.2.3',
  ])('accepts the loopback address %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(true);
  });

  it.each([
    undefined,
    '',
    '192.168.1.10',
    '10.0.0.1',
    '0.0.0.0',
    '128.0.0.1',
    '::',
    '::2',
    'fe80::1',
    '::ffff:192.168.1.10',
    'localhost',
    '127.0.0.1.evil',
  ])('refuses the address %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(false);
  });
});
