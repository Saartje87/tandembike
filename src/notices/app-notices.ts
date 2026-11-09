import { appConversations } from '../conversations/app-conversations';
import { appTickets } from '../tickets/app-tickets';
import { appChangeChannel } from '../tickets/changes';
import { createNotices, type Notices } from './notices';

const globalKey = Symbol.for('ticket.notices');
type GlobalWithNotices = typeof globalThis & {
  [globalKey]?: Notices;
};

/**
 * Starts the app's Notices, once per server, as Autopilot is started: the
 * instance lives on `globalThis`, so dev-mode reloads do not start a second
 * one (ADR 0042).
 */
export function startAppNotices(): void {
  const global = globalThis as GlobalWithNotices;
  if (global[globalKey]) {
    return;
  }
  const notices = createNotices({
    conversations: appConversations(),
    tickets: appTickets('agent'),
    changes: appChangeChannel(),
  });
  global[globalKey] = notices;
  notices.start();
}
