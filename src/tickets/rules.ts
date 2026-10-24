import { type FieldErrors, ValidationError } from './errors';

export const maxTitleLength = 200;

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
