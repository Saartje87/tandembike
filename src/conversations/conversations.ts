import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  max,
  ne,
  sql,
} from 'drizzle-orm';

import { canSpec, isInReview } from '../components/board/board-lanes';
import type { DatabaseConnection } from '../db/connection';
import { conversationEntries, conversations, runOutcomes } from '../db/schema';
import { playbookPath } from '../playbook/playbook';
import {
  agentCommandMessage,
  commandForStage,
} from '../tickets/agent-commands';
import type { ChangeChannel } from '../tickets/changes';
import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';
import { isPullRequestReference } from '../tickets/external-reference-display';
import type { TicketType } from '../tickets/ticket-type';
import type { Tickets } from '../tickets/tickets';
import type { NoWorkReason } from '../tickets/work';
import type { KeptWorktreeState, Worktrees } from '../worktrees/worktrees';
import type {
  AgentRun,
  AgentRunner,
  PermissionRequest,
  Question,
  QuestionAnswers,
  RunEvent,
} from './agent-runner';
import type { ActivityRow } from './conversation-activity';
import {
  type ConversationIntent,
  type ConversationStarter,
  type ConversationState,
  type PermissionAnswer,
  type PermissionStatus,
  permissionAnswers,
  permissionStatusOf,
  type QuestionEntry,
  type TranscriptRole,
} from './conversation-state';
import { retroPrompt } from './retro-prompt';
import { type NewTicketDefaults, runBrief } from './run-brief';
import { type RunResult, runResultOf, runResults } from './run-outcome';

/** Who sends a reply: the User, or Autopilot in their place. */
export type ConversationSender = Exclude<ConversationStarter, 'terminal'>;

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

const runStatsWindowMs = 30 * 24 * 60 * 60 * 1000;

/** The `/command` a message starts with, such as `/implement`; null for none. */
const commandOf = (message: string): string | null =>
  /^\/[\w:-]+/.exec(message.trim())?.[0] ?? null;

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
  createdAt: Date;
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
  /** New Ticket: where the title field was; the Agent's defaults. */
  defaults?: NewTicketDefaults;
};

/** The Stages `tandembike` opens in a terminal (ADR 0039). */
export type TerminalIntent = 'start' | 'triage' | 'spec';

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

export type StartTerminalInput = {
  ticketNumber: number;
  intent: TerminalIntent;
};

/** How long a Terminal Conversation may be silent before the sweep ends it. */
const terminalIdleMs = 5 * 60 * 1000;

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
};

/** A live run of a Conversation, and what the Conversation cost before it. */
type LiveRun = {
  run: AgentRun | null;
  costBefore: number;
  /** Set when the User stopped the run; it still reports its last cost. */
  stopped?: boolean;
  /** The model the run reported in its init message. */
  model: string | null;
  /** The `stopped` outcome of this run, waiting for the cost its last turn reports. */
  stoppedOutcome?: { id: number; costAtStart: number };
  /** Its Ticket reached Done while it was alive: release the worktree when it ends. */
  releaseWhenEnded?: boolean;
  /**
   * The message the run is working on, until it ends (a turn, an exit or a
   * stop): what its Run outcome is recorded from. Null between runs.
   */
  pending: PendingRun | null;
  /** Permission requests waiting for the User, by transcript entry id. */
  asking: Map<number, (answer: PermissionAnswer) => void>;
  /** Questions waiting for the User, by transcript entry id. */
  questioning: Map<number, (answers: QuestionAnswers) => void>;
};

/** A run's start, recorded when its message goes in. */
type PendingRun = {
  startedAt: Date;
  /** The Conversation's cost when the run began. */
  costAtStart: number;
  command: string | null;
  startedByAutopilot: boolean;
  transientResume: boolean;
  /**
   * The Stage this run is, when it is not the Conversation's intent: the
   * resume of Approve merge is a `merge` run in a Start Conversation (ADR 0038).
   */
  stage?: ConversationIntent;
};

const liveStates: ConversationState[] = ['running', 'waiting', 'idle'];

const noRepositoryPath = {
  repositoryPath:
    'This Project has no repository path. Set one in the Project settings first.',
};

/** A Start and a Merge are the intents that count as Start runs (T1221). */
const isStartRunIntent = (intent: ConversationIntent) =>
  intent === 'start' || intent === 'merge';

