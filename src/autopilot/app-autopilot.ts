import { appConversations } from '../conversations/app-conversations';
import { appTickets } from '../tickets/app-tickets';
import { appChangeChannel } from '../tickets/changes';
import { type Autopilot, createAutopilot } from './autopilot';

const globalKey = Symbol.for('ticket.autopilot');
const startedKey = Symbol.for('ticket.autopilot.started');
type GlobalWithAutopilot = typeof globalThis & {
  [globalKey]?: Autopilot;
  [startedKey]?: boolean;
};

/**
 * The app's Autopilot, one per server: the instance lives on `globalThis`, so
 * dev-mode reloads do not make a second one. Pages read `explain` from it
 * (ADR 0044); only `startAppAutopilot` makes it act.
 */
export function appAutopilot(): Autopilot {
  const global = globalThis as GlobalWithAutopilot;
  global[globalKey] ??= createAutopilot({
    tickets: appTickets('user'),
    conversations: appConversations(),
    changes: appChangeChannel(),
  });
  return global[globalKey];
}

/**
 * Starts the app's Autopilot, once per server. It starts runs in-process
 * through the Conversations module, never through a route handler or an MCP
 * tool (ADR 0019, ADR 0030).
 */
export function startAppAutopilot(): void {
  const global = globalThis as GlobalWithAutopilot;
  if (global[startedKey]) {
    return;
  }
  global[startedKey] = true;
  appAutopilot().start();
}
