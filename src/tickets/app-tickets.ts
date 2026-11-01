import {
  appDatabasePath,
  type DatabaseConnection,
  openDatabase,
} from '../db/connection';
import type { Actor } from './activity';
import { appChangeChannel } from './changes';
import { createTickets, type Tickets } from './tickets';

const globalKey = Symbol.for('ticket.database');
type GlobalWithDatabase = typeof globalThis & {
  [globalKey]?: DatabaseConnection;
};

/** The app's database connection, opened and migrated on first use. */
export function appDatabase(): DatabaseConnection {
  const global = globalThis as GlobalWithDatabase;
  global[globalKey] ??= openDatabase(appDatabasePath);
  return global[globalKey];
}

/**
 * The Tickets module the app uses: the real database file (created and
 * migrated on first use) and the app-wide change channel. The connection is
 * held on `globalThis` so dev-mode reloads reuse it. Its changes are
 * recorded as Activity by `actor`: Server Actions and pages pass `user`, the
 * MCP route `agent`.
 */
export function appTickets(actor: Actor): Tickets {
  return createTickets(appDatabase(), actor, appChangeChannel());
}
