import { appConversations } from '../conversations/app-conversations';
import { appDatabase, appTickets } from '../tickets/app-tickets';
import { appChangeChannel } from '../tickets/changes';
import { createSpars, type Spars } from './spars';

const globalKey = Symbol.for('ticket.spars');
type GlobalWithSpars = typeof globalThis & { [globalKey]?: Spars };

/**
 * The Spars module the app uses, over the app's Conversations module. It
 * lives on `globalThis`, so Server Actions share it and dev-mode reloads keep
 * it. Only Server Actions, pages and the MCP route's Spar tools call it.
 */
export function appSpars(): Spars {
  const global = globalThis as GlobalWithSpars;
  global[globalKey] ??= createSpars({
    db: appDatabase(),
    tickets: appTickets('user'),
    conversations: appConversations(),
    changes: appChangeChannel(),
  });
  return global[globalKey];
}
