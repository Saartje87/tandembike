import { refresh } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appTickets } from '../../tickets/app-tickets';
import {
  NameTakenError,
  NotFoundError,
  ValidationError,
} from '../../tickets/errors';
import { userAction } from './user-action';

vi.mock('next/cache', () => ({ refresh: vi.fn() }));

const usersTickets = vi.hoisted(() => ({ actor: 'user' }));
vi.mock('../../tickets/app-tickets', () => ({
  appTickets: vi.fn(() => usersTickets),
}));

beforeEach(() => {
  vi.mocked(refresh).mockReset();
  vi.mocked(appTickets).mockClear();
});

describe('userAction', () => {
  it("runs the work with the User's Tickets module", () => {
    let given: unknown;
    userAction((tickets) => {
      given = tickets;
      return {};
    });

    expect(appTickets).toHaveBeenCalledWith('user');
    expect(given).toBe(usersTickets);
  });

  it('returns what the work returns, marked ok, and refreshes the page', () => {
    expect(userAction(() => ({ number: 7 }))).toEqual({ ok: true, number: 7 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("returns a domain error's message and does not refresh", () => {
    expect(
      userAction(() => {
        throw new NotFoundError('There is no Ticket T42.');
      }),
    ).toEqual({ ok: false, error: 'There is no Ticket T42.' });
    expect(
      userAction(() => {
        throw new NameTakenError('Website');
      }),
    ).toEqual({
      ok: false,
      error: 'A Project named "Website" already exists. Choose another name.',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns a validation error's message with its field errors and does not refresh", () => {
    expect(
      userAction(() => {
        throw new ValidationError({ title: 'Give the Ticket a title.' });
      }),
    ).toEqual({
      ok: false,
      error: 'Give the Ticket a title.',
      fieldErrors: { title: 'Give the Ticket a title.' },
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rethrows anything else, since it is a bug, and does not refresh', () => {
    const bug = new TypeError('oops');

    expect(() =>
      userAction(() => {
        throw bug;
      }),
    ).toThrow(bug);
    expect(refresh).not.toHaveBeenCalled();
  });
});
