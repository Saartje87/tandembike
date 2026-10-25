import { describe, expect, it } from 'vitest';

import { parseTicketNumber } from './ticket-number';

describe('parseTicketNumber', () => {
  it('reads a Ticket number written with or without a hash', () => {
    expect(parseTicketNumber('42')).toBe(42);
    expect(parseTicketNumber(' #42 ')).toBe(42);
  });

  it('reads nothing else as a Ticket number', () => {
    expect(parseTicketNumber('')).toBeUndefined();
    expect(parseTicketNumber('0')).toBeUndefined();
    expect(parseTicketNumber('4.2')).toBeUndefined();
    expect(parseTicketNumber('#')).toBeUndefined();
    expect(parseTicketNumber('99999999999999999999')).toBeUndefined();
  });
});
