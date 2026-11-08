import { appConversations } from '../conversations/app-conversations';
import { appTickets } from '../tickets/app-tickets';
import { appChangeChannel } from '../tickets/changes';
import { type Autopilot, createAutopilot } from './autopilot';

const globalKey = Symbol.for('ticket.autopilot');
type GlobalWithAutopilot = typeof globalThis & {
  [globalKey]?: Autopilot;
};

/**
 * Starts the app's Autopilot, once per server: the instance lives on
 * `globalThis`, so dev-mode reloads do not start a second one. It starts runs
 * in-process through the Conversations module, never through a route handler
 * or an MCP tool (ADR 0019, ADR 0030).
 */
export function startAppAutopilot(): void {
  const global = globalThis as GlobalWithAutopilot;
  if (global[globalKey]) {
    return;
  }
  const autopilot = createAutopilot({
    tickets: appTickets('user'),
    conversations: appConversations(),
    changes: appChangeChannel(),
  });
  global[globalKey] = autopilot;
  autopilot.start();
}
