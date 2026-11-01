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
  /** Tickets the Agent created over MCP, by number. */
  | { type: 'created'; numbers: number[] }
  /** The run waits for the User (`true`) or goes on again (`false`). */
  | { type: 'waiting'; waiting: boolean }
  /** The run's process ended; `error` says why when it was not on purpose. */
  | { type: 'exit'; error?: string };

/** A tool the Agent wants to use that needs the User's say-so. */
export type PermissionRequest = {
  toolName: string;
  input: Record<string, unknown>;
  /**
   * Allow rules the run proposes for this request, in Claude Code's rule
   * syntax (`Tool` or `Tool(pattern)`); empty when it proposes none.
   */
  rules: string[];
};

/**
 * `allow-always` also saves the request's `rules`, so the run need not ask
 * again. It is only a valid answer to a request that has rules.
 */
export type PermissionAnswer = 'allow' | 'allow-always' | 'deny';

/** One question of the Agent's AskUserQuestion, with its choices. */
export type Question = {
  question: string;
  /** A very short label for the question. */
  header: string;
  options: { label: string; description: string }[];
  /** Whether several choices may be picked. */
  multiSelect: boolean;
};

/** The User's answers, by question text; several choices are comma-separated. */
export type QuestionAnswers = Record<string, string>;

export type RunOptions = {
  /**
   * Asks the User whether the Agent may use a tool; the run waits for the
   * answer. Resolves `deny` when the Conversation ends first.
   */
  askPermission(request: PermissionRequest): Promise<PermissionAnswer>;
  /**
   * Asks the User the Agent's questions; the run waits for the answers.
   * Resolves empty when the Conversation ends first.
   */
  askQuestion(questions: Question[]): Promise<QuestionAnswers>;
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
