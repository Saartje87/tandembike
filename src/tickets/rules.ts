import {
  type FieldErrors,
  NotAllowedError,
  TicketsError,
  ValidationError,
} from './errors';

export const maxTitleLength = 200;

/** The most Tickets one batch call may create or change. */
export const maxBatchSize = 50;

/**
 * Why a trimmed title, of a Ticket or a Cycle, breaks the rules, or
 * `undefined` when it is fine.
 */
export function checkTitle(title: string): string | undefined {
  if (title === '') {
    return 'Enter a title.';
  }
  if (/[\r\n]/.test(title)) {
    return 'Keep the title to one line.';
  }
  if (title.length > maxTitleLength) {
    return `Keep the title to ${maxTitleLength} characters or fewer.`;
  }
  return undefined;
}

/** Throws a `ValidationError` naming every field with a reason, if any. */
export function throwFieldErrors(reasons: Record<string, string | undefined>) {
  const fieldErrors: FieldErrors = {};
  for (const [field, reason] of Object.entries(reasons)) {
    if (reason) {
      fieldErrors[field] = reason;
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError(fieldErrors);
  }
}

/** Why `ticketNumbers` is not a valid batch, if it is not. */
export function checkBatchNumbers(ticketNumbers: readonly number[]) {
  if (ticketNumbers.length === 0) {
    return 'Choose at least one Ticket.';
  }
  if (ticketNumbers.length > maxBatchSize) {
    return `Choose at most ${maxBatchSize} Tickets at a time.`;
  }
  const duplicate = ticketNumbers.find(
    (number, index) => ticketNumbers.indexOf(number) !== index,
  );
  if (duplicate !== undefined) {
    return `Choose each Ticket once: T${duplicate} is given twice.`;
  }
  return undefined;
}

/**
 * `step` for each of `ticketNumbers`, in order, all or nothing: it goes on
 * past a Ticket `step` refuses, so that one error names every refused
 * Ticket and why. Run it in the transaction that makes the change, which
 * the error then rolls back. Returns what `step` returned for each.
 */
export function eachOrNone<Result>(
  ticketNumbers: readonly number[],
  step: (number: number) => Result,
): Result[] {
  const results: Result[] = [];
  const refusals: TicketsError[] = [];
  for (const number of ticketNumbers) {
    try {
      results.push(step(number));
    } catch (error) {
      if (!(error instanceof TicketsError)) {
        throw error;
      }
      refusals.push(error);
    }
  }
  if (refusals.length === 1) {
    throw refusals[0];
  }
  if (refusals.length > 1) {
    throw new NotAllowedError(
      refusals.map((refusal) => refusal.message).join(' '),
    );
  }
  return results;
}
