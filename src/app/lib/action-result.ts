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
 * Why a Server Action refused `field`'s input: the reason for that field when
 * the input broke its rule. Nothing when the action succeeded or refused for
 * another reason. Show it with `setError(field, …)` (AGENTS.md, Forms).
 */
export function fieldRefusal(
  result: ActionResult,
  field: string,
): string | undefined {
  return result.ok ? undefined : result.fieldErrors?.[field];
}

/**
 * Why a Server Action refused, as a whole: its error, which also holds every
 * field's reason. Nothing when it succeeded. Show it on `'root.server'`, or
 * as the one reason of a control that shows a single one, after
 * `fieldRefusal` (`fieldRefusal(result, field) ?? rootRefusal(result)`).
 */
export function rootRefusal(result: ActionResult): string | undefined {
  return result.ok ? undefined : result.error;
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