/**
 * Whether a Conversation holds one of its Project's Start run slots: a Start
 * or a Merge whose run is working, running or waiting on a permission. An
 * idle one waits for a reply and holds none (ADR 0019). A Terminal
 * Conversation has no run in the server and holds none (ADR 0039).
 */
export const holdsStartRunSlot = (conversation: {
  intent: ConversationIntent;
  state: ConversationState;
  startedBy: ConversationStarter;
}): boolean =>
  conversation.startedBy !== 'terminal' &&
  isStartRunIntent(conversation.intent) &&
  (conversation.state === 'running' || conversation.state === 'waiting');

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

/** How many Start runs a Project allows at once (T588 settings). */
export const startRunLimit = (settings: {
  parallelRuns: boolean;
  maxConcurrentRuns: number;
}) => (settings.parallelRuns ? settings.maxConcurrentRuns : 1);

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
}: ConversationsDeps) {
  /** The runs alive in this process, by Conversation id. */
  const live = new Map<number, LiveRun>();

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
        | 'sdkSessionId'
        | 'costUsd'
        | 'worktreePath'
        | 'worktreeKept'
        | 'worktreeRemoved'
      > & {
        worktreeBase: string | null;
      }
    >,
  ) => {
    db.update(conversations)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .run();
  };

  /**
   * Records the Run outcome of the run `handle` is working on, if it is
   * still working: a turn result, an exit or a stop each end it, once.
   * `cost` is the Conversation's cost now.
   */
  const recordOutcome = (
    id: number,
    handle: LiveRun,
    end: {
      stopped?: boolean;
      error?: string;
      errorSubtype?: string;
      cost: number;
    },
  ) => {
    const pending = handle.pending;
    if (!pending) {
      return undefined;
    }
    handle.pending = null;
    const conversation = get(id);
    const ticket =
      conversation.ticketNumber === null
        ? null
        : tickets.getTicket(conversation.ticketNumber);
    const result = runResultOf({
      stopped: end.stopped ?? false,
      error: end.error,
      errorSubtype: end.errorSubtype,
      ticketStatus: ticket?.status ?? null,
      hasPullRequest:
        ticket !== null &&
        (ticket.externalReferences.some(isPullRequestReference) ||
          ticket.epic?.hasPullRequest === true),
      intent: conversation.intent,
    });
    return db
      .insert(runOutcomes)
      .values({
        conversationId: id,
        projectId: conversation.projectId,
        ticketNumber: conversation.ticketNumber,
        stage: pending.stage ?? conversation.intent,
        result,
        startedAt: pending.startedAt,
        endedAt: new Date(),
        costUsd: Math.max(0, end.cost - pending.costAtStart),
        model: handle.model,
        command: pending.command,
        startedByAutopilot: pending.startedByAutopilot,
        transientResume: pending.transientResume,
      })
      .returning({ id: runOutcomes.id })
      .get().id;
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
      question?: QuestionEntry;
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
        question: extra.question ?? null,
        createdAt: new Date(),
      })
      .returning({ id: conversationEntries.id })
      .get().id;

  const setPermission = (entryId: number, permission: PermissionStatus) => {
    db.update(conversationEntries)
      .set({ permission })
      .where(eq(conversationEntries.id, entryId))
      .run();
  };

  /** Denies the requests a run still waits on, as its Conversation ended. */
  const expireAsking = (handle: LiveRun) => {
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

  /** Resolves empty the questions a run still waits on, as its Conversation ended. */
  const expireQuestioning = (handle: LiveRun) => {
    for (const [entryId, resolve] of handle.questioning) {
      const question = getEntry(entryId)?.question;
      if (question) {
        setQuestion(entryId, { ...question, expired: true });
      }
      resolve({});
    }
    handle.questioning.clear();
  };

  const askQuestion = (
    id: number,
    handle: LiveRun,
    questions: Question[],
  ): Promise<QuestionAnswers> => {
    if (live.get(id) !== handle) {
      return Promise.resolve({});
    }
    const entryId = append(
      id,
      'question',
      questions.map((question) => question.question).join('\n'),
      { question: { questions, answers: null, expired: false } },
    );
    update(id, { state: 'waiting' });
    announce(id);
    return new Promise((resolve) => {
      handle.questioning.set(entryId, resolve);
    });
  };

  const askPermission = (
    id: number,
    handle: LiveRun,
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

  const handleEvent = (id: number, handle: LiveRun, event: RunEvent) => {
    // A run that was replaced or stopped no longer speaks for the Conversation.
    if (live.get(id) !== handle) {
      // An interrupted turn reports its cost after the stop (T587).
      if (handle.stopped && event.type === 'turn') {
        // The stopped outcome takes the first cost the stopped turn reports.
        const outcome = handle.stoppedOutcome;
        if (outcome) {
          handle.stoppedOutcome = undefined;
          db.update(runOutcomes)
            .set({
              costUsd: Math.max(
                0,
                handle.costBefore + event.costUsd - outcome.costAtStart,
              ),
            })
            .where(eq(runOutcomes.id, outcome.id))
            .run();
        }
        update(id, { costUsd: handle.costBefore + event.costUsd });
        announce(id);
      }
      return;
    }
    switch (event.type) {
      case 'session':
        handle.model = event.model ?? handle.model;
        update(id, { sdkSessionId: event.sessionId });
        break;
      case 'agent':
        append(id, 'agent', event.text);
        break;
      case 'tool':
        append(
          id,
          'tool',
          event.text,
          event.name === undefined
            ? {}
            : { tool: { name: event.name, input: event.input } },
        );
        break;
      case 'created':
        append(
          id,
          'created',
          `Created ${event.numbers.map((number) => `T${number}`).join(', ')}`,
        );
        break;
      case 'turn':
        if (event.error) {
          append(id, 'error', event.error);
        }
        update(id, {
          state: 'idle',
          costUsd: handle.costBefore + event.costUsd,
        });
        recordOutcome(id, handle, {
          error: event.error,
          errorSubtype: event.errorSubtype,
          cost: handle.costBefore + event.costUsd,
        });
        break;
      case 'waiting':
        update(id, { state: event.waiting ? 'waiting' : 'running' });
        break;
      case 'exit': {
        live.delete(id);
        expireAsking(handle);
        expireQuestioning(handle);
        if (event.error) {
          append(id, 'error', event.error);
        }
        // A run that ends is interrupted, even between turns: a reply
        // resumes it, but nothing waits on the User (T587).
        update(id, { state: 'interrupted' });
        recordOutcome(id, handle, {
          error: event.error,
          cost: get(id).costUsd,
        });
        if (handle.releaseWhenEnded) {
          void tryRelease(id);
        }
        break;
      }
    }
    announce(id);
  };

  /**
   * Refuses a Start run beyond the Project's limit: a Start is not queued
   * (ADR 0019). A Merge counts like a Start; Triage and Ask are never
   * limited, and do not count. Slots are counted by `holdsStartRunSlot`.
   * `exceptId` is the Conversation about to work, not counted against
   * itself. The User's reply skips this check (ADR 0031).
   */
  const checkStartLimit = (
    projectId: number,
    intent: ConversationIntent,
    settings: { parallelRuns: boolean; maxConcurrentRuns: number },
    exceptId?: number,
  ) => {
    if (!isStartRunIntent(intent)) {
      return;
    }
    const limit = startRunLimit(settings);
    let running = 0;
    for (const id of live.keys()) {
      const other = get(id);
      if (
        id !== exceptId &&
        other.projectId === projectId &&
        holdsStartRunSlot(other)
      ) {
        running += 1;
      }
    }
    if (running >= limit) {
      throw new NotAllowedError(
        settings.parallelRuns
          ? `This Project already has ${running} Start runs working, the most it allows at once. Stop one, or raise max concurrent Start runs in the Project settings.`
          : 'This Project already has a Start run working. Stop it first, or turn on Parallel runs in the Project settings to allow more.',
      );
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
      .set({ hidden, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .run();
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
      terminal: conversation.startedBy === 'terminal',
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
    if (limited) {
      checkStartLimit(
        conversation.projectId,
        conversation.intent,
        settings,
        id,
      );
    }
    const handle: LiveRun = {
      run: null,
      costBefore: conversation.costUsd,
      model: null,
      pending: {
        startedAt: new Date(),
        costAtStart: conversation.costUsd,
        command: commandOf(prompt),
        startedByAutopilot: sentBy === 'autopilot',
        transientResume,
        stage,
      },
      asking: new Map(),
      questioning: new Map(),
    };
    live.set(id, handle);
    try {
      handle.run = runner.start({
        cwd: conversation.worktreePath ?? settings.repositoryPath,
        agentRunId: String(id),
        mcpUrl,
        plugins: [{ type: 'local', path: playbookPath }],
        systemPrompt: briefOf(id),
        prompt,
        runMode: settings.runMode,
        ...(settings.runModel === null ? {} : { model: settings.runModel }),
        ...(resume === undefined ? {} : { resume }),
        askPermission: (request) => askPermission(id, handle, request),
        askQuestion: (questions) => askQuestion(id, handle, questions),
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
    const settings = tickets.getProjectAgentSettings(projectId);
    if (settings.repositoryPath === null) {
      throw new ValidationError(noRepositoryPath);
    }
    checkStartLimit(projectId, input.intent, settings);

    const now = new Date();
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
    if (conversation.startedBy === 'terminal') {
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
    const now = new Date();
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
      model: settings.runModel,
    };
  };

  /**
   * `tandembike next` (T1240): starts a Terminal Start on the top Eligible
   * item of the Active Cycle of the Project whose repository holds `folder`,
   * by the `next_work` rule. With no work it returns `next_work`'s reason.
   */
  const startTerminalNext = async (folder: string): Promise<TerminalNext> => {
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
    if (conversation.startedBy !== 'terminal') {
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
   * activity. Anything but an open Terminal Conversation's id is ignored.
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
      conversation.startedBy !== 'terminal' ||
      conversation.state === 'stopped'
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
  const heartbeatTerminal = (id: number, now: Date = new Date()) => {
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
  const endIdleTerminals = (now: Date = new Date()): number => {
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
      append(id, 'session', 'Session timed out (no activity for 5 minutes).');
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
    announce(id);
  };

  /** Releases quietly: a failure leaves the worktree for the User's button. */
  const tryRelease = (id: number) => releaseWorktree(id).catch(() => undefined);

  // A Ticket reaching Done, by `finish_work` or the Merged button, frees
  // the worktrees of its Conversations.
  changes?.subscribe((change) => {
    if (change.type !== 'ticket' && change.type !== 'tickets') {
      return;
    }
    const numbers = change.type === 'ticket' ? [change.number] : change.numbers;
    for (const number of numbers) {
      let status: string;
      try {
        status = tickets.getTicket(number).status;
      } catch {
        continue;
      }
      if (status !== 'Done') {
        continue;
      }
      const open = db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.ticketNumber, number),
            isNotNull(conversations.worktreePath),
            eq(conversations.worktreeRemoved, false),
          ),
        )
        .all();
      for (const { id } of open) {
        const handle = live.get(id);
        if (handle?.run) {
          // The run still works in the worktree, so it is released at its end.
          handle.releaseWhenEnded = true;
        } else {
          void tryRelease(id);
        }
      }
    }
  });

  return {
    get,

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
      // Every run starts with the User's message, so the latest one is the
      // run's start: no column of its own is needed.
      const started = new Map(
        entriesOf(latestOf(['user', 'autopilot'])).map((entry) => [
          entry.conversationId,
          entry.createdAt,
        ]),
      );
      return db
        .select({
          id: conversations.id,
          ticketNumber: conversations.ticketNumber,
          projectId: conversations.projectId,
          state: conversations.state,
          costUsd: conversations.costUsd,
          createdAt: conversations.createdAt,
        })
        .from(conversations)
        .orderBy(desc(conversations.id))
        .all()
        .map(({ id, ticketNumber, projectId, state, costUsd, createdAt }) => {
          const entry = latest.get(id);
          return {
            id,
            ticketNumber,
            projectId,
            state,
            costUsd: costUsd ?? 0,
            latest: entry
              ? {
                  role: entry.role,
                  text: entry.text,
                  permissionRules: entry.permissionRules,
                  toolName: entry.toolName,
                  toolInput: entry.toolInput,
                }
              : null,
            startedAt: (started.get(id) ?? createdAt).toISOString(),
          };
        });
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

    start,

    startTerminal,
    startTerminalNext,

    endTerminal,
    heartbeatTerminal,
    endIdleTerminals,

    recordTerminalCall,

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

    retroOf,

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
      if (
        conversation.worktreePath !== null &&
        !live.get(id)?.run &&
        (await worktrees.state(conversation.worktreePath)) === 'missing'
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
      if (handle?.run) {
        if (limited) {
          checkStartLimit(
            conversation.projectId,
            conversation.intent,
            tickets.getProjectAgentSettings(conversation.projectId),
            id,
          );
        }
        append(id, sentBy, message);
        update(id, { state: 'running' });
        handle.pending ??= {
          startedAt: new Date(),
          costAtStart: conversation.costUsd,
          command: commandOf(message),
          startedByAutopilot: sentBy === 'autopilot',
          transientResume,
          stage,
        };
        handle.run.send(message);
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
        own.some((row) => row.state === 'running' || row.state === 'waiting')
      ) {
        throw new NotAllowedError(
          `A Conversation is working on ${label}. Wait for it, or stop it.`,
        );
      }
      const startRow = own.find((row) => row.intent === 'start' && !row.hidden);
      if (startRow && isOpenForMergeResume(startRow)) {
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
      const conversation = get(id);
      if (conversation.state === 'stopped') {
        return conversation;
      }
      refuseTerminal(conversation);
      const handle = live.get(id);
      live.delete(id);
      if (handle) {
        const costAtStart = handle.pending?.costAtStart ?? 0;
        const outcomeId = recordOutcome(id, handle, {
          stopped: true,
          cost: conversation.costUsd,
        });
        if (outcomeId !== undefined) {
          handle.stoppedOutcome = { id: outcomeId, costAtStart };
        }
        handle.stopped = true;
        expireAsking(handle);
        expireQuestioning(handle);
      }
      update(id, { state: 'stopped' });
      announce(id);
      if (handle?.run) {
        try {
          await handle.run.interrupt();
        } finally {
          handle.run.close();
        }
      }
      if (handle?.releaseWhenEnded) {
        await tryRelease(id);
      }
      return get(id);
    },

    /**
     * Closes a Conversation, about a Ticket or a Project: stops its run and
     * takes it off the open Conversations. Its transcript stays.
     */
    async close(id: number): Promise<Conversation> {
      await this.stop(id);
      setHidden(id, true);
      announce(id);
      await tryRelease(id);
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
     * closed Conversations, and of Conversations that no longer exist, so a
     * crash mid-removal leaks no folders. Dirty ones stay.
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
        if (exists) {
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
      setPermission(entryId, permissionStatusOf[answer]);
      if (handle.asking.size === 0 && handle.questioning.size === 0) {
        update(entry.conversationId, { state: 'running' });
      }
      announce(entry.conversationId);
      resolve(answer);
      return get(entry.conversationId);
    },

    /**
     * The User's answers to an Agent's question, by question text; the waiting
     * run goes on. Every question needs an answer. Refused once answered or
     * when its run is gone, each with its own reason.
     */
    async answerQuestion(
      entryId: number,
      answers: QuestionAnswers,
    ): Promise<Conversation> {
      const entry = getEntry(entryId);
      if (entry?.role !== 'question' || !entry.question) {
        throw new NotFoundError(`There is no question ${entryId}.`);
      }
      refuseTerminal(get(entry.conversationId));
      if (entry.question.answers !== null) {
        throw new NotAllowedError('This question was already answered.');
      }
      const handle = live.get(entry.conversationId);
      const resolve = handle?.questioning.get(entryId);
      if (!handle || !resolve) {
        throw new NotAllowedError('This question is no longer waiting.');
      }
      const given: QuestionAnswers = {};
      const missing: Record<string, string> = {};
      for (const { question } of entry.question.questions) {
        const answer = String(answers?.[question] ?? '').trim();
        if (answer === '') {
          missing[question] = 'Answer this question.';
        } else {
          given[question] = answer;
        }
      }
      if (Object.keys(missing).length > 0) {
        throw new ValidationError(missing);
      }
      handle.questioning.delete(entryId);
      setQuestion(entryId, { ...entry.question, answers: given });
      if (handle.asking.size === 0 && handle.questioning.size === 0) {
        update(entry.conversationId, { state: 'running' });
      }
      announce(entry.conversationId);
      resolve(given);
      return get(entry.conversationId);
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
      for (const { id } of stale) {
        update(id, { state: 'interrupted' });
        announce(id);
      }
      return stale.length;
    },
  };
}

export type Conversations = ReturnType<typeof createConversations>;
