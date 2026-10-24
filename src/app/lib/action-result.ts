import {
  type FieldErrors,
  TicketsError,
  ValidationError,
} from '../../tickets/errors';

/**
 * What a Server Action returns to the UI: `ok` with the action's data, or
 * the Tickets module's message as `error`, with `fieldErrors` when the input
 * broke a rule.
 */
export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: FieldErrors };

/**
 * Runs a Server Action's work and wraps it as an `ActionResult`. Domain
 * errors become `{ ok: false }`; anything else is a bug and is rethrown.
 */
export function actionResult<T extends object>(run: () => T): ActionResult<T> {
  try {
    return { ok: true, ...run() };
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
}
