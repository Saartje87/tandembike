import type { UsageByModel } from '../footprint/token-usage';
import type { ProjectAgentCommands } from '../tickets/agent-commands';
import type { AgentKind } from '../tickets/agent-kind';
import type { AgentRunMode } from '../tickets/agent-run-mode';
import type { CostUnit } from '../tickets/cost-unit';
import type { TicketType } from '../tickets/ticket-type';
import type { PermissionAnswer } from './conversation-state';
import type { RetroCycle } from './retro-prompt';
import type { ToolActivity } from './tool-activity';
import type { Widget, WidgetAnswer } from './widget';

/**
 * The seam between Conversations and the Agent that does the work (ADR 0019,
 * ADR 0051): one runner per Agent kind. Only `claude-runner.ts` knows the
 * Claude Agent SDK; tests use a fake per kind.
 */

/** What a run reports while it works. */
export type RunEvent =
  /**
   * The run's SDK session, which a later reply resumes, and the model it
   * runs on, from the SDK's init message.
   */
  | { type: 'session'; sessionId: string; model?: string }
  /** Something the Agent said. */
  | { type: 'agent'; text: string }
  /**
   * A tool the Agent used: `text` is one line for the transcript, `name` and
   * `input` the tool's own name and raw input, and `activity` what it does
   * in the status line's terms, which the runner maps (T1066, ADR 0051).
   */
  | {
      type: 'tool';
      text: string;
      name?: string;
      input?: Record<string, unknown>;
      activity?: ToolActivity;
    }
  /**
   * A turn ended. `cost` is what this run has cost in total so far, not
   * counting earlier runs of the Conversation, in the runner's declared
   * `costUnit` (ADR 0051).
   */
  | {
      type: 'turn';
      cost: number;
      /**
       * The tokens this run has used per model in total so far, like
       * `cost`; left out when the run reports none (ADR 0050).
       */
      usage?: UsageByModel;
      error?: string;
      /**
       * The runner's verdict that `error` is worth resuming once, such as an
       * overload or a network error (ADR 0034, ADR 0051).
       */
      transient?: boolean;
    }
  /** Tickets the Agent created over MCP, by number. */
  | { type: 'created'; numbers: number[] }
  /** The run waits for the User (`true`) or goes on again (`false`). */
  | { type: 'waiting'; waiting: boolean }
  /**
   * The run's process ended; `error` says why when it was not on purpose,
   * and `transient` whether it is worth resuming once (ADR 0034).
   */
  | { type: 'exit'; error?: string; transient?: boolean };

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
export type { PermissionAnswer, Widget, WidgetAnswer };

/**
 * The Stage a run's first message invokes, in Tandembike's terms (ADR 0051):
 * the Stage with its Ticket, Cycle, goal or topic. Each runner turns it into
 * its agent's own invocation of the Playbook skill, such as Claude Code's
 * `/tandembike:implement T42`.
 */
export type StageInvocation =
  | {
      stage: 'triage' | 'start' | 'spec' | 'merge';
      /** Start on an Epic invokes the Epic's skill. */
      ticket: { number: number; type: TicketType };
    }
  | { stage: 'retro'; cycle: RetroCycle }
  | { stage: 'plan'; goal: string }
  | { stage: 'spar'; topic: string | null; focusTicketNumber: number | null };

/**
 * A restriction on a run, in Tandembike's terms: `read-only` for a Spar (ADR
 * 0046), `no-ticket-writes` for Autopilot Triage and Batch triage (ADR 0040,
 * ADR 0047).
 */
export type ToolPolicy = 'read-only' | 'no-ticket-writes';

/** What a run starts with: a Stage to invoke, or the User's text. */
export type RunMessage = { invocation: StageInvocation } | { text: string };

export type RunOptions = {
  /**
   * Asks the User whether the Agent may use a tool; the run waits for the
   * answer. Resolves `deny` when the Conversation ends first.
   */
  askPermission(request: PermissionRequest): Promise<PermissionAnswer>;
  /**
   * Asks the User a Widget (ADR 0045), such as AskUserQuestion's choices or
   * an `ask_choice` call; the run waits for the answer. Resolves
   * `{ expired: true }` when the Conversation ends first.
   */
  askWidget(widget: Widget): Promise<WidgetAnswer>;
  /** The Project's repository path. */
  cwd: string;
  /** The run's Agent-run ID (its Conversation id), sent as `X-Tandembike-Run`. */
  agentRunId: string;
  /** The Tandembike MCP server the run connects to. */
  mcpUrl: string;
  /** Appended to the Agent's own system prompt: only its situation. */
  systemPrompt: string;
  /** The first message of this run: a Stage to invoke, or a reply's text. */
  message: RunMessage;
  /**
   * The Project's agent command overrides (ADR 0051). They are Claude Code
   * commands, so only the Claude runner reads them.
   */
  agentCommands: ProjectAgentCommands;
  /** The plugins every run loads: the Playbook, by local path (ADR 0032). */
  plugins: { type: 'local'; path: string }[];
  /**
   * The permission mode of the run, one its runner declares; `default` when
   * left out (ADR 0029, ADR 0051).
   */
  runMode?: AgentRunMode;
  /** The model to start on; left out for the User's default model. */
  model?: string;
  /**
   * What the run may not do, which its runner turns into its own tool names
   * (ADR 0051); left out for no restriction.
   */
  toolPolicy?: ToolPolicy;
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

/** What a runner can do, which the Conversations module reads (ADR 0051). */
export type RunnerCapabilities = {
  /** The run modes it can honour; a run in another runs in `default`. */
  runModes: readonly AgentRunMode[];
  /** Whether it can honour Allow-always, so the User is offered it. */
  allowAlways: boolean;
  /** The unit its runs report cost in; every `turn` cost is in it. */
  costUnit: CostUnit;
};

/** Whether a runner can start a run now, and why not when it cannot. */
export type RunnerAvailability =
  | { available: true }
  | { available: false; reason: string };

/**
 * One Agent kind's runner (ADR 0051): it turns a run described in
 * Tandembike's terms into its agent's own, and says what it can do.
 */
export type AgentRunner = {
  /** Whether it can run now; Claude Code always can. */
  availability(): RunnerAvailability;
  capabilities: RunnerCapabilities;
  /**
   * The text its first message sends for a Stage, which the transcript
   * records as the starter's message.
   */
  invocationText(
    invocation: StageInvocation,
    agentCommands: ProjectAgentCommands,
  ): string;
  start(options: RunOptions): AgentRun;
};

/** The runners the app registers, by Agent kind; a kind left out cannot run. */
export type AgentRunners = Partial<Record<AgentKind, AgentRunner>>;
