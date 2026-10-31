import { desc, eq, inArray } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { conversationEntries, conversations } from '../db/schema';
import type { ChangeChannel } from '../tickets/changes';
import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';
import type { Tickets } from '../tickets/tickets';
import type { AgentRun, AgentRunner, RunEvent } from './agent-runner';
import type {
  ConversationIntent,
  ConversationState,
  TranscriptRole,
} from './conversation-state';
import { runBrief } from './run-brief';

export type Conversation = {
  id: number;
  projectId: number;
  ticketNumber: number | null;
  intent: ConversationIntent;
  state: ConversationState;
  sdkSessionId: string | null;
  costUsd: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TranscriptEntry = {
  id: number;
  conversationId: number;
  role: TranscriptRole;
  text: string;
  createdAt: Date;
};

export type StartConversationInput = {
  /** The Project, unless `ticketNumber` names a Ticket of it. */
  projectId?: number;
  ticketNumber?: number;
  intent: ConversationIntent;
  /** The User's first message. */
  prompt: string;
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
type LiveRun = { run: AgentRun | null; costBefore: number };

const liveStates: ConversationState[] = ['running', 'waiting', 'idle'];

const noRepositoryPath = {
  repositoryPath:
    'This Project has no repository path. Set one in the Project settings first.',
};

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

  const append = (id: number, role: TranscriptRole, text: string) => {
    db.insert(conversationEntries)
      .values({ conversationId: id, role, text, createdAt: new Date() })
      .run();
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

  /** Starts a run for Conversation `id` with `prompt`, resuming `resume`. */
  const startRun = (id: number, prompt: string, resume?: string) => {
    const conversation = get(id);
    const settings = tickets.getProjectAgentSettings(conversation.projectId);
    if (settings.repositoryPath === null) {
      throw new ValidationError(noRepositoryPath);
    }
    const ticket =
      conversation.ticketNumber === null
        ? null
        : tickets.getTicket(conversation.ticketNumber);

    const handle: LiveRun = { run: null, costBefore: conversation.costUsd };
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
        }),
        prompt,
        ...(resume === undefined ? {} : { resume }),
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
      const settings = tickets.getProjectAgentSettings(projectId);
      if (settings.repositoryPath === null) {
        throw new ValidationError(noRepositoryPath);
      }

      const now = new Date();
      const created = db
        .insert(conversations)
        .values({
          projectId,
          ticketNumber: input.ticketNumber ?? null,
          intent: input.intent,
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
      if (conversation.state === 'stopped') {
        throw new NotAllowedError(
          'This Conversation was stopped. Start a new one.',
        );
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
      for (const { id } of stale) {
        update(id, { state: 'interrupted' });
        announce(id);
      }
      return stale.length;
    },
  };
}

export type Conversations = ReturnType<typeof createConversations>;
