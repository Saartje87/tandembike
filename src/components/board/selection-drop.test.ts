import { describe, expect, it } from 'vitest';

import { selectionDrop } from './selection-drop';

describe('Where a dragged selection lands in a lane', () => {
  it('lands at the end of a lane dropped on as a whole', () => {
    expect(selectionDrop([1, 2], [7, 8], 7, undefined)).toEqual({
      before: null,
      laneOrder: [1, 2, 7, 8],
    });
  });

  it('lands before a card dropped on from another lane', () => {
    expect(selectionDrop([1, 2, 3], [7, 8], 7, 2)).toEqual({
      before: 2,
      laneOrder: [1, 7, 8, 2, 3],
    });
  });

  it('lands after a card the dragged card came from above', () => {
    expect(selectionDrop([1, 2, 3, 4], [1, 3], 1, 4)).toEqual({
      before: null,
      laneOrder: [2, 4, 1, 3],
    });
  });

  it('lands before a card the dragged card came from below', () => {
    expect(selectionDrop([1, 2, 3, 4], [1, 4], 4, 2)).toEqual({
      before: 2,
      laneOrder: [1, 4, 2, 3],
    });
  });

  it('gathers at a selected card dropped on, before the next unselected one', () => {
    expect(selectionDrop([1, 2, 3, 4], [1, 2, 4], 1, 2)).toEqual({
      before: 3,
      laneOrder: [1, 2, 4, 3],
    });
  });
});
