import { describe, expect, it } from 'vitest';

import {
  NameTakenError,
  NotFoundError,
  ValidationError,
} from '../../tickets/errors';
import { actionResult } from './action-result';

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
