import { describe, expect, it } from 'vitest';

import {
  NameTakenError,
  NotFoundError,
  ValidationError,
} from '../../tickets/errors';
import { actionResult, fieldRefusal, rootRefusal } from './action-result';

describe('actionResult', () => {
  it('returns what the call returns, marked ok', () => {
    expect(actionResult(() => ({ number: 7 }))).toEqual({
      ok: true,
      number: 7,
    });
  });

  it("returns a domain error's message", () => {
    expect(
      actionResult(() => {
        throw new NotFoundError('There is no Ticket T42.');
      }),
    ).toEqual({ ok: false, error: 'There is no Ticket T42.' });
    expect(
      actionResult(() => {
        throw new NameTakenError('Website');
      }),
    ).toEqual({
      ok: false,
      error: 'A Project named "Website" already exists. Choose another name.',
    });
  });

  it("returns a validation error's message with its field errors", () => {
    expect(
      actionResult(() => {
        throw new ValidationError({ title: 'Give the Ticket a title.' });
      }),
    ).toEqual({
      ok: false,
      error: 'Give the Ticket a title.',
      fieldErrors: { title: 'Give the Ticket a title.' },
    });
  });

  it('rethrows anything else, since it is a bug', () => {
    const bug = new TypeError('oops');

    expect(() =>
      actionResult(() => {
        throw bug;
      }),
    ).toThrow(bug);
  });
});

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
