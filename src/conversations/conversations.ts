import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  or,
  sql,
} from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { conversationEntries, conversations, runOutcomes } from '../db/schema';
import type { UsageByModel } from '../footprint/token-usage';
import { playbookPath } from '../playbook/playbook';
import {
  agentCommandMessage,
  commandForStage,
  planCommandMessage,
} from '../tickets/agent-commands';
import type { ChangeChannel } from '../tickets/changes';
import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';
import { isPullRequestReference } from '../tickets/external-reference-display';
import type { Status } from '../tickets/status';
import { canSpec, isInReview } from '../tickets/ticket-lanes';
import type { TicketType } from '../tickets/ticket-type';
import type { Tickets } from '../tickets/tickets';
import type { NoWorkReason } from '../tickets/work';
import type { KeptWorktreeState, Worktrees } from '../worktrees/worktrees';
import type {
  AgentRun,
  AgentRunner,
  PermissionRequest,
  RunEvent,
} from './agent-runner';
import { batchTriagePrompt } from './batch-triage-prompt';
import {
  type Capacity,
  type CapacityIntent,
  type CapacitySnapshot,
  capacityOf,
  type ProjectCapacity,
  refusalOf,
  verdictOf,
} from './capacity';
import type { ActivityRow } from './conversation-activity';
import {
  type ConversationIntent,
  type ConversationStarter,
  type ConversationState,
  isTerminal,
  type PermissionAnswer,
  type PermissionStatus,
  permissionAnswers,
  permissionStatusOf,
  type QuestionEntry,
  type TranscriptRole,
} from './conversation-state';
import { retroPrompt } from './retro-prompt';
import { type NewTicketDefaults, runBrief } from './run-brief';
import {
  type ConversationSender,
  type LifecycleInput,
  type LiveRun,
  pendingRunOf,
  type RunEffect,
  type StepResult,
  step,
  type TicketFacts,
} from './run-lifecycle';
import { type RunResult, runResults } from './run-outcome';
import { messageRoles, type StatusEntry } from './status-line';
import {
  type TerminalIntent,
  terminalIdleMinutes,
  terminalIdleMs,
} from './terminal-shared';
import {
  readUsage,
  totalUsage,
  type UsageTotal,
  writeUsage,
} from './usage-store';
import {
  checkWidgetAnswer,
  tidyWidget,
  type Widget,
  type WidgetAnswer,
  type WidgetEntry,
  widgetText,
} from './widget';

export type { ConversationSender };

