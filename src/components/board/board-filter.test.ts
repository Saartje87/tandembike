import { describe, expect, it } from 'vitest';

import {
  filteredSelectionDrop,
  mergeLaneOrder,
  ticketMatches,
} from './board-filter';

const fix = { number: 42, title: 'Fix the Header', labels: ['bug', 'ui'] };

describe('ticketMatches', () => {
  it('matches any Ticket while the filter is empty', () => {
    expect(ticketMatches(fix, { query: '', labels: [] })).toBe(true);
    expect(ticketMatches(fix, { query: '   ', labels: [] })).toBe(true);
  });

  it('matches a title containing the search, trimmed and ignoring case', () => {
    expect(ticketMatches(fix, { query: '  the header ', labels: [] })).toBe(
      true,
    );
    expect(ticketMatches(fix, { query: 'footer', labels: [] })).toBe(false);
  });

  it.each(['42', 'T42', 't42', '4'])(
    'matches T42 by its number as %s',
    (query) => {
      expect(
        ticketMatches({ ...fix, title: 'Untitled' }, { query, labels: [] }),
      ).toBe(true);
    },
  );

  it('does not match a number the Ticket number does not contain', () => {
    expect(
      ticketMatches({ ...fix, title: 'Untitled' }, { query: 'T7', labels: [] }),
    ).toBe(false);
  });

  it('needs every chosen Label', () => {
    expect(ticketMatches(fix, { query: '', labels: ['bug'] })).toBe(true);
    expect(ticketMatches(fix, { query: '', labels: ['ui', 'bug'] })).toBe(true);
    expect(ticketMatches(fix, { query: '', labels: ['bug', 'docs'] })).toBe(
      false,
    );
  });

  it('needs both the search and the Labels', () => {
    expect(ticketMatches(fix, { query: 'header', labels: ['docs'] })).toBe(
      false,
    );
    expect(ticketMatches(fix, { query: 'footer', labels: ['bug'] })).toBe(
      false,
    );
  });
});

describe('mergeLaneOrder', () => {
  // Lane 1 2 3 4 5 6 with 2, 4 and 6 hidden: 1 3 5 shown.
  const lane = [1, 2, 3, 4, 5, 6];

  it('lands a card dropped below a shown card straight after it, before the hidden ones', () => {
    // 1 dropped just below 3.
    expect(mergeLaneOrder(lane, [3, 1, 5], [1])).toEqual([2, 3, 1, 4, 5, 6]);
  });

  it('lands a card dropped at the top before the hidden ones above the first card', () => {
    expect(mergeLaneOrder(lane, [5, 1, 3], [5])).toEqual([5, 1, 2, 3, 4, 6]);
  });

  it('lands a card dropped below the last shown card before the hidden ones at the end', () => {
    expect(mergeLaneOrder(lane, [3, 5, 1], [1])).toEqual([2, 3, 4, 5, 1, 6]);
  });

  it('keeps the hidden Tickets in their order around a card dropped back below the one above it', () => {
    expect(mergeLaneOrder(lane, [1, 3, 5], [3])).toEqual([1, 3, 2, 4, 5, 6]);
  });

  it('lands Tickets from another lane together after the card they follow', () => {
    expect(mergeLaneOrder(lane, [1, 8, 9, 3, 5], [8, 9])).toEqual([
      1, 8, 9, 2, 3, 4, 5, 6,
    ]);
  });
});

describe('filteredSelectionDrop', () => {
  // Lane 1 2 3 4 5 6 with 2, 4 and 6 hidden: 1 3 5 shown.
  const lane = [1, 2, 3, 4, 5, 6];
  const shown = [1, 3, 5];

  it('lands a selection carried down onto a shown card after it, before the hidden ones', () => {
    expect(filteredSelectionDrop(lane, shown, [1], 1, 3)).toEqual({
      before: 4,
      laneOrder: [2, 3, 1, 4, 5, 6],
    });
  });

  it('lands a selection from another lane dropped on a shown card before the hidden ones above it', () => {
    expect(filteredSelectionDrop(lane, shown, [8, 9], 8, 3)).toEqual({
      before: 2,
      laneOrder: [1, 8, 9, 2, 3, 4, 5, 6],
    });
  });

  it('lands a selection dropped on the lane straight after its last shown card', () => {
    expect(filteredSelectionDrop(lane, shown, [8], 8, undefined)).toEqual({
      before: 6,
      laneOrder: [1, 2, 3, 4, 5, 8, 6],
    });
  });

  it('lands at the end of a lane with nothing hidden after its last shown card', () => {
    expect(filteredSelectionDrop([1, 2, 3], [1, 3], [8], 8, undefined)).toEqual(
      {
        before: null,
        laneOrder: [1, 2, 3, 8],
      },
    );
  });
});
