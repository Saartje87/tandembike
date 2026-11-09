/**
 * What the CLI (`src/install/`) and the server share about Terminal
 * Conversations (ADR 0039). Pure: no server or database code, so the CLI
 * imports it cheaply.
 */

/** The Stages `tandembike` opens in a terminal. */
export const terminalIntents = ['start', 'triage', 'spec'] as const;
export type TerminalIntent = (typeof terminalIntents)[number];

export const isTerminalIntent = (text: string): text is TerminalIntent =>
  (terminalIntents as readonly string[]).includes(text);

/** How often the CLI tells the server its session is alive. */
export const terminalHeartbeatMs = 60 * 1000;

/** How long a Terminal Conversation may be silent before the sweep ends it. */
export const terminalIdleMs = 5 * 60 * 1000;

/** How often the server looks for Terminal Conversations gone quiet. */
export const terminalSweepMs = 60 * 1000;

// The heartbeat must beat the timeout several times over, or a live session
// would be ended as idle between two heartbeats.
if (terminalHeartbeatMs * 2 > terminalIdleMs) {
  throw new Error(
    'The terminal heartbeat must be well under the idle timeout.',
  );
}

/** The idle timeout in words, for the transcript entry. */
export const terminalIdleMinutes = terminalIdleMs / 60000;
