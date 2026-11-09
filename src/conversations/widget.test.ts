// @vitest-environment node

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
