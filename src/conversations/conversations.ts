import { and, desc, eq, gte, inArray, max, sql } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { conversationEntries, conversations, runOutcomes } from '../db/schema';
import type { ChangeChannel } from '../tickets/changes';
import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';
import { isPullRequestReference } from '../tickets/external-reference-display';
import type { TicketType } from '../tickets/ticket-type';
import type { Tickets } from '../tickets/tickets';
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
export type ConversationSender = ConversationStarter;

export type Conversation = {
  id: number;
  projectId: number;
  ticketNumber: number | null;
  intent: ConversationIntent;
  state: ConversationState;
  /** Who started it, the User or Autopilot. */
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
  startedBy: ConversationStarter;
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
};

const liveStates: ConversationState[] = ['running', 'waiting', 'idle'];

const noRepositoryPath = {
  repositoryPath:
    'This Project has no repository path. Set one in the Project settings first.',
};

/** How many Start runs a Project allows at once (T588 settings). */
export const startRunLimit = (settings: {
  parallelRuns: boolean;
  maxConcurrentRuns: number;
}) => (settings.parallelRuns ? settings.maxConcurrentRuns : 1);

/**
 * Conversations (ADR 0019): the User's exchanges with Agent runs that
 * Tandembike starts. Runs begin, receive replies and stop only through this
 * module, which only Server Actions call. Every change is stored and
 * announced as a `conversation` change over the events route (ADR 0005).
 */
export function createConversations({
  db,
  tickets,
  changes,
  runner,
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
    values: Partial<Pick<Conversation, 'state' | 'sdkSessionId' | 'costUsd'>>,
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
    end: { stopped?: boolean; error?: string; cost: number },
  ) => {
    const pending = handle.pending;
    if (!pending) {
      return;
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
      ticketStatus: ticket?.status ?? null,
      hasPullRequest:
        ticket !== null &&
        (ticket.externalReferences.some(isPullRequestReference) ||
          ticket.epic?.hasPullRequest === true),
      intent: conversation.intent,
    });
    db.insert(runOutcomes)
      .values({
        conversationId: id,
        projectId: conversation.projectId,
        ticketNumber: conversation.ticketNumber,
        stage: conversation.intent,
        result,
        startedAt: pending.startedAt,
        endedAt: new Date(),
        costUsd: Math.max(0, end.cost - pending.costAtStart),
        model: handle.model,
        command: pending.command,
        startedByAutopilot: pending.startedByAutopilot,
      })
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
        break;
      }
    }
    announce(id);
  };

  /**
   * Refuses a Start run beyond the Project's limit: a Start is not queued
   * (ADR 0019). Triage and Ask are never limited, and do not count. Only
   * Starts that are working count, running or waiting on a permission: an
   * idle Start waits for a reply and holds no slot. `exceptId` is the
   * Conversation about to work, not counted against itself. The User's
   * reply skips this check (ADR 0031).
   */
  const checkStartLimit = (
    projectId: number,
    intent: ConversationIntent,
    settings: { parallelRuns: boolean; maxConcurrentRuns: number },
    exceptId?: number,
  ) => {
    if (intent !== 'start') {
      return;
    }
    const limit = startRunLimit(settings);
    let running = 0;
    for (const id of live.keys()) {
      const other = get(id);
      if (
        id !== exceptId &&
        other.projectId === projectId &&
        other.intent === 'start' &&
        (other.state === 'running' || other.state === 'waiting')
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

  const setHidden = (id: number, hidden: boolean) => {
    db.update(conversations)
      .set({ hidden, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .run();
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
    const ticket =
      conversation.ticketNumber === null
        ? null
        : tickets.getTicket(conversation.ticketNumber);

    const handle: LiveRun = {
      run: null,
      costBefore: conversation.costUsd,
      model: null,
      pending: {
        startedAt: new Date(),
        costAtStart: conversation.costUsd,
        command: commandOf(prompt),
        startedByAutopilot: sentBy === 'autopilot',
      },
      asking: new Map(),
      questioning: new Map(),
    };
    live.set(id, handle);
    try {
      handle.run = runner.start({
        cwd: settings.repositoryPath,
        mcpUrl,
        systemPrompt: runBrief({
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
          checkCommand: settings.checkCommand,
          runMode: settings.runMode,
          defaults: {
            cycleId: conversation.defaultCycleId,
            epicNumber: conversation.defaultEpicNumber,
            type: conversation.defaultType,
          },
        }),
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

  return {
    get,

    /**
     * What Autopilot has spent on a Cycle in USD (ADR 0030, GLOSSARY: Spend
     * ceiling): the total cost of the Conversations it started for that Cycle,
     * resumes included, since a resume adds to its Conversation. Hand-started
     * ones do not count, and the next Cycle starts again at zero.
     */
    autopilotSpend(input: { projectId: number; cycleId: number }): number {
      const row = db
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
      return row?.total ?? 0;
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
          tickets.getProjectAgentCommands(cycle.projectId).retroCommand,
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
     */
    async reply(
      id: number,
      text: string,
      sentBy: ConversationSender,
    ): Promise<Conversation> {
      const message = (text ?? '').trim();
      if (message === '') {
        throw new ValidationError({ text: 'Write a reply first.' });
      }
      const conversation = get(id);
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
        };
        handle.run.send(message);
      } else {
        startRun(
          id,
          message,
          conversation.sdkSessionId ?? undefined,
          limited,
          sentBy,
        );
        append(id, sentBy, message);
        update(id, { state: 'running' });
      }
      announce(id);
      return get(id);
    },

    /** Interrupts the run, ends it and marks the Conversation stopped. */
    async stop(id: number): Promise<Conversation> {
      const conversation = get(id);
      if (conversation.state === 'stopped') {
        return conversation;
      }
      const handle = live.get(id);
      live.delete(id);
      if (handle) {
        recordOutcome(id, handle, {
          stopped: true,
          cost: conversation.costUsd,
        });
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
      return get(id);
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
     * Marks as interrupted every Conversation that says its run is alive,
     * for the server to call once on start, when all its runs are dead.
     * Returns how many it marked.
     */
    interruptStale(): number {
      const stale = db
        .select({ id: conversations.id })
        .from(conversations)
        .where(inArray(conversations.state, liveStates))
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
