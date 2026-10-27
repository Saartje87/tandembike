import { and, asc, eq, exists, inArray } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { ticketExternalReferences, tickets } from '../db/schema';
import type { ActivityChange } from './activity-change';
import { hasScheme, httpUrl } from './external-reference-display';
import { throwFieldErrors } from './rules';

export const maxExternalReferences = 50;

export const maxExternalReferenceKeyLength = 100;

export const maxExternalReferenceUrlLength = 2000;

/**
 * Whether trimmed `reference` is an absolute http(s) URL or, without a
 * scheme, a key: either way one token without spaces.
 */
function isExternalReference(reference: string): boolean {
  if (/\s/.test(reference)) {
    return false;
  }
  if (!hasScheme(reference)) {
    return reference.length <= maxExternalReferenceKeyLength;
  }
  return (
    reference.length <= maxExternalReferenceUrlLength &&
    httpUrl(reference) !== null
  );
}

/** Why one of the normalized `references` breaks the rules, if any does. */
export function checkExternalReferences(
  references: readonly string[],
): string | undefined {
  for (const reference of references) {
    if (reference === '') {
      return 'Enter a URL or key for each External reference.';
    }
    if (!isExternalReference(reference)) {
      return `"${reference}" is not a valid URL or key. Give an http(s) URL of at most ${maxExternalReferenceUrlLength.toLocaleString('en-US')} characters, or a key without spaces of at most ${maxExternalReferenceKeyLength} characters, such as #55 or ABC-33.`;
    }
  }
  return undefined;
}

/**
 * Why normalized `references` to find Tickets by break the rules, if they
 * do. Their format is not checked: one no Ticket could have just matches none.
 */
export function checkExternalReferencesFilter(
  references: readonly string[],
): string | undefined {
  if (references.length === 0) {
    return 'Enter a URL or key to find Tickets by, or leave externalReferences out.';
  }
  return references.includes('')
    ? 'Enter a URL or key for each External reference to find Tickets by.'
    : undefined;
}

/** Why a new Ticket's normalized `references` break the rules, if they do. */
export function checkNewExternalReferences(
  references: readonly string[],
): string | undefined {
  return references.length > maxExternalReferences
    ? `A Ticket can have at most ${maxExternalReferences} External references.`
    : checkExternalReferences(references);
}

/** External references as they are stored: trimmed and each once, in order. */
export function normalizeExternalReferences(
  references: readonly string[],
): string[] {
  return [...new Set(references.map((reference) => reference.trim()))];
}

/**
 * Normalized `references` for adding or removing, at least one, or a
 * `ValidationError`.
 */
export function checkedExternalReferences(
  references: readonly string[],
): string[] {
  const normalized = normalizeExternalReferences(references);
  throwFieldErrors({
    externalReferences:
      normalized.length === 0
        ? 'Enter a URL or key for each External reference.'
        : checkExternalReferences(normalized),
  });
  return normalized;
}

/**
 * Throws unless Ticket `number` has at most `maxExternalReferences`. Run it
 * in the transaction that adds them, after adding.
 */
export function checkExternalReferenceCount(
  db: DatabaseConnection,
  number: number,
) {
  const count = externalReferencesOf(db, number).length;
  throwFieldErrors({
    externalReferences:
      count > maxExternalReferences
        ? `Ticket T${number} would have ${count} External references; a Ticket can have at most ${maxExternalReferences}. Remove some first.`
        : undefined,
  });
}

/**
 * The Activity changes of removing `removed` references and adding `added`
 * ones to a Ticket that had `before`: only the ones that really change.
 */
export function externalReferenceChanges(
  before: readonly string[],
  { added = [], removed = [] }: { added?: string[]; removed?: string[] },
): ActivityChange[] {
  return [
    ...removed
      .filter((reference) => before.includes(reference))
      .map((reference) => ({
        type: 'externalReferenceRemoved' as const,
        reference,
      })),
    ...added
      .filter((reference) => !before.includes(reference))
      .map((reference) => ({
        type: 'externalReferenceAdded' as const,
        reference,
      })),
  ];
}

/** Ticket `number`'s External references, in the order they were added. */
export function externalReferencesOf(
  db: DatabaseConnection,
  number: number,
): string[] {
  return withExternalReferences(db, [{ number }])[0].externalReferences;
}

/** Adds `references` to Ticket `number`, skipping ones it already has. */
export function insertExternalReferences(
  db: DatabaseConnection,
  number: number,
  references: readonly string[],
) {
  if (references.length === 0) {
    return;
  }
  db.insert(ticketExternalReferences)
    .values(
      references.map((reference) => ({ ticketNumber: number, reference })),
    )
    .onConflictDoNothing()
    .run();
}

/** Removes `references` from Ticket `number`, or all of them when left out. */
export function deleteExternalReferences(
  db: DatabaseConnection,
  number: number,
  references?: readonly string[],
) {
  if (references?.length === 0) {
    return;
  }
  db.delete(ticketExternalReferences)
    .where(
      and(
        eq(ticketExternalReferences.ticketNumber, number),
        references === undefined
          ? undefined
          : inArray(ticketExternalReferences.reference, [...references]),
      ),
    )
    .run();
}

/**
 * The condition for Tickets with at least one of the normalized
 * `references`, matched exactly.
 */
export function withAnyExternalReference(
  db: DatabaseConnection,
  references: string[],
) {
  return exists(
    db
      .select({ number: ticketExternalReferences.ticketNumber })
      .from(ticketExternalReferences)
      .where(
        and(
          eq(ticketExternalReferences.ticketNumber, tickets.number),
          inArray(ticketExternalReferences.reference, references),
        ),
      ),
  );
}

/** `rows` with each Ticket's External references in order, in one query. */
export function withExternalReferences<Row extends { number: number }>(
  db: DatabaseConnection,
  rows: Row[],
): (Row & { externalReferences: string[] })[] {
  const byNumber = new Map<number, string[]>(
    rows.map((row) => [row.number, []]),
  );
  if (rows.length > 0) {
    const referenceRows = db
      .select({
        number: ticketExternalReferences.ticketNumber,
        reference: ticketExternalReferences.reference,
      })
      .from(ticketExternalReferences)
      .where(
        inArray(ticketExternalReferences.ticketNumber, [...byNumber.keys()]),
      )
      .orderBy(asc(ticketExternalReferences.id))
      .all();
    for (const { number, reference } of referenceRows) {
      byNumber.get(number)?.push(reference);
    }
  }
  return rows.map((row) => ({
    ...row,
    externalReferences: byNumber.get(row.number) ?? [],
  }));
}
