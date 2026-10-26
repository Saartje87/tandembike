import { asc, eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { type commentAuthors, ticketActivity } from '../db/schema';
import type { ActivityChange } from './activity-change';

/**
 * Who made a change, set by where the call came from: Server Actions act as
 * `user`, MCP as `agent`, as for Comments (ADR 0009).
 */
export type Actor = (typeof commentAuthors)[number];

/** One action on a Ticket: who took it, when, and every change it made. */
export type ActivityEntry = {
  id: number;
  ticketNumber: number;
  actor: Actor;
  /** In the order they were made; never empty. */
  changes: ActivityChange[];
  createdAt: Date;
};

const activityColumns = {
  id: ticketActivity.id,
  ticketNumber: ticketActivity.ticketNumber,
  actor: ticketActivity.actor,
  changes: ticketActivity.changes,
  createdAt: ticketActivity.createdAt,
};

/**
 * Writes one Activity entry on Ticket `number` listing `changes`, or nothing
 * when there are none: an action that changes nothing leaves no trace. Run it
 * in the transaction that makes the changes.
 */
export function recordActivity(
  db: DatabaseConnection,
  number: number,
  actor: Actor,
  changes: readonly ActivityChange[],
) {
  if (changes.length === 0) {
    return;
  }
  db.insert(ticketActivity)
    .values({
      ticketNumber: number,
      actor,
      changes: [...changes],
      createdAt: new Date(),
    })
    .run();
}

/** Ticket `number`'s Activity entries, oldest first. */
export function activityOf(
  db: DatabaseConnection,
  number: number,
): ActivityEntry[] {
  return db
    .select(activityColumns)
    .from(ticketActivity)
    .where(eq(ticketActivity.ticketNumber, number))
    .orderBy(asc(ticketActivity.id))
    .all();
}

/** Deletes Ticket `number`'s Activity, for deleting the Ticket. */
export function deleteActivity(db: DatabaseConnection, number: number) {
  db.delete(ticketActivity)
    .where(eq(ticketActivity.ticketNumber, number))
    .run();
}
