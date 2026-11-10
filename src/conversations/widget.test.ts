import { describe, expect, it } from 'vitest';

import { errorFrom } from '../test/tickets';
import { ValidationError } from '../tickets/errors';
import { checkWidgetAnswer, tidyWidget, type Widget } from './widget';

const single: Widget = {
  kind: 'choice',
  prompt: 'Which library?',
  options: [{ label: 'A', description: 'The first' }, { label: 'B' }],
  multiSelect: false,
  recommended: ['A'],
};

const multi: Widget = { ...single, multiSelect: true, recommended: [] };

describe('Checking a Widget answer', () => {
  it('takes one choice of a single-select choice Widget', () => {
    expect(checkWidgetAnswer(single, { selected: ['B'] })).toEqual({
      selected: ['B'],
    });
  });

  it('takes several choices of a multi-select one, without repeats', () => {
    expect(checkWidgetAnswer(multi, { selected: ['B', 'A', 'B'] })).toEqual({
      selected: ['B', 'A'],
    });
  });

  it('takes Other with its text, trimmed, and Skip', () => {
    expect(checkWidgetAnswer(single, { other: '  Neither ' })).toEqual({
      other: 'Neither',
    });
    expect(checkWidgetAnswer(single, { skipped: true })).toEqual({
      skipped: true,
    });
  });

  it('refuses an empty Other', () => {
    const error = errorFrom(() => checkWidgetAnswer(single, { other: ' ' }));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toEqual({
      other: 'Write your answer.',
    });
  });

  it('refuses no choice, a choice it does not offer, and two on a single select', () => {
    for (const selected of [[], ['C'], ['A', 'B']]) {
      expect(
        errorFrom(() => checkWidgetAnswer(single, { selected })),
      ).toBeInstanceOf(ValidationError);
    }
  });

  it('refuses an answer of another kind, or none', () => {
    for (const answer of [
      { order: ['A', 'B'] },
      { expired: true },
      null,
      'A',
    ]) {
      const error = errorFrom(() => checkWidgetAnswer(single, answer));
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors).toEqual({
        answer: 'This answer does not fit a choice Widget.',
      });
    }
  });
});

describe('Tidying a Widget', () => {
  it('drops recommended labels that are no option, and keeps one on a single select', () => {
    expect(
      tidyWidget({ ...single, recommended: ['Z', 'B', 'A'] }),
    ).toMatchObject({ recommended: ['B'] });
    expect(
      tidyWidget({ ...multi, recommended: ['Z', 'B', 'A', 'B'] }),
    ).toMatchObject({ recommended: ['B', 'A'] });
  });
});

describe('Checking a rank answer', () => {
  const rank: Widget = {
    kind: 'rank',
    prompt: 'Order these',
    items: ['A', 'B', 'C'],
  };

  it('takes an order of every item once', () => {
    expect(checkWidgetAnswer(rank, { order: ['C', 'A', 'B'] })).toEqual({
      order: ['C', 'A', 'B'],
    });
  });

  it('refuses an order missing, repeating or adding an item', () => {
    for (const order of [
      ['A', 'B'],
      ['A', 'A', 'B'],
      ['A', 'B', 'C', 'D'],
    ]) {
      expect(
        errorFrom(() => checkWidgetAnswer(rank, { order })),
      ).toBeInstanceOf(ValidationError);
    }
  });

  it('refuses a choice answer', () => {
    expect(
      (
        errorFrom(() =>
          checkWidgetAnswer(rank, { selected: ['A'] }),
        ) as ValidationError
      ).fieldErrors,
    ).toEqual({ answer: 'This answer does not fit a rank Widget.' });
  });
});

describe('Checking a scale answer', () => {
  const scale: Widget = {
    kind: 'scale',
    prompt: 'How much?',
    items: ['A', 'B'],
    min: 1,
    max: 5,
  };

  it('takes a value per item within min and max, in the order of the items', () => {
    expect(
      checkWidgetAnswer(scale, {
        values: [
          { item: 'B', value: 5 },
          { item: 'A', value: 1 },
        ],
      }),
    ).toEqual({
      values: [
        { item: 'A', value: 1 },
        { item: 'B', value: 5 },
      ],
    });
  });

  it('refuses a value out of range, a missing item, or an unknown one', () => {
    for (const values of [
      [
        { item: 'A', value: 0 },
        { item: 'B', value: 3 },
      ],
      [{ item: 'A', value: 3 }],
      [
        { item: 'A', value: 3 },
        { item: 'B', value: 3 },
        { item: 'C', value: 3 },
      ],
      [
        { item: 'A', value: 'high' },
        { item: 'B', value: 3 },
      ],
    ]) {
      expect(
        errorFrom(() => checkWidgetAnswer(scale, { values })),
      ).toBeInstanceOf(ValidationError);
    }
  });
});

describe('Checking a matrix answer', () => {
  const matrix: Widget = {
    kind: 'matrix',
    prompt: 'Place these',
    items: ['A', 'B'],
    xAxis: { low: 'Cheap', high: 'Costly' },
    yAxis: { low: 'Small', high: 'Big' },
  };

  it('takes a position per item and derives each quadrant, x first, whatever the answer says', () => {
    expect(
      checkWidgetAnswer(matrix, {
        positions: [
          { item: 'B', x: 0.9, y: 0.1, quadrant: 'low-low' },
          { item: 'A', x: 0.2, y: 0.5 },
        ],
      }),
    ).toEqual({
      positions: [
        { item: 'A', x: 0.2, y: 0.5, quadrant: 'low-high' },
        { item: 'B', x: 0.9, y: 0.1, quadrant: 'high-low' },
      ],
    });
  });

  it('refuses a position outside 0..1, a missing item or an unknown one', () => {
    for (const positions of [
      [
        { item: 'A', x: 1.2, y: 0 },
        { item: 'B', x: 0, y: 0 },
      ],
      [{ item: 'A', x: 0, y: 0 }],
      [
        { item: 'A', x: 0, y: 0 },
        { item: 'C', x: 0, y: 0 },
      ],
    ]) {
      expect(
        errorFrom(() => checkWidgetAnswer(matrix, { positions })),
      ).toBeInstanceOf(ValidationError);
    }
  });
});
