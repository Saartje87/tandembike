import { desc, eq, inArray } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { conversationEntries, conversations } from '../db/schema';
import type { ChangeChannel } from '../tickets/changes';
import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';
import type { TicketType } from '../tickets/ticket-type';
import type { Tickets } from '../tickets/tickets';
import type {
  AgentRun,
  AgentRunner,
  PermissionAnswer,
  PermissionRequest,
  Question,
  QuestionAnswers,
  RunEvent,
} from './agent-runner';
import type {
  ConversationIntent,
  ConversationState,
  PermissionStatus,
  QuestionEntry,
  TranscriptRole,
} from './conversation-state';
import { type NewTicketDefaults, runBrief } from './run-brief';

export type Conversation = {
  id: number;
  projectId: number;
  ticketNumber: number | null;
  intent: ConversationIntent;
  state: ConversationState;
  sdkSessionId: string | null;
  costUsd: number;
  /** Closed by the User: stopped, and left out of the open Conversations. */
  hidden: boolean;
  defaultCycleId: number | null;
  defaultEpicNumber: number | null;
  defaultType: TicketType | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TranscriptEntry = {
  id: number;
  conversationId: number;
  role: TranscriptRole;
  text: string;
  /** For a permission request, where it is; null for other entries. */
  permission: PermissionStatus | null;
  /** For a question of the Agent, what it asked and the answers; null for other entries. */
  question: QuestionEntry | null;
  createdAt: Date;
};

export type StartConversationInput = {
  /** The Project, unless `ticketNumber` names a Ticket of it. */
  projectId?: number;
  ticketNumber?: number;
  intent: ConversationIntent;
  /** The User's first message. */
  prompt: string;
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
  /** Permission requests waiting for the User, by transcript entry id. */
  asking: Map<number, (answer: PermissionAnswer) => void>;
  /** Questions waiting for the User, by transcript entry id. */
  questioning: Map<number, (answers: QuestionAnswers) => void>;
};

const liveStates: ConversationState[] = ['running', 'waiting', 'idle'];

const noRepositoryPath = {
  repositoryPath:
    'This Project has no repository path. Set one in the Project settings first.',
};

/** How many Start runs a Project allows at once (T588 settings). */
const startRunLimit = (settings: {
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

  const append = (
    id: number,
    role: TranscriptRole,
    text: string,
    permission: PermissionStatus | null = null,
    question: QuestionEntry | null = null,
  ): number =>
    db
      .insert(conversationEntries)
      .values({
        conversationId: id,
        role,
        text,
        permission,
        question,
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
      null,
      { questions, answers: null, expired: false },
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
      'pending',
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
      return;
    }
    switch (event.type) {
      case 'session':
        update(id, { sdkSessionId: event.sessionId });
        break;
      case 'agent':
        append(id, 'agent', event.text);
        break;
      case 'tool':
        append(id, 'tool', event.text);
        break;
      case 'turn':
        if (event.error) {
          append(id, 'error', event.error);
        }
        update(id, {
          state: 'idle',
          costUsd: handle.costBefore + event.costUsd,
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
        if (event.error || get(id).state !== 'idle') {
          update(id, { state: 'interrupted' });
        }
        break;
      }
    }
    announce(id);
  };

  /**
   * Refuses a Start run beyond the Project's limit: a Start is not queued
   * (ADR 0019). Triage and Ask are never limited, and do not count.
   */
  const checkStartLimit = (
    projectId: number,
    intent: ConversationIntent,
    settings: { parallelRuns: boolean; maxConcurrentRuns: number },
  ) => {
    if (intent !== 'start') {
      return;
    }
    const limit = startRunLimit(settings);
    let running = 0;
    for (const id of live.keys()) {
      const other = get(id);
      if (other.projectId === projectId && other.intent === 'start') {
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

  /** Starts a run for Conversation `id` with `prompt`, resuming `resume`. */
  const startRun = (id: number, prompt: string, resume?: string) => {
    const conversation = get(id);
    const settings = tickets.getProjectAgentSettings(conversation.projectId);
    if (settings.repositoryPath === null) {
      throw new ValidationError(noRepositoryPath);
    }
    checkStartLimit(conversation.projectId, conversation.intent, settings);
    const ticket =
      conversation.ticketNumber === null
        ? null
        : tickets.getTicket(conversation.ticketNumber);

    const handle: LiveRun = {
      run: null,
      costBefore: conversation.costUsd,
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
          projectName: tickets.getProject(conversation.projectId).name,
          intent: conversation.intent,
          parallelRuns: settings.parallelRuns,
          defaults: {
            cycleId: conversation.defaultCycleId,
            epicNumber: conversation.defaultEpicNumber,
            type: conversation.defaultType,
          },
        }),
        prompt,
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

  return {
    get,

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
     * Starts a Conversation on a Ticket or a Project and its first run.
     * Refused when the Project has no repository path.
     */
    async start(input: StartConversationInput): Promise<Conversation> {
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
          state: 'running',
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: conversations.id })
        .get();
      append(created.id, 'user', prompt);
      try {
        startRun(created.id, prompt);
      } catch (error) {
        update(created.id, { state: 'interrupted' });
        append(created.id, 'error', 'The Agent could not be started.');
        announce(created.id);
        throw error;
      }
      announce(created.id);
      return get(created.id);
    },

    /**
     * Sends the User's reply: into the run while it is alive, otherwise into
     * a new run that resumes the stored SDK session.
     */
    async reply(id: number, text: string): Promise<Conversation> {
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

      const handle = live.get(id);
      if (handle?.run) {
        append(id, 'user', message);
        update(id, { state: 'running' });
        handle.run.send(message);
      } else {
        startRun(id, message, conversation.sdkSessionId ?? undefined);
        append(id, 'user', message);
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
     * The User's Allow (`true`) or Deny (`false`) of a permission request in a
     * transcript; the waiting run goes on. Refused once answered or when its
     * run is gone.
     */
    async answerPermission(
      entryId: number,
      allow: boolean,
    ): Promise<Conversation> {
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
      handle.asking.delete(entryId);
      setPermission(entryId, allow ? 'allowed' : 'denied');
      if (handle.asking.size === 0 && handle.questioning.size === 0) {
        update(entry.conversationId, { state: 'running' });
      }
      announce(entry.conversationId);
      resolve(allow ? 'allow' : 'deny');
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
