import { asc, eq, inArray } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { tickets } from '../db/schema';
import { NotFoundError } from './errors';
import { throwFieldErrors } from './rules';
import type { Status } from './status';

/** The Ticket another was split from (ADR 0015). */
export type OriginLink = { number: number; title: string; status: Status };

/** A Ticket split from an Origin, as that Origin lists it. */
export type SplitOffTicket = OriginLink & { archived: boolean };

/**
 * Throws unless Ticket `originNumber` may be the Origin of Ticket `number`,
 * or of a new Ticket when `number` is left out: it exists, and the Origin
 * chain would not loop. Run it in the transaction that sets it.
 */
export function checkOrigin(
  db: DatabaseConnection,
  originNumber: number,
  number?: number,
) {
  throwFieldErrors({
    originNumber:
      originNumber === number
        ? 'A Ticket cannot be its own Origin.'
        : undefined,
  });
  const chain = originChain(db, originNumber);
  if (chain.length === 0) {
    throw new NotFoundError(
      `There is no Ticket T${originNumber} to be the Origin.`,
    );
  }
  const loop = number === undefined ? -1 : chain.indexOf(number);
  if (loop !== -1) {
    const path = chain
      .slice(0, loop + 1)
      .reverse()
      .map((link) => `T${link}`)
      .join(' → ');
    throwFieldErrors({
      originNumber: `T${originNumber} cannot be the Origin of T${number}, because T${number} is already an Origin of T${originNumber}: ${path}.`,
    });
  }
}

/**
 * Ticket `number` and its Origin, that Origin's Origin and so on, or an
 * empty list when there is no Ticket `number`.
 */
function originChain(db: DatabaseConnection, number: number): number[] {
  const chain: number[] = [];
  for (let at: number | null = number; at !== null && !chain.includes(at); ) {
    const ticket = db
      .select({ originNumber: tickets.originNumber })
      .from(tickets)
      .where(eq(tickets.number, at))
      .get();
    if (!ticket) {
      break;
    }
    chain.push(at);
    at = ticket.originNumber;
  }
  return chain;
}

/**
 * `rows` with each Ticket's Origin and the Tickets split from it, archived
 * ones included, by Ticket number.
 */
export function withOrigins<
  Row extends { number: number; originNumber: number | null },
>(
  db: DatabaseConnection,
  rows: Row[],
): (Omit<Row, 'originNumber'> & {
  origin: OriginLink | null;
  splitOff: SplitOffTicket[];
})[] {
  const originNumbers = [
    ...new Set(rows.flatMap(({ originNumber }) => originNumber ?? [])),
  ];
  const origins = new Map(
    originNumbers.length === 0
      ? []
      : db
          .select({
            number: tickets.number,
            title: tickets.title,
            status: tickets.status,
          })
          .from(tickets)
          .where(inArray(tickets.number, originNumbers))
          .all()
          .map((origin) => [origin.number, origin]),
  );
  const splitOffByNumber = new Map<number, SplitOffTicket[]>(
    rows.map((row) => [row.number, []]),
  );
  if (rows.length > 0) {
    const splitRows = db
      .select({
        originNumber: tickets.originNumber,
        number: tickets.number,
        title: tickets.title,
        status: tickets.status,
        archived: tickets.archived,
      })
      .from(tickets)
      .where(inArray(tickets.originNumber, [...splitOffByNumber.keys()]))
      .orderBy(asc(tickets.number))
      .all();
    for (const { originNumber, ...split } of splitRows) {
      if (originNumber !== null) {
        splitOffByNumber.get(originNumber)?.push(split);
      }
    }
  }
  return rows.map(({ originNumber, ...row }) => ({
    ...row,
    origin: originNumber === null ? null : (origins.get(originNumber) ?? null),
    splitOff: splitOffByNumber.get(row.number) ?? [],
  }));
}
