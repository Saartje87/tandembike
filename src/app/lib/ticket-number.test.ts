import { describe, expect, it } from 'vitest';

import { parseTicketNumber } from './ticket-number';

describe('parseTicketNumber', () => {
  it('reads a Ticket number written with a T, a hash or neither', () => {
    expect(parseTicketNumber('42')).toBe(42);
    expect(parseTicketNumber(' T42 ')).toBe(42);
    expect(parseTicketNumber('t42')).toBe(42);
    expect(parseTicketNumber(' #42 ')).toBe(42);
  });

  it('reads nothing else as a Ticket number', () => {
    expect(parseTicketNumber('')).toBeUndefined();
    expect(parseTicketNumber('0')).toBeUndefined();
    expect(parseTicketNumber('4.2')).toBeUndefined();
    expect(parseTicketNumber('#')).toBeUndefined();
    expect(parseTicketNumber('T')).toBeUndefined();
    expect(parseTicketNumber('T#42')).toBeUndefined();
    expect(parseTicketNumber('99999999999999999999')).toBeUndefined();
  });
});
