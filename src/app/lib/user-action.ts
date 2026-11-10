import { refresh } from 'next/cache';

import { appTickets } from '../../tickets/app-tickets';
import { TicketsError, ValidationError } from '../../tickets/errors';
import type { Tickets } from '../../tickets/tickets';
import type { ActionResult } from './action-result';

/**
 * Runs a Server Action's work as the User and wraps it as an
 * `ActionResult`. `run` gets the Tickets module with the User as actor.
 * Domain errors become `{ ok: false }`; anything else is a bug and is
 * rethrown. Only a success refreshes the page the action came from, with
 * `refresh()`: nothing in the app is cached, so no action names paths to
 * revalidate, and every other open tab refreshes on the change event.
 */
export function userAction<T extends object>(
  run: (tickets: Tickets) => T,
): ActionResult<T> {
  let data: T;
  try {
    data = run(appTickets('user'));
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.fieldErrors,
      };
    }
    if (error instanceof TicketsError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  refresh();
  return { ok: true, ...data };
}