export type Conversation = {
  id: number;
  projectId: number;
  ticketNumber: number | null;
  intent: ConversationIntent;
  state: ConversationState;
  /** Who started it: the User, Autopilot or a Terminal session. */
  startedBy: ConversationStarter;
  sdkSessionId: string | null;
  costUsd: number;
  /** Closed by the User: stopped, and left out of the open Conversations. */
  hidden: boolean;
  /** Retro: the Cycle it looks back on; null for other intents. */
  retroCycleId: number | null;
  /** Batch triage: the Board's Cycle, or null for the Backlog; null for other intents. */
  batchTriageCycleId: number | null;
  /** Batch triage: the Ticket numbers it covers, fixed at its start; null for other intents. */
  batchTriageTickets: number[] | null;
  defaultCycleId: number | null;
  defaultEpicNumber: number | null;
  defaultType: TicketType | null;
  /** The worktree Tandembike made for it; every run works there. Null: the main checkout. */
  worktreePath: string | null;
  /** Why the worktree was kept at close or Done, until it is removed. */
  worktreeKept: KeptWorktreeState | null;
  /** Tandembike removed the worktree; `worktreePath` is where it was. */
  worktreeRemoved: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** One run end of a Conversation (GLOSSARY: Run outcome). */
export type RunOutcome = {
  id: number;
  conversationId: number;
  projectId: number;
  ticketNumber: number | null;
  /** The Conversation's intent. */
  stage: ConversationIntent;
  result: RunResult;
  startedAt: Date;
  endedAt: Date;
  /** What this run cost in USD, not the Conversation's total. */
  costUsd: number;
  model: string | null;
  /** The `/command` the run's first message started with; null for none. */
  command: string | null;
  startedByAutopilot: boolean;
  /** Autopilot's automatic resume of a transient end, not its startup resume. */
  transientResume: boolean;
};

/** How one Stage of a Project ended over the last 30 days. */
export type StageRunStats = {
  stage: ConversationIntent;
  runs: number;
  results: Record<RunResult, number>;
  totalCostUsd: number;
  meanCostUsd: number;
  meanDurationMs: number;
};

/** How many Start Conversations the Estimate reads, and how few it needs. */
const startEstimateSample = 20;
const startEstimateMinimum = 5;

const runStatsWindowMs = 30 * 24 * 60 * 60 * 1000;

/** The longest tool input, as JSON, that is stored whole; a longer one is not stored. */
export const maxToolInputLength = 4096;

export type TranscriptEntry = {
  id: number;
  conversationId: number;
  role: TranscriptRole;
  text: string;
  /** For a permission request, where it is; null for other entries. */
  permission: PermissionStatus | null;
  /** For a permission request, the allow rules its run proposed; null for none. */
  permissionRules: string[] | null;
  /** For a tool or permission entry, the tool's name; null for others and older entries. */
  toolName: string | null;
  /** For a tool or permission entry, its input; null for others, older entries and an input over the cap. */
  toolInput: Record<string, unknown> | null;
  /** For a question of the Agent, what it asked and the answers; null for other entries. */
  question: QuestionEntry | null;
  /** For a Widget of the Agent, the Widget, its answer and expired; null for other entries. */
  widget: WidgetEntry | null;
  createdAt: Date;
  /** For a permission request, when the User answered it; null while pending, once expired, for others and older entries. */
  answeredAt: Date | null;
};

/**
 * How long a Conversation waited on the User's permission answers, in
 * milliseconds: the union of each answered request's wait from asked to
 * answered, so overlapping waits count once (T1155).
 */
const permissionWait = (
  waits: { createdAt: Date; answeredAt: Date }[],
): number => {
  const sorted = waits
    .map(({ createdAt, answeredAt }) => [
      createdAt.getTime(),
      answeredAt.getTime(),
    ])
    .sort(([a], [b]) => a - b);
  let total = 0;
  let end = Number.NEGATIVE_INFINITY;
  for (const [from, to] of sorted) {
    if (to <= end) continue;
    total += to - Math.max(from, end);
    end = to;
  }
  return total;
};

export type StartConversationInput = {
  /** Who starts the Conversation; its first message is recorded as theirs. */
  startedBy: ConversationSender;
  /** The Project, unless `ticketNumber` names a Ticket of it. */
  projectId?: number;
  ticketNumber?: number;
  intent: ConversationIntent;
  /** The User's first message. */
  prompt: string;
  /**
   * Autopilot only: the Active Cycle it starts the Conversation for, whose
   * Spend ceiling the cost counts against.
   */
  cycleId?: number;
  /** Retro only: the Cycle of the Project it looks back on. */
  retroCycleId?: number;
  /** Batch triage only: the Board, a Cycle's id or null for the Backlog, and its Tickets. */
  batchTriage?: { cycleId: number | null; ticketNumbers: number[] };
  /** New Ticket: where the title field was; the Agent's defaults. */
  defaults?: NewTicketDefaults;
};

/** What the CLI needs to open `claude` for a Terminal Conversation. */
export type TerminalSession = {
  /** The Conversation's id, which is the session's Agent-run ID. */
  conversationId: number;
  /** The worktree, else the Project's repository path. */
  cwd: string;
  /** The Stage's command and the Ticket, as the UI sends it. */
  firstMessage: string;
  /** The run brief, saying the run is in a terminal. */
  brief: string;
  runMode: 'default' | 'auto';
  /** The Project's run model; null for Claude Code's own default. */
  model: string | null;
};

/** What `tandembike next` gets: a session, or why there is no work. */
export type TerminalNext =
  | { started: true; session: TerminalSession }
  | { started: false; reason: NoWorkReason };

/** What the CLI needs to resume a handed-over Conversation. */
export type TerminalHandOff = Omit<TerminalSession, 'firstMessage'> & {
  /** The SDK session `claude --resume` opens. */
  sessionId: string;
};

export type StartTerminalInput = {
  ticketNumber: number;
  intent: TerminalIntent;
};

const terminalRefusal =
  'This Conversation runs in a terminal; answer it there.';

/** An open Conversation with what its tab in the Conversation dialog shows. */
export type OpenConversation = {
  conversation: Conversation;
  /** The title of its Ticket; null for a Conversation about a Project. */
  ticketTitle: string | null;
  projectName: string;
  /** The User's first message. */
  firstMessage: string;
};

export type ListConversationsFilter = {
  projectId?: number;
  ticketNumber?: number;
};

export type ConversationsDeps = {
  db: DatabaseConnection;
  /** Where Projects and Tickets are read; this module never writes them. */
  tickets: Tickets;
  changes?: ChangeChannel;
  runner: AgentRunner;
  /** The only code that runs git: makes and inspects the worktrees of Start runs. */
  worktrees: Worktrees;
  /** The Tandembike MCP server the runs connect to. */
  mcpUrl: string;
  /** The time now; every date this module stores comes from it. */
  clock?: () => Date;
};

/**
 * A live run's process and what waits on the User, around its lifecycle
 * (`run-lifecycle.ts`), which only the step changes.
 */
type RunHandle = {
  process: AgentRun | null;
  run: LiveRun;
  /** The id of its `stopped` Run outcome, which its late cost goes to (T587). */
  stoppedOutcomeId: number | null;
  /** Permission requests waiting for the User, by transcript entry id. */
  asking: Map<number, (answer: PermissionAnswer) => void>;
  /** Widgets waiting for the User, by transcript entry id. */
  widgets: Map<number, (answer: WidgetAnswer) => void>;
};

const noRepositoryPath = {
  repositoryPath:
    'This Project has no repository path. Set one in the Project settings first.',
};

/** The model a run of `intent` starts on: Triage's own when set, Batch triage's too, else the run model. */
const modelFor = (
  intent: ConversationIntent,
  settings: { runModel: string | null; triageModel: string | null },
) =>
  (intent === 'triage' || intent === 'batch_triage') &&
  settings.triageModel !== null
    ? settings.triageModel
    : settings.runModel;

/**
 * What an Autopilot Triage run and every Batch triage run may not use: their
 * only writes are a proposal and a note (ADR 0040, ADR 0047).
 */
const autopilotTriageDisallowedTools = [
  'mcp__tandembike__update_ticket',
  'mcp__tandembike__file_tickets',
];

/**
 * What a Spar run may not use, whatever the Agent run mode (ADR 0046): file
 * edits and every Tandembike tool that creates or changes Tickets or Cycles.
 * Reading, the Widget tools and the Spar tools stay.
 */
export const sparDisallowedTools = [
  'Edit',
  'Write',
  'NotebookEdit',
  'mcp__tandembike__file_tickets',
  'mcp__tandembike__update_ticket',
  'mcp__tandembike__start_work',
  'mcp__tandembike__finish_work',
  'mcp__tandembike__abandon_work',
  'mcp__tandembike__open_pr',
  'mcp__tandembike__add_note',
  'mcp__tandembike__check_criterion',
  'mcp__tandembike__attach',
  'mcp__tandembike__propose_triage',
  'mcp__tandembike__create_cycle',
  'mcp__tandembike__update_cycle',
];

/** The states of a run whose process may be alive. */
const liveStates: ConversationState[] = ['running', 'waiting', 'idle'];

/**
 * Whether a Start Conversation is open for Approve merge to resume: not
 * closed, and its run idle after handing off or interrupted. A stopped one
 * takes no replies, and a working one is refused before this is asked
 * (ADR 0038).
 */
const isOpenForMergeResume = (conversation: {
  intent: ConversationIntent;
  state: ConversationState;
  hidden: boolean;
}): boolean =>
  conversation.intent === 'start' &&
  !conversation.hidden &&
  (conversation.state === 'idle' || conversation.state === 'interrupted');

/**
 * Conversations (ADR 0019): the User's exchanges with Agent runs that
 * Tandembike starts. Runs begin, receive replies and stop only through this
 * module, which only Server Actions and the terminal route call. Every change is stored and
 * announced as a `conversation` change over the events route (ADR 0005).
 */
export function createConversations({
  db,
  tickets,
  changes,
  runner,
  worktrees,
  mcpUrl,
  clock = () => new Date(),
}: ConversationsDeps) {
  /** The runs alive in this process, by Conversation id. */
  const live = new Map<number, RunHandle>();

  const announce = (id: number) =>
    changes?.publish({ type: 'conversation', id });

  const get = (id: number): Conversation => {
    const conversation = db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .get();
    if (!conversation) {
      throw new NotFoundError(`There is no Conversation with id ${id}.`);
    }
    return conversation;
  };

  const update = (
    id: number,
    values: Partial<
      Pick<
        Conversation,
        | 'state'
        | 'startedBy'
        | 'sdkSessionId'
        | 'costUsd'
        | 'worktreePath'
        | 'worktreeKept'
        | 'worktreeRemoved'
        | 'hidden'
      > & {
        worktreeBase: string | null;
      }
    >,
  ) => {
    db.update(conversations)
      .set({ ...values, updatedAt: clock() })
      .where(eq(conversations.id, id))
      .run();
  };

  /** The input if its JSON fits the cap; the reader falls back to the entry's text otherwise. */
  const cappedInput = (input?: Record<string, unknown>) =>
    input !== undefined && JSON.stringify(input).length <= maxToolInputLength
      ? input
      : null;

  const append = (
    id: number,
    role: TranscriptRole,
    text: string,
    extra: {
      permission?: PermissionStatus;
      widget?: WidgetEntry;
      permissionRules?: string[] | null;
      tool?: { name: string; input?: Record<string, unknown> };
    } = {},
  ): number =>
    db
      .insert(conversationEntries)
      .values({
        conversationId: id,
        role,
        text,
        permission: extra.permission ?? null,
        permissionRules: extra.permissionRules ?? null,
        toolName: extra.tool?.name ?? null,
        toolInput: cappedInput(extra.tool?.input),
        widget: extra.widget ?? null,
        createdAt: clock(),
      })
      .returning({ id: conversationEntries.id })
      .get().id;

  /** Sets a request's status; `answeredAt` only for the User's answer. */
  const setPermission = (
    entryId: number,
    permission: PermissionStatus,
    answeredAt: Date | null = null,
  ) => {
    db.update(conversationEntries)
      .set({ permission, answeredAt })
      .where(eq(conversationEntries.id, entryId))
      .run();
  };

  /** Denies the requests a run still waits on, as its Conversation ended. */
  const expireAsking = (handle: RunHandle) => {
    for (const [entryId, resolve] of handle.asking) {
      setPermission(entryId, 'expired');
      resolve('deny');
    }
    handle.asking.clear();
  };

  const setQuestion = (entryId: number, question: QuestionEntry) => {
    db.update(conversationEntries)
      .set({ question })
      .where(eq(conversationEntries.id, entryId))
      .run();
  };

  const getEntry = (entryId: number) =>
    db
      .select()
      .from(conversationEntries)
      .where(eq(conversationEntries.id, entryId))
      .get();

  const setWidget = (entryId: number, widget: WidgetEntry) => {
    db.update(conversationEntries)
      .set({ widget })
      .where(eq(conversationEntries.id, entryId))
      .run();
  };

  /** Expires the Widgets a run still waits on, as its Conversation ended. */
  const expireWidgets = (handle: RunHandle) => {
    for (const [entryId, resolve] of handle.widgets) {
      const widget = getEntry(entryId)?.widget;
      if (widget) {
        setWidget(entryId, { ...widget, expired: true });
      }
      resolve({ expired: true });
    }
    handle.widgets.clear();
  };

  /** Whether a live run still waits on the User for anything. */
  const waitsOnUser = (handle: RunHandle) =>
    handle.asking.size > 0 || handle.widgets.size > 0;

  /** What the run lifecycle reads of a Conversation's Ticket; null without one. */
  const ticketFactsOf = (conversation: {
    ticketNumber: number | null;
  }): TicketFacts | null => {
    if (conversation.ticketNumber === null) {
      return null;
    }
    try {
      const ticket = tickets.getTicket(conversation.ticketNumber);
      return {
        status: ticket.status,
        hasPullRequest:
          ticket.externalReferences.some(isPullRequestReference) ||
          ticket.epic?.hasPullRequest === true,
        inReview: isInReview(ticket),
        claimed: ticket.claim !== null,
      };
    } catch {
      return null;
    }
  };

  /** Applies one effect of the run lifecycle; an async one returns its promise. */
  const applyEffect = (
    id: number,
    handle: RunHandle | null,
    effect: RunEffect,
  ): Promise<unknown> | undefined => {
    switch (effect.type) {
      case 'append':
        append(
          id,
          effect.role,
          effect.text,
          effect.tool === undefined ? {} : { tool: effect.tool },
        );
        return;
      case 'writeUsage':
        writeUsage(db, id, effect.before, effect.run);
        return;
      case 'recordOutcome': {
        const outcomeId = db
          .insert(runOutcomes)
          .values({ conversationId: id, ...effect.outcome })
          .returning({ id: runOutcomes.id })
          .get().id;
        if (handle && effect.outcome.result === 'stopped') {
          handle.stoppedOutcomeId = outcomeId;
        }
        return;
      }
      case 'setStoppedOutcomeCost':
        if (handle?.stoppedOutcomeId != null) {
          db.update(runOutcomes)
            .set({ costUsd: effect.costUsd })
            .where(eq(runOutcomes.id, handle.stoppedOutcomeId))
            .run();
        }
        return;
      case 'send':
        handle?.process?.send(effect.text);
        return;
      case 'detach':
        if (handle && live.get(id) === handle) {
          live.delete(id);
        }
        return;
      case 'expireWaits':
        if (handle) {
          expireAsking(handle);
          expireWidgets(handle);
        }
        return;
      case 'endProcess': {
        const process = handle?.process;
        if (!process) {
          return;
        }
        if (!effect.interrupt) {
          process.close();
          return;
        }
        return (async () => {
          try {
            await process.interrupt();
          } finally {
            process.close();
          }
        })();
      }
      case 'releaseWorktree':
        return tryRelease(id);
      case 'announce':
        announce(id);
        return;
    }
  };

  /** Applies effects in order, waiting for each async one before the next. */
  const applyEffects = (
    id: number,
    handle: RunHandle | null,
    effects: RunEffect[],
  ): Promise<void> | undefined => {
    for (const [index, effect] of effects.entries()) {
      const waiting = applyEffect(id, handle, effect);
      if (waiting) {
        return waiting.then(() =>
          applyEffects(id, handle, effects.slice(index + 1)),
        );
      }
    }
    return undefined;
  };

  /**
   * Runs the run lifecycle's step for Conversation `id` and `handle`, its
   * live run or null, and applies what it returns: the run's next state, the
   * Conversation's patch, then the effects in order.
   */
  const stepRun = (
    id: number,
    handle: RunHandle | null,
    input: LifecycleInput,
    conversation: Conversation = get(id),
  ): Promise<void> | undefined => {
    const result: StepResult = step(
      handle?.run ?? null,
      conversation,
      input,
      clock(),
    );
    if (handle && result.run) {
      handle.run = result.run;
    }
    if (Object.keys(result.patch).length > 0) {
      update(id, result.patch);
    }
    return applyEffects(id, handle, result.effects);
  };

  const askWidget = (
    id: number,
    handle: RunHandle,
    widget: Widget,
  ): Promise<WidgetAnswer> => {
    if (live.get(id) !== handle) {
      return Promise.resolve({ expired: true });
    }
    const shown = tidyWidget(widget);
    const entryId = append(id, 'widget', widgetText(shown), {
      widget: { widget: shown, answer: null, expired: false },
    });
    update(id, { state: 'waiting' });
    announce(id);
    return new Promise((resolve) => {
      handle.widgets.set(entryId, resolve);
    });
  };

  const askPermission = (
    id: number,
    handle: RunHandle,
    request: PermissionRequest,
  ): Promise<PermissionAnswer> => {
    if (live.get(id) !== handle) {
      return Promise.resolve('deny');
    }
    const entryId = append(
      id,
      'permission',
      `${request.toolName} ${JSON.stringify(request.input)}`,
      {
        permission: 'pending',
        permissionRules: request.rules.length === 0 ? null : request.rules,
        tool: { name: request.toolName, input: request.input },
      },
    );
    update(id, { state: 'waiting' });
    announce(id);
    return new Promise((resolve) => {
      handle.asking.set(entryId, resolve);
    });
  };

  const handleEvent = (id: number, handle: RunHandle, event: RunEvent) => {
    const conversation = get(id);
    void stepRun(
      id,
      handle,
      {
        type: 'event',
        event,
        waitsOnUser: waitsOnUser(handle),
        ticket:
          event.type === 'turn' || event.type === 'exit'
            ? ticketFactsOf(conversation)
            : null,
      },
      conversation,
    );
  };

  /**
   * The snapshot Run capacity is read from: every Conversation whose run is
   * alive in this server, and every open Terminal Conversation.
   */
  const capacitySnapshot = (projectId?: number): CapacitySnapshot => {
    const running = [...live.keys()].map(get);
    const terminals = db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.startedBy, 'terminal'),
          inArray(conversations.state, liveStates),
        ),
      )
      .all()
      .filter((row) => !live.has(row.id));
    return {
      conversations: [...running, ...terminals],
      machineCap: tickets.getMachineSettings().maxConcurrentRuns,
      parallelRuns:
        projectId === undefined
          ? false
          : tickets.getProjectAgentSettings(projectId).parallelRuns,
    };
  };

  function capacity(projectId: number): Capacity<ProjectCapacity>;
  function capacity(): Capacity<null>;
  function capacity(projectId?: number): Capacity {
    const snapshot = capacitySnapshot(projectId);
    return projectId === undefined
      ? capacityOf(snapshot)
      : capacityOf(snapshot, projectId);
  }

  /**
   * Refuses a run of `intent` that Run capacity does not allow: a Start or a
   * Merge beyond the Project's Start run limit or at the Machine cap is not
   * queued (ADR 0019, ADR 0041). `exceptId` is the Conversation about to
   * work, not counted against itself; `reply`, the User's, is never refused
   * (ADR 0031).
   */
  const checkStartLimit = (
    projectId: number,
    intent: CapacityIntent,
    exceptId?: number,
  ) => {
    const refusal = refusalOf(verdictOf(capacity(projectId), intent, exceptId));
    if (refusal !== null) {
      throw new NotAllowedError(refusal);
    }
  };

  const worktreeBaseOf = (id: number): string =>
    db
      .select({ base: conversations.worktreeBase })
      .from(conversations)
      .where(eq(conversations.id, id))
      .get()?.base ?? 'the default branch';

  const setHidden = (id: number, hidden: boolean) => {
    db.update(conversations)
      .set({ hidden, updatedAt: clock() })
      .where(eq(conversations.id, id))
      .run();
  };

  /**
   * The median cost of the Project's last 20 Start Conversations, by when
   * their latest run ended, that reached `completed` or `pr_open`, however
   * old; each Conversation's cost sums its runs. Null with fewer than 5
   * such Conversations. Only this module reads Run outcomes, so the
   * Estimate never reaches an MCP tool (GLOSSARY: Estimate).
   */
  const startCostEstimate = (projectId: number): number | null => {
    const rows = db
      .select()
      .from(runOutcomes)
      .where(
        and(
          eq(runOutcomes.projectId, projectId),
          eq(runOutcomes.stage, 'start'),
        ),
      )
      .orderBy(runOutcomes.id)
      .all();
    const byConversation = new Map<
      number,
      { costUsd: number; endedAt: number; result: RunResult }
    >();
    for (const row of rows) {
      byConversation.set(row.conversationId, {
        costUsd:
          (byConversation.get(row.conversationId)?.costUsd ?? 0) + row.costUsd,
        endedAt: row.endedAt.getTime(),
        result: row.result,
      });
    }
    const costs = [...byConversation.values()]
      .filter(({ result }) => result === 'completed' || result === 'pr_open')
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, startEstimateSample)
      .map(({ costUsd }) => costUsd)
      .sort((a, b) => a - b);
    if (costs.length < startEstimateMinimum) {
      return null;
    }
    const middle = Math.floor(costs.length / 2);
    return costs.length % 2 === 1
      ? costs[middle]
      : (costs[middle - 1] + costs[middle]) / 2;
  };

  /** The run brief of Conversation `id` as its situation is now (ADR 0019). */
  const briefOf = (id: number): string => {
    const conversation = get(id);
    const settings = tickets.getProjectAgentSettings(conversation.projectId);
    const ticket =
      conversation.ticketNumber === null
        ? null
        : tickets.getTicket(conversation.ticketNumber);
    return runBrief({
      conversationId: id,
      ticketNumber: ticket?.number ?? null,
      ticketTitle: ticket?.title ?? null,
      ticketType: ticket?.type ?? null,
      projectName: tickets.getProject(conversation.projectId).name,
      intent: conversation.intent,
      retroCycle:
        conversation.retroCycleId === null
          ? null
          : tickets.getCycle(conversation.retroCycleId),
      parallelRuns: settings.parallelRuns,
      worktree:
        conversation.worktreePath === null
          ? null
          : {
              path: conversation.worktreePath,
              base: worktreeBaseOf(id),
            },
      checkCommand: settings.checkCommand,
      runMode: settings.runMode,
      terminal: isTerminal(conversation),
      ...(conversation.intent === 'plan'
        ? { planEstimateUsd: startCostEstimate(conversation.projectId) }
        : {}),
      defaults: {
        cycleId: conversation.defaultCycleId,
        epicNumber: conversation.defaultEpicNumber,
        type: conversation.defaultType,
      },
    });
  };

  /**
   * Starts a run for Conversation `id` with `prompt`, resuming `resume`.
   * `limited: false` skips the Start run limit, for the User's reply (ADR 0031).
   */
  const startRun = (
    id: number,
    prompt: string,
    resume?: string,
    limited = true,
    sentBy: ConversationSender = 'user',
    transientResume = false,
    stage?: ConversationIntent,
  ) => {
    const conversation = get(id);
    const settings = tickets.getProjectAgentSettings(conversation.projectId);
    if (settings.repositoryPath === null) {
      throw new ValidationError(noRepositoryPath);
    }
    checkStartLimit(
      conversation.projectId,
      limited ? conversation.intent : 'reply',
      id,
    );
    const runModel = modelFor(conversation.intent, settings);
    const handle: RunHandle = {
      process: null,
      run: {
        phase: { name: 'alive', releaseWorktree: false },
        costBefore: conversation.costUsd,
        usageBefore: readUsage(db, id),
        model: null,
        ticketStatus: ticketFactsOf(conversation)?.status ?? null,
        pending: pendingRunOf(
          prompt,
          {
            costAtStart: conversation.costUsd,
            sentBy,
            transientResume,
            stage,
          },
          clock(),
        ),
      },
      stoppedOutcomeId: null,
      asking: new Map(),
      widgets: new Map(),
    };
    live.set(id, handle);
    try {
      handle.process = runner.start({
        cwd: conversation.worktreePath ?? settings.repositoryPath,
        agentRunId: String(id),
        mcpUrl,
        plugins: [{ type: 'local', path: playbookPath }],
        systemPrompt: briefOf(id),
        prompt,
        // A Spar is read-only whatever the Project's run mode (ADR 0046).
        runMode: conversation.intent === 'spar' ? 'default' : settings.runMode,
        ...(runModel === null ? {} : { model: runModel }),
        ...((conversation.intent === 'triage' &&
          conversation.startedBy === 'autopilot') ||
        conversation.intent === 'batch_triage'
          ? { disallowedTools: autopilotTriageDisallowedTools }
          : {}),
        ...(conversation.intent === 'spar'
          ? { disallowedTools: sparDisallowedTools }
          : {}),
        ...(resume === undefined ? {} : { resume }),
        askPermission: (request) => askPermission(id, handle, request),
        askWidget: (widget) => askWidget(id, handle, widget),
        onEvent: (event) => handleEvent(id, handle, event),
      });
    } catch (error) {
      live.delete(id);
      throw error;
    }
  };

  /**
   * Makes the worktree of Conversation `id` and runs the Project's Prepare
   * command in it. Returns why it failed, or null when the worktree is ready.
   */
  const prepareWorktree = async (
    id: number,
    projectId: number,
    settings: { repositoryPath: string | null; prepareCommand: string | null },
  ): Promise<string | null> => {
    try {
      const made = await worktrees.create({
        repositoryPath: settings.repositoryPath as string,
        projectId,
        conversationId: id,
      });
      update(id, { worktreePath: made.path, worktreeBase: made.base });
      if (settings.prepareCommand !== null) {
        const prepared = await worktrees.runPrepare(
          made.path,
          settings.prepareCommand,
        );
        if (prepared.exitCode !== 0) {
          // No run starts in a worktree its dependencies are missing from.
          return `The Prepare command \`${settings.prepareCommand}\` failed with exit code ${prepared.exitCode}.\n\n${prepared.output}`.trim();
        }
      }
      return null;
    } catch (error) {
      return `Tandembike could not create a worktree for this Conversation: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  };

  /** The Retro of a Cycle, closed or not; null when it has none. */
  const retroOf = (cycleId: number): Conversation | null =>
    db
      .select()
      .from(conversations)
      .where(eq(conversations.retroCycleId, cycleId))
      .orderBy(conversations.id)
      .limit(1)
      .get() ?? null;

  /**
   * The open Batch triage of a Board, a Cycle's id or null for the Backlog:
   * one not closed (unhidden), in any state; null when there is none.
   */
  const openBatchTriage = (
    projectId: number,
    cycleId: number | null,
  ): Conversation | null =>
    db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.projectId, projectId),
          eq(conversations.intent, 'batch_triage'),
          eq(conversations.hidden, false),
          cycleId === null
            ? isNull(conversations.batchTriageCycleId)
            : eq(conversations.batchTriageCycleId, cycleId),
        ),
      )
      .orderBy(conversations.id)
      .limit(1)
      .get() ?? null;

  /**
   * Starts a Conversation on a Ticket or a Project and its first run.
   * Refused when the Project has no repository path.
   */
  const start = async (
    input: StartConversationInput,
  ): Promise<Conversation> => {
    const prompt = (input.prompt ?? '').trim();
    if (prompt === '') {
      throw new ValidationError({ prompt: 'Write a message for the Agent.' });
    }
    let projectId = input.projectId;
    if (input.ticketNumber !== undefined) {
      projectId = tickets.getTicket(input.ticketNumber).projectId;
    }
    if (projectId === undefined) {
      throw new ValidationError({
        projectId: 'Choose a Project or a Ticket.',
      });
    }
    if (input.intent === 'merge') {
      if (input.startedBy === 'autopilot') {
        throw new NotAllowedError(
          'Autopilot never starts a Merge: the User approves each merge (ADR 0038).',
        );
      }
      if (input.ticketNumber === undefined) {
        throw new ValidationError({
          ticketNumber: 'A Merge is about a Ticket or an Epic.',
        });
      }
    }
    if (input.intent === 'setup') {
      if (input.ticketNumber !== undefined) {
        throw new ValidationError({
          ticketNumber: 'Setup is about a Project, not a Ticket.',
        });
      }
      // At most one running Setup per Project: two would edit the same
      // checkout (ADR 0020). Starting another opens the running one.
      for (const id of live.keys()) {
        const other = get(id);
        if (other.projectId === projectId && other.intent === 'setup') {
          return other;
        }
      }
    }
    if (input.intent === 'spec') {
      if (input.startedBy !== 'user') {
        throw new NotAllowedError('Only the User starts a Spec.');
      }
      if (input.ticketNumber === undefined) {
        throw new ValidationError({
          ticketNumber: 'A Spec is about a Ticket.',
        });
      }
    }
    if (input.intent === 'spar' && input.startedBy !== 'user') {
      throw new NotAllowedError('Only the User starts a Spar.');
    }
    if (input.intent === 'plan') {
      if (input.startedBy !== 'user') {
        throw new NotAllowedError('Only the User starts a Plan.');
      }
      if (input.ticketNumber !== undefined) {
        throw new ValidationError({
          ticketNumber: 'A Plan is about a Project, not a Ticket.',
        });
      }
    }
    if (input.intent === 'retro') {
      if (input.ticketNumber !== undefined) {
        throw new ValidationError({
          ticketNumber: 'A Retro is about a Cycle, not a Ticket.',
        });
      }
      if (input.retroCycleId === undefined) {
        throw new ValidationError({
          retroCycleId: 'Choose the Cycle to look back on.',
        });
      }
      if (tickets.getCycle(input.retroCycleId).projectId !== projectId) {
        throw new ValidationError({
          retroCycleId: 'That Cycle belongs to another Project.',
        });
      }
      if (retroOf(input.retroCycleId) !== null) {
        throw new NotAllowedError('This Cycle already has a Retro.');
      }
    }
    if (input.intent === 'batch_triage') {
      if (input.startedBy !== 'user') {
        throw new NotAllowedError('Only the User starts a Batch triage.');
      }
      if (input.ticketNumber !== undefined) {
        throw new ValidationError({
          ticketNumber: 'A Batch triage is about a Board, not a Ticket.',
        });
      }
      if (input.batchTriage === undefined) {
        throw new ValidationError({
          cycleId: 'Choose the Board to triage.',
        });
      }
      const { cycleId, ticketNumbers } = input.batchTriage;
      if (
        cycleId !== null &&
        tickets.getCycle(cycleId).projectId !== projectId
      ) {
        throw new ValidationError({
          cycleId: 'That Cycle belongs to another Project.',
        });
      }
      // At most one open per Board: starting another opens it (T1316).
      const open = openBatchTriage(projectId, cycleId);
      if (open !== null) {
        return open;
      }
      if (ticketNumbers.length === 0) {
        throw new ValidationError({
          ticketNumbers: 'This Board has nothing to triage.',
        });
      }
    }
    const settings = tickets.getProjectAgentSettings(projectId);
    if (settings.repositoryPath === null) {
      throw new ValidationError(noRepositoryPath);
    }
    checkStartLimit(projectId, input.intent);

    const now = clock();
    const created = db
      .insert(conversations)
      .values({
        projectId,
        ticketNumber: input.ticketNumber ?? null,
        intent: input.intent,
        defaultCycleId: input.defaults?.cycleId ?? null,
        defaultEpicNumber: input.defaults?.epicNumber ?? null,
        defaultType: input.defaults?.type ?? null,
        startedBy: input.startedBy,
        autopilotCycleId:
          input.startedBy === 'autopilot' ? (input.cycleId ?? null) : null,
        retroCycleId:
          input.intent === 'retro' ? (input.retroCycleId ?? null) : null,
        batchTriageCycleId:
          input.intent === 'batch_triage'
            ? (input.batchTriage?.cycleId ?? null)
            : null,
        batchTriageTickets:
          input.intent === 'batch_triage'
            ? (input.batchTriage?.ticketNumbers ?? null)
            : null,
        state: 'running',
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: conversations.id })
      .get();
    append(created.id, input.startedBy, prompt);
    // A Merge always gets a worktree: it checks out the PR branch, which must
    // not disturb the User's checkout, even with Parallel runs off (T1221).
    if (
      input.intent === 'merge' ||
      (input.intent === 'start' && settings.parallelRuns)
    ) {
      const problem = await prepareWorktree(created.id, projectId, settings);
      if (problem !== null) {
        // No run starts in a broken checkout: the Conversation waits for the
        // User in Action needed (ADR 0023).
        update(created.id, { state: 'interrupted' });
        append(created.id, 'error', problem);
        announce(created.id);
        return get(created.id);
      }
    }
    try {
      startRun(created.id, prompt, undefined, true, input.startedBy);
    } catch (error) {
      update(created.id, { state: 'interrupted' });
      append(created.id, 'error', 'The Agent could not be started.');
      announce(created.id);
      throw error;
    }
    announce(created.id);
    return get(created.id);
  };

  const refuseTerminal = (conversation: Conversation) => {
    if (isTerminal(conversation)) {
      throw new NotAllowedError(terminalRefusal);
    }
  };

  /**
   * Opens a Conversation Started by Terminal on a Ticket (ADR 0039): the
   * refusals of a UI start, but neither the Start run limit nor the Spend
   * ceiling. It makes the worktree and runs the Prepare command as a UI Start
   * does, and returns what the CLI needs to open `claude`. No run starts in
   * the server: the Conversation is `running` until `endTerminal`.
   */
  const startTerminal = async (
    input: StartTerminalInput,
  ): Promise<TerminalSession> => {
    const ticket = tickets.getTicket(input.ticketNumber);
    const label = `T${ticket.number}`;
    if (ticket.archived) {
      throw new NotAllowedError(`${label} is archived.`);
    }
    const settings = tickets.getProjectAgentSettings(ticket.projectId);
    if (settings.repositoryPath === null) {
      throw new ValidationError(noRepositoryPath);
    }
    if (input.intent === 'spec' && !canSpec(ticket)) {
      throw new NotAllowedError(
        `${label} is not an idea in Intake or an Epic without children, so it cannot be specced.`,
      );
    }
    if (input.intent === 'start') {
      const working = db
        .select({ id: conversations.id, state: conversations.state })
        .from(conversations)
        .where(
          and(
            eq(conversations.ticketNumber, ticket.number),
            eq(conversations.intent, 'start'),
            eq(conversations.hidden, false),
          ),
        )
        .all()
        .some((row) => row.state === 'running' || row.state === 'waiting');
      if (working) {
        throw new NotAllowedError(
          `${label} already has a Start Conversation working. Wait for it, or stop it.`,
        );
      }
    }
    const firstMessage = agentCommandMessage(
      input.intent,
      ticket,
      tickets.getProjectAgentCommands(ticket.projectId),
    );
    const now = clock();
    const created = db
      .insert(conversations)
      .values({
        projectId: ticket.projectId,
        ticketNumber: ticket.number,
        intent: input.intent,
        startedBy: 'terminal',
        state: 'running',
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: conversations.id })
      .get();
    append(created.id, 'user', firstMessage);
    if (input.intent === 'start' && settings.parallelRuns) {
      const problem = await prepareWorktree(
        created.id,
        ticket.projectId,
        settings,
      );
      if (problem !== null) {
        // There is no session to wait in: close the Conversation, and say why.
        append(created.id, 'error', problem);
        update(created.id, { state: 'stopped' });
        setHidden(created.id, true);
        announce(created.id);
        throw new NotAllowedError(problem);
      }
    }
    announce(created.id);
    const conversation = get(created.id);
    return {
      conversationId: created.id,
      cwd: conversation.worktreePath ?? settings.repositoryPath,
      firstMessage,
      brief: briefOf(created.id),
      runMode: settings.runMode,
      model: modelFor(input.intent, settings),
    };
  };

  /** The Project whose repository holds `folder`, else a refusal naming the known ones. */
  const projectIdOfFolder = (folder: string): number => {
    const projectId = tickets.findProjectIdOfFolder(folder);
    if (projectId === undefined) {
      const names = tickets
        .listProjects()
        .filter(({ archived }) => !archived)
        .map(({ name }) => `"${name}"`);
      throw new ValidationError({
        cwd: `No Project has a repository containing ${folder}. ${
          names.length === 0
            ? 'There are no Projects yet.'
            : `Known Projects: ${names.join(', ')}.`
        }`,
      });
    }
    return projectId;
  };

  /**
   * `tandembike plan "<goal>"` (T1249): a Terminal Plan on the Project whose
   * repository holds `folder`, in the main checkout, with the Plan command and
   * the goal as the first message. Like `startPlan`, it holds no slot and
   * records no Cycle.
   */
  const startTerminalPlan = async (input: {
    folder: string;
    goal: string;
  }): Promise<TerminalSession> => {
    const goal = input.goal.trim();
    if (goal === '') {
      throw new ValidationError({ goal: 'Describe the goal to plan for.' });
    }
    const projectId = projectIdOfFolder(input.folder);
    const settings = tickets.getProjectAgentSettings(projectId);
    if (settings.repositoryPath === null) {
      throw new ValidationError(noRepositoryPath);
    }
    const firstMessage = planCommandMessage(
      goal,
      tickets.getProjectAgentCommands(projectId),
    );
    const now = clock();
    const created = db
      .insert(conversations)
      .values({
        projectId,
        intent: 'plan',
        startedBy: 'terminal',
        state: 'running',
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: conversations.id })
      .get();
    append(created.id, 'user', firstMessage);
    announce(created.id);
    return {
      conversationId: created.id,
      cwd: settings.repositoryPath,
      firstMessage,
      brief: briefOf(created.id),
      runMode: settings.runMode,
      model: modelFor('plan', settings),
    };
  };

  /**
   * `tandembike next` (T1240): starts a Terminal Start on the top Eligible
   * item of the Active Cycle of the Project whose repository holds `folder`,
   * by the `next_work` rule. With no work it returns `next_work`'s reason.
   */
  const startTerminalNext = async (folder: string): Promise<TerminalNext> => {
    const projectId = projectIdOfFolder(folder);
    const next = tickets.nextWork({ projectId });
    if (next.ticket === null) {
      return { started: false, reason: next.reason };
    }
    return {
      started: true,
      session: await startTerminal({
        ticketNumber: next.ticket.number,
        intent: 'start',
      }),
    };
  };

  /**
   * The CLI reports its `claude` session ended: the Conversation becomes
   * `stopped` with a "Session ended" entry holding the exit code. It records
   * no Run outcome (ADR 0039). Ending an ended one changes nothing.
   */
  const endTerminal = async (
    id: number,
    end: { exitCode: number },
  ): Promise<Conversation> => {
    const conversation = get(id);
    if (!isTerminal(conversation)) {
      throw new NotAllowedError(
        'This Conversation does not run in a terminal.',
      );
    }
    if (conversation.state === 'stopped') {
      return conversation;
    }
    append(id, 'session', `Session ended (exit code ${end.exitCode}).`);
    update(id, { state: 'stopped' });
    announce(id);
    return get(id);
  };

  /**
   * A Tandembike MCP call of a `claude` session, attributed by its
   * `X-Tandembike-Run` header (T1238): becomes the Conversation's latest
   * `tool` entry, which the Status line reads, and refreshes its last
   * activity. Anything but a running, unclosed Terminal Conversation's id is
   * ignored.
   */
  const recordTerminalCall = (
    runId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): void => {
    if (!/^\d+$/.test(runId)) {
      return;
    }
    const id = Number(runId);
    const conversation = db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .get();
    if (
      !conversation ||
      !isTerminal(conversation) ||
      conversation.hidden ||
      conversation.state !== 'running'
    ) {
      return;
    }
    const name = `mcp__tandembike__${toolName}`;
    append(id, 'tool', `${name} ${JSON.stringify(input)}`.slice(0, 300), {
      tool: { name, input },
    });
    update(id, {});
    announce(id);
  };

  /**
   * The CLI's heartbeat while `claude` runs: refreshes the last activity of a
   * Terminal Conversation that is still open (ADR 0039). Ignored for others.
   */
  const heartbeatTerminal = (id: number, now: Date = clock()) => {
    db.update(conversations)
      .set({ updatedAt: now })
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.startedBy, 'terminal'),
          inArray(conversations.state, liveStates),
        ),
      )
      .run();
  };

  /**
   * Ends every open Terminal Conversation whose last activity, a heartbeat or
   * an MCP call, is more than 5 minutes before `now`, as an exit does but with
   * an entry saying it timed out. Returns how many it ended. The server calls
   * it once a minute.
   */
  const endIdleTerminals = (now: Date = clock()): number => {
    const cutoff = now.getTime() - terminalIdleMs;
    const idle = db
      .select({ id: conversations.id, updatedAt: conversations.updatedAt })
      .from(conversations)
      .where(
        and(
          eq(conversations.startedBy, 'terminal'),
          inArray(conversations.state, liveStates),
        ),
      )
      .all()
      .filter((row) => row.updatedAt.getTime() < cutoff);
    for (const { id } of idle) {
      append(
        id,
        'session',
        `Session timed out (no activity for ${terminalIdleMinutes} minutes).`,
      );
      update(id, { state: 'stopped' });
      announce(id);
    }
    return idle.length;
  };

  const repositoryPathOf = (projectId: number): string | null => {
    try {
      return tickets.getProjectAgentSettings(projectId).repositoryPath ?? null;
    } catch {
      return null;
    }
  };

  /**
   * Removes the Conversation's worktree when it holds nothing but what git
   * has elsewhere, and otherwise keeps it and says why (ADR 0033). Never
   * forces. A worktree already gone counts as removed.
   */
  const releaseWorktree = async (id: number) => {
    const conversation = get(id);
    const path = conversation.worktreePath;
    if (path === null || conversation.worktreeRemoved) {
      return;
    }
    const state = await worktrees.state(path);
    if (state === 'dirty' || state === 'unpushed') {
      if (conversation.worktreeKept !== state) {
        update(id, { worktreeKept: state });
        announce(id);
      }
      return;
    }
    if (state === 'clean') {
      const repositoryPath = repositoryPathOf(conversation.projectId);
      if (repositoryPath === null) {
        return;
      }
      await worktrees.remove(repositoryPath, path);
    }
    update(id, { worktreeKept: null, worktreeRemoved: true });
    // An idle run would work in a folder that is gone: it ends with its
    // worktree, and the Conversation stays idle (T1281).
    const handle = live.get(id);
    if (handle) {
      void stepRun(id, handle, { type: 'worktreeRemoved' });
    }
    announce(id);
  };

  /** Releases quietly: a failure leaves the worktree for the User's button. */
  const tryRelease = (id: number) => releaseWorktree(id).catch(() => undefined);

  // A Ticket moving Back to Todo or to Done ends the processes of its
  // Starts and Merges (ADR 0049), and reaching Done, by `finish_work` or the
  // Merged button, frees the worktrees of its Conversations (T1232).
  changes?.subscribe((change) => {
    if (change.type !== 'ticket' && change.type !== 'tickets') {
      return;
    }
    const numbers = change.type === 'ticket' ? [change.number] : change.numbers;
    for (const number of numbers) {
      let status: Status;
      try {
        status = tickets.getTicket(number).status;
      } catch {
        // A deleted Ticket has no runs to end.
        continue;
      }
      const own = db
        .select()
        .from(conversations)
        .where(eq(conversations.ticketNumber, number))
        .all();
      for (const conversation of own) {
        void stepRun(
          conversation.id,
          live.get(conversation.id) ?? null,
          { type: 'ticketMoved', status },
          conversation,
        );
      }
    }
  });

  /**
   * What Autopilot's Triage runs spent since `dayStart` in USD (ADR 0040):
   * the cost of the runs it started that ended then or later, from Run
   * outcomes, plus the cost so far of an Autopilot Triage run still working.
   */
  const autopilotTriageSpend = (projectId: number, dayStart: Date): number => {
    const ended = db
      .select({
        total: sql<number>`coalesce(sum(${runOutcomes.costUsd}), 0)`,
      })
      .from(runOutcomes)
      .where(
        and(
          eq(runOutcomes.projectId, projectId),
          eq(runOutcomes.stage, 'triage'),
          eq(runOutcomes.startedByAutopilot, true),
          gte(runOutcomes.endedAt, dayStart),
        ),
      )
      .get();
    let working = 0;
    for (const id of live.keys()) {
      const conversation = get(id);
      const pending = live.get(id)?.run.pending;
      if (
        pending &&
        conversation.projectId === projectId &&
        conversation.intent === 'triage' &&
        conversation.startedBy === 'autopilot'
      ) {
        // The run's own cost so far: the Conversation's total less its earlier runs.
        working += Math.max(0, conversation.costUsd - pending.costAtStart);
      }
    }
    return (ended?.total ?? 0) + working;
  };

  /**
   * What Autopilot's runs have cost since `dayStart` across all Projects
   * (ADR 0041): the Run outcomes of runs it started that ended then or later,
   * plus the cost so far of its runs still working. An approved merge and the
   * User's own runs are left out.
   */
  const autopilotSpendToday = (dayStart: Date): number => {
    const ended = db
      .select({
        total: sql<number>`coalesce(sum(${runOutcomes.costUsd}), 0)`,
      })
      .from(runOutcomes)
      .where(
        and(
          eq(runOutcomes.startedByAutopilot, true),
          ne(runOutcomes.stage, 'merge'),
          gte(runOutcomes.endedAt, dayStart),
        ),
      )
      .get();
    let working = 0;
    for (const id of live.keys()) {
      const pending = live.get(id)?.run.pending;
      if (pending?.startedByAutopilot && pending.stage !== 'merge') {
        working += Math.max(0, get(id).costUsd - pending.costAtStart);
      }
    }
    return (ended?.total ?? 0) + working;
  };

  /**
   * Interrupts the run, ends it and marks the Conversation stopped.
   * `keepWorktree`: a terminal takes the worktree over (ADR 0039).
   */
  const stop = async (
    id: number,
    keepWorktree = false,
  ): Promise<Conversation> => {
    const conversation = get(id);
    if (conversation.state === 'stopped') {
      return conversation;
    }
    refuseTerminal(conversation);
    await stepRun(
      id,
      live.get(id) ?? null,
      { type: 'stop', keepWorktree },
      conversation,
    );
    return get(id);
  };

  return {
    get,

    /**
     * The tokens Conversation `id`'s runs used per model, across all its
     * runs (ADR 0050); empty when it recorded none: not measured.
     */
    usage(id: number): UsageByModel {
      get(id);
      return readUsage(db, id);
    },

    /**
     * The usage of a Project's Conversations of all time, or with `cycleId`
     * of those counting towards that Cycle: the one Autopilot started them
     * for, else every Cycle holding their Ticket (ADR 0050). Hand-started
     * and Autopilot Conversations count alike; `notMeasured` counts those
     * that recorded no tokens.
     */
    usageTotal(input: { projectId: number; cycleId?: number }): UsageTotal {
      const inProject = eq(conversations.projectId, input.projectId);
      if (input.cycleId === undefined) {
        return totalUsage(db, inProject);
      }
      const numbers = tickets.getCycle(input.cycleId).ticketNumbers;
      return totalUsage(
        db,
        and(
          inProject,
          or(
            eq(conversations.autopilotCycleId, input.cycleId),
            numbers.length === 0
              ? undefined
              : and(
                  isNull(conversations.autopilotCycleId),
                  inArray(conversations.ticketNumber, numbers),
                ),
          ),
        ),
      );
    },

    autopilotSpendToday,

    /**
     * Today's Machine ceiling budget (ADR 0041), the one place that decides
     * "paused": Autopilot's spend since the start of `now`'s local day against
     * the machine's daily ceiling. Null while no ceiling is set.
     */
    machineBudget(
      now: Date = clock(),
    ): { spendUsd: number; ceilingUsd: number; paused: boolean } | null {
      const ceilingUsd = tickets.getMachineSettings().dailySpendCeilingUsd;
      if (ceilingUsd === null) {
        return null;
      }
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const spendUsd = autopilotSpendToday(dayStart);
      return { spendUsd, ceilingUsd, paused: spendUsd >= ceilingUsd };
    },

    /**
     * Run capacity now (GLOSSARY: Run capacity): the Machine slots and their
     * holders, the live Agent processes Autopilot's headroom counts and,
     * given `projectId`, that Project's Start run slots, their limit and its
     * working Triage run. Only runs whose process is alive count (ADR 0049).
     */
    capacity,

    /**
     * What Autopilot has spent on a Cycle in USD (ADR 0030, GLOSSARY: Spend
     * ceiling): the total cost of the Conversations it started for that Cycle,
     * resumes included, since a resume adds to its Conversation. A hand-started
     * Conversation counts as started by Autopilot for Autopilot's replies only
     * (ADR 0034): the cost of those runs, on Tickets planned in the Cycle,
     * adds to it. The next Cycle starts again at zero.
     */
    autopilotSpend(input: { projectId: number; cycleId: number }): number {
      const started = db
        .select({
          total: sql<number>`coalesce(sum(${conversations.costUsd}), 0)`,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.projectId, input.projectId),
            eq(conversations.startedBy, 'autopilot'),
            eq(conversations.autopilotCycleId, input.cycleId),
          ),
        )
        .get();
      const numbers = tickets.getCycle(input.cycleId).ticketNumbers;
      const replies =
        numbers.length === 0
          ? null
          : db
              .select({
                total: sql<number>`coalesce(sum(${runOutcomes.costUsd}), 0)`,
              })
              .from(runOutcomes)
              .innerJoin(
                conversations,
                eq(conversations.id, runOutcomes.conversationId),
              )
              .where(
                and(
                  eq(runOutcomes.projectId, input.projectId),
                  eq(runOutcomes.startedByAutopilot, true),
                  eq(conversations.startedBy, 'user'),
                  inArray(runOutcomes.ticketNumber, numbers),
                ),
              )
              .get();
      // The merge the User approved on a Conversation Autopilot started is a
      // `merge` run there, and is not Autopilot's spend (ADR 0038).
      const approvedMerges = db
        .select({
          total: sql<number>`coalesce(sum(${runOutcomes.costUsd}), 0)`,
        })
        .from(runOutcomes)
        .innerJoin(
          conversations,
          eq(conversations.id, runOutcomes.conversationId),
        )
        .where(
          and(
            eq(runOutcomes.projectId, input.projectId),
            eq(runOutcomes.stage, 'merge'),
            eq(conversations.intent, 'start'),
            eq(conversations.startedBy, 'autopilot'),
            eq(conversations.autopilotCycleId, input.cycleId),
          ),
        )
        .get();
      return (
        Math.max(0, (started?.total ?? 0) - (approvedMerges?.total ?? 0)) +
        (replies?.total ?? 0)
      );
    },

    autopilotTriageSpend,

    /**
     * A Cycle's Spend ceiling budget (the Project's setting), the one place
     * that decides "paused": Autopilot's spend on the Cycle against the
     * ceiling. Null while the Project has no Spend ceiling.
     */
    spendBudget(input: {
      projectId: number;
      cycleId: number;
    }): { spendUsd: number; ceilingUsd: number; paused: boolean } | null {
      const ceilingUsd = tickets.getProjectAgentSettings(
        input.projectId,
      ).spendCeilingUsd;
      if (ceilingUsd === null) {
        return null;
      }
      const spendUsd = this.autopilotSpend(input);
      return { spendUsd, ceilingUsd, paused: spendUsd >= ceilingUsd };
    },

    /**
     * Today's Auto-triage budget of a Project (ADR 0040), the one place that
     * decides "paused": the spend since the start of `now`'s day against the
     * Triage ceiling. Null while Auto-triage is off or has no ceiling.
     */
    triageBudget(
      projectId: number,
      now: Date = new Date(),
    ): { spendUsd: number; ceilingUsd: number; paused: boolean } | null {
      const settings = tickets.getProjectAgentSettings(projectId);
      if (!settings.autoTriage || settings.triageCeilingUsd === null) {
        return null;
      }
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const spendUsd = autopilotTriageSpend(projectId, dayStart);
      return {
        spendUsd,
        ceilingUsd: settings.triageCeilingUsd,
        paused: spendUsd >= settings.triageCeilingUsd,
      };
    },

    /**
     * The Run outcomes of a Conversation, oldest first. Only this module
     * reads them, never MCP (GLOSSARY: Run outcome); they stay when the
     * Conversation is closed.
     */
    runOutcomes(id: number): RunOutcome[] {
      return db
        .select()
        .from(runOutcomes)
        .where(eq(runOutcomes.conversationId, id))
        .orderBy(runOutcomes.id)
        .all();
    },

    /**
     * The Conversation's latest Run outcome, for Autopilot to see how its
     * last run ended and whether Autopilot started it; null before any run
     * ended.
     */
    latestRunOutcome(id: number): RunOutcome | null {
      return (
        db
          .select()
          .from(runOutcomes)
          .where(eq(runOutcomes.conversationId, id))
          .orderBy(desc(runOutcomes.id))
          .limit(1)
          .get() ?? null
      );
    },

    /**
     * How each Stage of a Project did over the last 30 days: runs, count per
     * result, total and mean cost, mean duration. Stages with no run in the
     * window are left out.
     */
    runStats(projectId: number): StageRunStats[] {
      const since = new Date(Date.now() - runStatsWindowMs);
      const rows = db
        .select()
        .from(runOutcomes)
        .where(
          and(
            eq(runOutcomes.projectId, projectId),
            gte(runOutcomes.endedAt, since),
          ),
        )
        .orderBy(runOutcomes.id)
        .all();
      const byStage = new Map<ConversationIntent, StageRunStats>();
      for (const row of rows) {
        const stats = byStage.get(row.stage) ?? {
          stage: row.stage,
          runs: 0,
          results: Object.fromEntries(
            runResults.map((result) => [result, 0]),
          ) as Record<RunResult, number>,
          totalCostUsd: 0,
          meanCostUsd: 0,
          meanDurationMs: 0,
        };
        stats.runs += 1;
        stats.results[row.result] += 1;
        stats.totalCostUsd += row.costUsd;
        stats.meanDurationMs += row.endedAt.getTime() - row.startedAt.getTime();
        byStage.set(row.stage, stats);
      }
      return [...byStage.values()].map((stats) => ({
        ...stats,
        meanCostUsd: stats.totalCostUsd / stats.runs,
        meanDurationMs: stats.meanDurationMs / stats.runs,
      }));
    },

    startCostEstimate,

    /** Conversations of a Project and/or Ticket, newest first. */
    list(filter: ListConversationsFilter = {}): Conversation[] {
      const rows = db
        .select()
        .from(conversations)
        .orderBy(desc(conversations.id))
        .all();
      return rows.filter(
        (row) =>
          (filter.projectId === undefined ||
            row.projectId === filter.projectId) &&
          (filter.ticketNumber === undefined ||
            row.ticketNumber === filter.ticketNumber),
      );
    },

    /**
     * Every Conversation, newest first, with the role of its latest
     * transcript entry: what the Board needs to place Tickets (T1065). The
     * latest entries come from one query.
     */
    activityRows(): ActivityRow[] {
      const latestOf = (roles?: TranscriptRole[]) =>
        db
          .select({ id: max(conversationEntries.id) })
          .from(conversationEntries)
          .where(roles ? inArray(conversationEntries.role, roles) : undefined)
          .groupBy(conversationEntries.conversationId);
      const entriesOf = (ids: ReturnType<typeof latestOf>) =>
        db
          .select({
            conversationId: conversationEntries.conversationId,
            role: conversationEntries.role,
            text: conversationEntries.text,
            permissionRules: conversationEntries.permissionRules,
            toolName: conversationEntries.toolName,
            toolInput: conversationEntries.toolInput,
            createdAt: conversationEntries.createdAt,
          })
          .from(conversationEntries)
          .where(inArray(conversationEntries.id, ids))
          .all();
      const latest = new Map(
        entriesOf(latestOf()).map((entry) => [entry.conversationId, entry]),
      );
      const messages = new Map(
        entriesOf(latestOf([...messageRoles])).map((entry) => [
          entry.conversationId,
          entry,
        ]),
      );
      const statusEntryOf = (
        entry: ReturnType<typeof entriesOf>[number] | undefined,
      ): StatusEntry | null =>
        entry
          ? {
              role: entry.role,
              text: entry.text,
              permissionRules: entry.permissionRules,
              toolName: entry.toolName,
              toolInput: entry.toolInput,
            }
          : null;
      // Every run starts with the User's message, so the latest one is the
      // run's start: no column of its own is needed.
      const started = new Map(
        entriesOf(latestOf(['user', 'autopilot'])).map((entry) => [
          entry.conversationId,
          entry.createdAt,
        ]),
      );
      return (
        db
          .select({
            id: conversations.id,
            ticketNumber: conversations.ticketNumber,
            projectId: conversations.projectId,
            state: conversations.state,
            costUsd: conversations.costUsd,
            createdAt: conversations.createdAt,
            startedBy: conversations.startedBy,
            intent: conversations.intent,
            batchTriageTickets: conversations.batchTriageTickets,
          })
          .from(conversations)
          .orderBy(desc(conversations.id))
          .all()
          // A Spar places its focus Ticket only while it waits on the User:
          // thinking an idea through is not work on the Ticket (ADR 0046).
          .filter(
            ({ intent, state }) => intent !== 'spar' || state === 'waiting',
          )
          .map(
            ({
              id,
              ticketNumber,
              projectId,
              state,
              costUsd,
              createdAt,
              startedBy,
              batchTriageTickets,
            }) => {
              return {
                id,
                ticketNumber,
                projectId,
                state,
                costUsd: costUsd ?? 0,
                startedBy,
                batchTriageTickets,
                latest: statusEntryOf(latest.get(id)),
                message: statusEntryOf(messages.get(id)),
                startedAt: (started.get(id) ?? createdAt).toISOString(),
              };
            },
          )
      );
    },

    /**
     * Every Conversation the User has not closed, across all Projects and
     * Tickets, in the order they were opened: the tabs of the Conversation
     * dialog.
     */
    listOpen(): OpenConversation[] {
      const rows = db
        .select()
        .from(conversations)
        .where(eq(conversations.hidden, false))
        .orderBy(conversations.id)
        .all();
      return rows.map((conversation) => ({
        conversation,
        ticketTitle:
          conversation.ticketNumber === null
            ? null
            : tickets.getTicket(conversation.ticketNumber).title,
        projectName: tickets.getProject(conversation.projectId).name,
        firstMessage:
          db
            .select({ text: conversationEntries.text })
            .from(conversationEntries)
            .where(eq(conversationEntries.conversationId, conversation.id))
            .orderBy(conversationEntries.id)
            .limit(1)
            .get()?.text ?? '',
      }));
    },

    /** A Conversation's transcript, oldest entry first. */
    transcript(id: number): TranscriptEntry[] {
      get(id);
      return db
        .select()
        .from(conversationEntries)
        .where(eq(conversationEntries.conversationId, id))
        .orderBy(conversationEntries.id)
        .all();
    },

    /**
     * How long Conversation `id` waited on the User's permission answers, in
     * milliseconds: answered requests only, overlapping waits counted once.
     */
    permissionWaitMs(id: number): number {
      get(id);
      const waits = db
        .select({
          createdAt: conversationEntries.createdAt,
          answeredAt: conversationEntries.answeredAt,
        })
        .from(conversationEntries)
        .where(
          and(
            eq(conversationEntries.conversationId, id),
            isNotNull(conversationEntries.answeredAt),
          ),
        )
        .all();
      return permissionWait(
        waits.flatMap(({ createdAt, answeredAt }) =>
          answeredAt ? [{ createdAt, answeredAt }] : [],
        ),
      );
    },

    start,

    startTerminal,
    startTerminalNext,
    startTerminalPlan,

    endTerminal,
    heartbeatTerminal,
    endIdleTerminals,

    recordTerminalCall,

    /**
     * Continue in terminal (ADR 0039): hands a UI Conversation with an SDK
     * session over to `tandembike resume`. The live run stops as Stop does, so
     * its Run outcome is recorded as stopped and its prompts expire; the
     * Conversation then becomes a Terminal one, `running` until `endTerminal`.
     * Cost and Cycle stay. Refused for a closed Conversation, one already
     * Terminal, one without an SDK session or one whose worktree was removed.
     */
    async handOffToTerminal(id: number): Promise<TerminalHandOff> {
      const conversation = get(id);
      if (isTerminal(conversation)) {
        throw new NotAllowedError(
          'This Conversation already runs in a terminal.',
        );
      }
      if (conversation.hidden) {
        throw new NotAllowedError('This Conversation is closed.');
      }
      if (conversation.sdkSessionId === null) {
        throw new NotAllowedError(
          'This Conversation has no session to continue yet.',
        );
      }
      if (conversation.worktreeRemoved) {
        throw new NotAllowedError(
          'The worktree of this Conversation was removed.',
        );
      }
      const settings = tickets.getProjectAgentSettings(conversation.projectId);
      if (settings.repositoryPath === null) {
        throw new ValidationError(noRepositoryPath);
      }
      // The worktree is the terminal's now: stopping must not release it.
      await stop(id, true);
      append(id, 'session', 'Continued in terminal');
      update(id, { startedBy: 'terminal', state: 'running' });
      announce(id);
      return {
        conversationId: id,
        sessionId: conversation.sdkSessionId,
        cwd: conversation.worktreePath ?? settings.repositoryPath,
        brief: briefOf(id),
        runMode: settings.runMode,
        model: modelFor(conversation.intent, settings),
      };
    },

    /**
     * Starts the Retro of a Cycle: a Conversation about its Project that looks
     * back on the Cycle. The User's click starts it, never Autopilot, so its
     * cost stays out of the Spend ceiling. A Cycle has at most one.
     */
    async startRetro(input: { cycleId: number }): Promise<Conversation> {
      const cycle = tickets.getCycle(input.cycleId);
      return start({
        startedBy: 'user',
        projectId: cycle.projectId,
        intent: 'retro',
        prompt: retroPrompt(
          cycle,
          commandForStage(
            'retro',
            tickets.getProjectAgentCommands(cycle.projectId),
          ),
        ),
        retroCycleId: cycle.id,
      });
    },

    /**
     * Starts a Plan: a Conversation about a Project that proposes a Prepared
     * Cycle toward `goal` (T1248). Only the User starts it, never Autopilot. It
     * runs in the main checkout, outside the Start run limit, and records no
     * Cycle, so it stays out of the Spend ceiling. `tandembike plan` reuses it.
     */
    async startPlan(input: {
      projectId: number;
      goal: string;
    }): Promise<Conversation> {
      const goal = input.goal.trim();
      if (goal === '') {
        throw new ValidationError({ goal: 'Describe the goal to plan for.' });
      }
      return start({
        startedBy: 'user',
        projectId: input.projectId,
        intent: 'plan',
        prompt: planCommandMessage(
          goal,
          tickets.getProjectAgentCommands(input.projectId),
        ),
      });
    },

    retroOf,

    /**
     * Starts a Batch triage of a Board (T1316): a Conversation about the
     * Project that triages `ticketNumbers`, the Board's Batch-triage Tickets
     * when the User pressed Triage N, recorded so the list stays fixed. With
     * one open for the Board, returns it and starts nothing. Only the User
     * starts one; it runs in the main checkout, outside the Start run limit,
     * and records no Cycle for Spend.
     */
    async startBatchTriage(input: {
      projectId: number;
      cycleId: number | null;
      ticketNumbers: number[];
    }): Promise<Conversation> {
      return start({
        startedBy: 'user',
        projectId: input.projectId,
        intent: 'batch_triage',
        prompt: batchTriagePrompt(
          input.cycleId === null ? null : tickets.getCycle(input.cycleId),
          input.ticketNumbers,
        ),
        batchTriage: {
          cycleId: input.cycleId,
          ticketNumbers: input.ticketNumbers,
        },
      });
    },

    openBatchTriage,

    /**
     * The open Batch triages that list Ticket `number`, newest first: its
     * drawer links to them as to its own Conversations (T1319).
     */
    openBatchTriagesOf(number: number): Conversation[] {
      return db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.intent, 'batch_triage'),
            eq(conversations.hidden, false),
          ),
        )
        .orderBy(desc(conversations.id))
        .all()
        .filter((conversation) =>
          (conversation.batchTriageTickets ?? []).includes(number),
        );
    },

    /**
     * Sends a reply, the User's or Autopilot's: into the run while it is
     * alive, otherwise into a new run that resumes the stored SDK session.
     * The User's reply is never refused by the Start run limit, so the User
     * can always answer their Conversations; Autopilot's is (ADR 0031).
     * `transientResume` marks Autopilot's automatic resume of a transient end
     * (ADR 0034), recorded on the run's outcome so it is resumed only once.
     * `stage` records the run's outcome under another Stage than the
     * Conversation's intent, for the merge of Approve merge (ADR 0038).
     */
    async reply(
      id: number,
      text: string,
      sentBy: ConversationSender,
      options: { transientResume?: boolean; stage?: ConversationIntent } = {},
    ): Promise<Conversation> {
      const transientResume = options.transientResume ?? false;
      const { stage } = options;
      const message = (text ?? '').trim();
      if (message === '') {
        throw new ValidationError({ text: 'Write a reply first.' });
      }
      const conversation = get(id);
      refuseTerminal(conversation);
      // No reply reaches a run whose worktree is gone, live or not (T1281).
      if (
        conversation.worktreePath !== null &&
        (conversation.worktreeRemoved ||
          (await worktrees.state(conversation.worktreePath)) === 'missing')
      ) {
        throw new ValidationError({
          text: `The worktree of this Conversation is gone (${conversation.worktreePath}), so a reply cannot resume in it.`,
        });
      }
      // A stopped or closed Conversation keeps its tab, and a reply resumes
      // it from its SDK session, reopening it when it was closed.
      if (conversation.hidden) {
        setHidden(id, false);
      }

      const limited = sentBy !== 'user';
      const handle = live.get(id);
      if (handle?.process) {
        checkStartLimit(
          conversation.projectId,
          limited ? conversation.intent : 'reply',
          id,
        );
        await stepRun(
          id,
          handle,
          { type: 'reply', text: message, sentBy, transientResume, stage },
          get(id),
        );
        return get(id);
      } else {
        startRun(
          id,
          message,
          conversation.sdkSessionId ?? undefined,
          limited,
          sentBy,
          transientResume,
          stage,
        );
        append(id, sentBy, message);
        update(id, { state: 'running' });
      }
      announce(id);
      return get(id);
    },

    /**
     * The User approves the merge of the Ticket or Epic `ticketNumber` in
     * Review (ADR 0038): a pull request, no Claim, not Done and no working
     * Conversation. An open Start Conversation that waits resumes with the
     * fixed reply; otherwise a Merge Conversation starts. Only a Server
     * Action calls it, so neither Autopilot nor an Agent can approve.
     */
    async approveMerge(input: { ticketNumber: number }): Promise<Conversation> {
      const ticket = tickets.getTicket(input.ticketNumber);
      const label = `T${ticket.number}`;
      if (ticket.status === 'Done') {
        throw new NotAllowedError(`${label} is already Done.`);
      }
      if (!isInReview(ticket)) {
        throw new NotAllowedError(
          ticket.status !== 'In progress'
            ? `${label} is not in Review: only a Ticket whose work is handed off can be approved for a merge.`
            : `${label} has no pull request to merge. Add its reference first.`,
        );
      }
      if (ticket.claim !== null) {
        throw new NotAllowedError(
          `${label} is claimed by a run that is still working on it.`,
        );
      }
      const own = db
        .select()
        .from(conversations)
        .where(eq(conversations.ticketNumber, ticket.number))
        .orderBy(desc(conversations.id))
        .all();
      if (
        own.some(
          (row) =>
            row.intent !== 'spar' &&
            (row.state === 'running' || row.state === 'waiting'),
        )
      ) {
        throw new NotAllowedError(
          `A Conversation is working on ${label}. Wait for it, or stop it.`,
        );
      }
      const startRow = own.find((row) => row.intent === 'start' && !row.hidden);
      if (startRow && isOpenForMergeResume(startRow)) {
        // A Start whose process ended takes a slot again for the merge, so
        // the merge is limited as a Merge Conversation is (ADR 0049).
        if (!live.has(startRow.id)) {
          checkStartLimit(startRow.projectId, 'merge', startRow.id);
        }
        return this.reply(
          startRow.id,
          `Approved: merge ${label} now by the Playbook's merge steps, then finish_work.`,
          'user',
          { stage: 'merge' },
        );
      }
      return start({
        startedBy: 'user',
        ticketNumber: ticket.number,
        intent: 'merge',
        prompt: agentCommandMessage(
          'merge',
          ticket,
          tickets.getProjectAgentCommands(ticket.projectId),
        ),
      });
    },

    /** Interrupts the run, ends it and marks the Conversation stopped. */
    async stop(id: number): Promise<Conversation> {
      return stop(id);
    },

    /**
     * Closes a Conversation, about a Ticket or a Project: stops its run and
     * takes it off the open Conversations. Its transcript stays.
     */
    async close(id: number): Promise<Conversation> {
      const conversation = get(id);
      if (conversation.state !== 'stopped') {
        refuseTerminal(conversation);
      }
      await stepRun(id, live.get(id) ?? null, { type: 'close' }, conversation);
      return get(id);
    },

    /**
     * The User's Remove worktree of a kept worktree, after confirming. It
     * removes it when it is clean now, and otherwise refuses naming the state.
     */
    async removeWorktree(id: number): Promise<Conversation> {
      const conversation = get(id);
      if (conversation.worktreePath === null || conversation.worktreeRemoved) {
        throw new NotAllowedError('This Conversation has no worktree.');
      }
      const state = await worktrees.state(conversation.worktreePath);
      if (state === 'dirty' || state === 'unpushed') {
        update(id, { worktreeKept: state });
        announce(id);
        throw new NotAllowedError(
          state === 'dirty'
            ? 'The worktree still has uncommitted changes, so it was not removed.'
            : 'The worktree still has commits that no remote branch contains, so it was not removed.',
        );
      }
      await releaseWorktree(id);
      return get(id);
    },

    /**
     * For the server to call once on start: removes the clean worktrees of
     * closed Conversations, and of Conversations that no longer exist whose
     * worktree this server's data folder made, so a crash mid-removal leaks
     * no folders. Dirty and unpushed ones stay.
     */
    async cleanupWorktrees(): Promise<void> {
      const closed = db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.hidden, true),
            isNotNull(conversations.worktreePath),
            eq(conversations.worktreeRemoved, false),
          ),
        )
        .all();
      for (const { id } of closed) {
        await tryRelease(id);
      }
      for (const found of await worktrees.list()) {
        const exists = db
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.id, found.conversationId))
          .get();
        // A server with another data folder, such as a throwaway dev server,
        // shares the worktrees folder: its database lacks this server's
        // Conversations, so it only sweeps worktrees it made (T1279).
        if (exists || !found.owned) {
          continue;
        }
        // The Project may be gone or have no path; the worktree knows its repository.
        const repositoryPath =
          repositoryPathOf(found.projectId) ??
          (await worktrees.repositoryOf(found.path));
        if (repositoryPath === null) {
          continue;
        }
        if ((await worktrees.state(found.path)) === 'clean') {
          await worktrees
            .remove(repositoryPath, found.path)
            .catch(() => undefined);
        }
      }
    },

    /** Opens a closed Conversation again. It stays stopped until a reply. */
    async reopen(id: number): Promise<Conversation> {
      get(id);
      setHidden(id, false);
      announce(id);
      return get(id);
    },

    /**
     * The User's Allow, Always allow or Deny of a permission request in a
     * transcript; the waiting run goes on. Always allow also saves the rules
     * the run proposed, so it is refused on a request without any. Refused
     * once answered or when its run is gone.
     */
    async answerPermission(
      entryId: number,
      answer: PermissionAnswer,
    ): Promise<Conversation> {
      if (!permissionAnswers.includes(answer)) {
        throw new ValidationError({
          answer: 'Answer Allow, Always allow or Deny.',
        });
      }
      const entry = db
        .select()
        .from(conversationEntries)
        .where(eq(conversationEntries.id, entryId))
        .get();
      if (entry?.role !== 'permission') {
        throw new NotFoundError(`There is no permission request ${entryId}.`);
      }
      refuseTerminal(get(entry.conversationId));
      const handle = live.get(entry.conversationId);
      const resolve = handle?.asking.get(entryId);
      if (!handle || !resolve) {
        throw new NotAllowedError('This request is no longer waiting.');
      }
      if (answer === 'allow-always' && !entry.permissionRules?.length) {
        throw new NotAllowedError('This request proposes no rule to allow.');
      }
      handle.asking.delete(entryId);
      setPermission(entryId, permissionStatusOf[answer], clock());
      if (!waitsOnUser(handle)) {
        update(entry.conversationId, { state: 'running' });
      }
      announce(entry.conversationId);
      resolve(answer);
      return get(entry.conversationId);
    },

    /**
     * Expires the Widgets Conversation `id`'s run waits on, resolving each
     * `{ expired: true }`, so the run goes on, such as when a Spar closes
     * while a Widget is unanswered. Nothing when none waits.
     */
    expireWidgets(id: number): void {
      const handle = live.get(id);
      if (!handle || handle.widgets.size === 0) {
        return;
      }
      expireWidgets(handle);
      if (!waitsOnUser(handle)) {
        update(id, { state: 'running' });
      }
      announce(id);
    },

    /**
     * The User's answer to a Widget of Conversation `conversationId` (ADR
     * 0045): its own kind of answer, Other or Skip, checked against the
     * Widget. The waiting run goes on with it. Refused when it does not fit,
     * once answered, or when its run is gone, each with its own reason.
     */
    async answerWidget(
      conversationId: number,
      entryId: number,
      answer: unknown,
    ): Promise<Conversation> {
      const entry = getEntry(entryId);
      if (
        entry?.role !== 'widget' ||
        !entry.widget ||
        entry.conversationId !== conversationId
      ) {
        throw new NotFoundError(`There is no Widget ${entryId}.`);
      }
      refuseTerminal(get(conversationId));
      if (entry.widget.answer !== null) {
        throw new NotAllowedError('This Widget was already answered.');
      }
      const handle = live.get(conversationId);
      const resolve = handle?.widgets.get(entryId);
      if (!handle || !resolve || entry.widget.expired) {
        throw new NotAllowedError('This Widget is no longer waiting.');
      }
      const given = checkWidgetAnswer(entry.widget.widget, answer);
      handle.widgets.delete(entryId);
      setWidget(entryId, { ...entry.widget, answer: given });
      if (!waitsOnUser(handle)) {
        update(conversationId, { state: 'running' });
      }
      announce(conversationId);
      resolve(given);
      return get(conversationId);
    },

    /**
     * Marks as interrupted every Conversation, but a Terminal one, that says its run is alive,
     * for the server to call once on start, when all its runs are dead.
     * Returns how many it marked.
     */
    interruptStale(): number {
      const stale = db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            inArray(conversations.state, liveStates),
            // A Terminal session outlives the server; the idle sweep ends it
            // if its CLI is gone (ADR 0039).
            ne(conversations.startedBy, 'terminal'),
          ),
        )
        .all();
      db.update(conversationEntries)
        .set({ permission: 'expired' })
        .where(eq(conversationEntries.permission, 'pending'))
        .run();
      const questions = db
        .select()
        .from(conversationEntries)
        .where(eq(conversationEntries.role, 'question'))
        .all();
      for (const { id, question } of questions) {
        if (question && question.answers === null && !question.expired) {
          setQuestion(id, { ...question, expired: true });
        }
      }
      const widgets = db
        .select()
        .from(conversationEntries)
        .where(eq(conversationEntries.role, 'widget'))
        .all();
      for (const { id, widget } of widgets) {
        if (widget && widget.answer === null && !widget.expired) {
          setWidget(id, { ...widget, expired: true });
        }
      }
      for (const { id } of stale) {
        update(id, { state: 'interrupted' });
        announce(id);
      }
      return stale.length;
    },
  };
}

export type Conversations = ReturnType<typeof createConversations>;
