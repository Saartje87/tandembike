/**
 * The seam between Conversations and the Agent that does the work (ADR 0019).
 * Only `claude-runner.ts` knows the Claude Agent SDK; tests use a fake.
 */

/** What a run reports while it works. */
export type RunEvent =
  /** The run's SDK session, which a later reply resumes. */
  | { type: 'session'; sessionId: string }
  /** Something the Agent said. */
  | { type: 'agent'; text: string }
  /** A tool the Agent used, in one line. */
  | { type: 'tool'; text: string }
  /**
   * A turn ended. `costUsd` is what this run has cost in total so far, not
   * counting earlier runs of the Conversation.
   */
  | { type: 'turn'; costUsd: number; error?: string }
  /** The run waits for the User (`true`) or goes on again (`false`). */
  | { type: 'waiting'; waiting: boolean }
  /** The run's process ended; `error` says why when it was not on purpose. */
  | { type: 'exit'; error?: string };

export type RunOptions = {
  /** The Project's repository path. */
  cwd: string;
  /** The Tandembike MCP server the run connects to. */
  mcpUrl: string;
  /** Appended to the Agent's own system prompt: only its situation. */
  systemPrompt: string;
  /** The User's first message of this run. */
  prompt: string;
  /** The SDK session to continue, for a Conversation that was interrupted. */
  resume?: string;
  onEvent(event: RunEvent): void;
};

export type AgentRun = {
  /** Puts a User message into the running Agent. */
  send(text: string): void;
  /** Stops the turn in progress. */
  interrupt(): Promise<void>;
  /** Ends the run and its process. */
  close(): void;
};

export type AgentRunner = {
  start(options: RunOptions): AgentRun;
};
