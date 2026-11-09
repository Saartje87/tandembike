/** Where an error keeps the kinds of its class and every base class. */
const kindsKey = Symbol.for('ticket.errors.kinds');

/**
 * Base class for every error the Tickets module throws on purpose. The
 * message is written for people (the User and Agents) and can be shown as-is.
 *
 * `instanceof` matches by each class's `kind`, not by identity: Next bundles
 * one copy of this module for instrumentation (Autopilot, which creates the
 * shared Conversations module) and another for Server Actions, and an error
 * thrown by one copy must still be caught as a refusal by the other (T1185).
 * Every subclass declares its own `kind`.
 */
export class TicketsError extends Error {
  static readonly kind: string = 'TicketsError';
  override name = 'TicketsError';
  readonly [kindsKey]: string[];

  constructor(message?: string) {
    super(message);
    const kinds: string[] = [];
    for (
      let type: unknown = new.target;
      typeof type === 'function' && type !== Error;
      type = Object.getPrototypeOf(type)
    ) {
      const { kind } = type as { kind?: unknown };
      if (typeof kind === 'string') {
        kinds.push(kind);
      }
    }
    this[kindsKey] = kinds;
  }

  static [Symbol.hasInstance](value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const kinds = (value as { [kindsKey]?: unknown })[kindsKey];
    // biome-ignore lint/complexity/noThisInStatic: `this` is the subclass on the right of `instanceof`.
    return Array.isArray(kinds) && kinds.includes(this.kind);
  }
}

export type FieldErrors = Record<string, string>;

/** A Ticket a batch left unchanged, and the message saying why. */
export type BatchFailure = { number: number; error: string };

/** The input broke one or more rules; `fieldErrors` says which and why. */
export class ValidationError extends TicketsError {
  static override readonly kind = 'ValidationError';
  override name = 'ValidationError';
  readonly fieldErrors: FieldErrors;

  constructor(fieldErrors: FieldErrors) {
    super(Object.values(fieldErrors).join(' '));
    this.fieldErrors = fieldErrors;
  }
}

/** Another Project already has this name, ignoring case and spaces. */
export class NameTakenError extends TicketsError {
  static override readonly kind = 'NameTakenError';
  override name = 'NameTakenError';

  constructor(name: string) {
    super(`A Project named "${name}" already exists. Choose another name.`);
  }
}

/** The Project or Ticket asked for does not exist. */
export class NotFoundError extends TicketsError {
  static override readonly kind = 'NotFoundError';
  override name = 'NotFoundError';
}

/** The caller may not make this change, such as an Agent editing the User's comment. */
export class NotAllowedError extends TicketsError {
  // Widened so a subclass, such as UncheckedCriteriaError, declares its own.
  static override readonly kind: string = 'NotAllowedError';
  override name = 'NotAllowedError';
}

/** One acceptance criterion left unchecked, and the Ticket it belongs to. */
export type UncheckedCriterion = { number: number; text: string };

/**
 * The completion rule refused: acceptance criteria are unchecked (ADR 0043).
 * `unchecked` lists each with its Ticket, in Ticket order.
 */
export class UncheckedCriteriaError extends NotAllowedError {
  static override readonly kind = 'UncheckedCriteriaError';
  override name = 'UncheckedCriteriaError';
  readonly unchecked: UncheckedCriterion[];

  constructor(unchecked: UncheckedCriterion[]) {
    super(
      `Acceptance criteria are unchecked: ${formatUnchecked(unchecked)}. Check them with check_criterion, or give an override reason to finish anyway.`,
    );
    this.unchecked = unchecked;
  }
}

/** `unchecked` as one line: `T42: text; T43: text`. */
export function formatUnchecked(unchecked: UncheckedCriterion[]): string {
  return unchecked.map(({ number, text }) => `T${number}: ${text}`).join('; ');
}
