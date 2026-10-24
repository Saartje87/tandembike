import {
  appDatabasePath,
  type DatabaseConnection,
  openDatabase,
} from '../db/connection';
import { appChangeChannel } from './changes';
import { createTickets, type Tickets } from './tickets';

const globalKey = Symbol.for('ticket.database');
type GlobalWithDatabase = typeof globalThis & {
  [globalKey]?: DatabaseConnection;
};

/**
 * The Tickets module the app uses: the real database file (created and
 * migrated on first use) and the app-wide change channel. The connection is
 * held on `globalThis` so dev-mode reloads reuse it.
 */
export function appTickets(): Tickets {
  const global = globalThis as GlobalWithDatabase;
  global[globalKey] ??= openDatabase(appDatabasePath);
  return createTickets(global[globalKey], appChangeChannel());
}
