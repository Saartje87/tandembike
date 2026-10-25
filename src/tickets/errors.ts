/**
 * Base class for every error the Tickets module throws on purpose. The
 * message is written for people (the User and Agents) and can be shown as-is.
 */
export class TicketsError extends Error {
  override name = 'TicketsError';
}

export type FieldErrors = Record<string, string>;

/** A Ticket a batch left unchanged, and the message saying why. */
export type BatchFailure = { number: number; error: string };

/** The input broke one or more rules; `fieldErrors` says which and why. */
export class ValidationError extends TicketsError {
  override name = 'ValidationError';
  readonly fieldErrors: FieldErrors;

  constructor(fieldErrors: FieldErrors) {
    super(Object.values(fieldErrors).join(' '));
    this.fieldErrors = fieldErrors;
  }
}

/** Another Project already has this name, ignoring case and spaces. */
export class NameTakenError extends TicketsError {
  override name = 'NameTakenError';

  constructor(name: string) {
    super(`A Project named "${name}" already exists. Choose another name.`);
  }
}

/** The Project or Ticket asked for does not exist. */
export class NotFoundError extends TicketsError {
  override name = 'NotFoundError';
}

/** The caller may not make this change, such as an Agent editing the User's comment. */
export class NotAllowedError extends TicketsError {
  override name = 'NotAllowedError';
}
