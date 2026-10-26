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
 * Why a Server Action refused, for a field that shows it: the reason for
 * `field` when the input broke its rule, else the action's error. Nothing
 * when the action succeeded.
 */
export function refusalReason(
  result: ActionResult,
  field?: string,
): string | undefined {
  if (result.ok) {
    return undefined;
  }
  return (
    (field === undefined ? undefined : result.fieldErrors?.[field]) ??
    result.error
  );
}

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
