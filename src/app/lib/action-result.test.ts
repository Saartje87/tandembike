import { describe, expect, it } from 'vitest';

import { fieldRefusal, rootRefusal } from './action-result';

const brokeTitle = {
  ok: false,
  error: 'Enter a title. Keep the description short.',
  fieldErrors: {
    title: 'Enter a title.',
    description: 'Keep the description short.',
  },
} as const;

describe('fieldRefusal', () => {
  it('is nothing when the action succeeded', () => {
    expect(fieldRefusal({ ok: true }, 'title')).toBeUndefined();
  });

  it("is the named field's reason when the input broke its rule", () => {
    expect(fieldRefusal(brokeTitle, 'title')).toBe('Enter a title.');
  });

  it('is nothing when the refusal does not name the field', () => {
    expect(fieldRefusal(brokeTitle, 'name')).toBeUndefined();
    expect(
      fieldRefusal({ ok: false, error: 'There is no Ticket T42.' }, 'title'),
    ).toBeUndefined();
  });
});

describe('rootRefusal', () => {
  it('is nothing when the action succeeded', () => {
    expect(rootRefusal({ ok: true })).toBeUndefined();
  });

  it("is the action's error, whether or not it names a field", () => {
    expect(rootRefusal({ ok: false, error: 'There is no Ticket T42.' })).toBe(
      'There is no Ticket T42.',
    );
    expect(rootRefusal(brokeTitle)).toBe(
      'Enter a title. Keep the description short.',
    );
  });
});
