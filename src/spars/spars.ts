import { desc, eq } from 'drizzle-orm';

import type { ConversationState } from '../conversations/conversation-state';
import type {
  Conversation,
  Conversations,
} from '../conversations/conversations';
import type { DatabaseConnection } from '../db/connection';
import { spars } from '../db/schema';
import { sparCommandMessage } from '../tickets/agent-commands';
import type { ChangeChannel } from '../tickets/changes';
import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';
import type { Tickets } from '../tickets/tickets';

/** A Spar (GLOSSARY): its id is its Conversation's. */
export type Spar = {
  id: number;
  projectId: number;
  /** The one-line topic, or null for none. */
  topic: string | null;
  /** The Ticket or Epic it is about, its Conversation's Ticket; null for the Project. */
  focusTicketNumber: number | null;
  /** Closed by the User: read-only until reopened. */
  closed: boolean;
  /** The Ticket its Hand-off filed; null before. */
  outcomeTicketNumber: number | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A Spar as the Project's Spars list shows it. */
export type SparListing = Spar & {
  focusTitle: string | null;
  /** Its Conversation's state. */
  state: ConversationState;
  costUsd: number;
  /** The later of its Conversation's and its own last change. */
  lastActivity: Date;
};

export type StartSparInput = {
  projectId: number;
  focusTicketNumber?: number | null;
  topic?: string | null;
};

export type SparsDeps = {
  db: DatabaseConnection;
  /** Where Projects and Tickets are read. */
  tickets: Tickets;
  /** The only way a Spar starts or continues a run. */
  conversations: Conversations;
  changes?: ChangeChannel;
};

const maxTopicLength = 200;

type SparRow = typeof spars.$inferSelect;

/** The topic as stored: trimmed, one line, null when blank. */
const topicOf = (topic: string | null | undefined): string | null => {
  const trimmed = (topic ?? '').trim();
  if (trimmed === '') {
    return null;
  }
  if (/[\r\n]/.test(trimmed)) {
    throw new ValidationError({ topic: 'Keep the topic to one line.' });
  }
  if (trimmed.length > maxTopicLength) {
    throw new ValidationError({
      topic: `Keep the topic to ${maxTopicLength} characters.`,
    });
  }
  return trimmed;
};

/**
 * Spars (GLOSSARY: Spar): the User thinks an idea through with an Agent on
 * a page of its own. The only code that reads or writes Spar data; it reads
 * Tickets through the Tickets module and starts runs only through the
 * Conversations module. Every change is announced as a `spar` change.
 */
export function createSpars({
  db,
  tickets,
  conversations,
  changes,
}: SparsDeps) {
  const announce = (id: number) => changes?.publish({ type: 'spar', id });

  const sparOf = (row: SparRow, conversation: Conversation): Spar => ({
    id: row.id,
    projectId: row.projectId,
    topic: row.topic,
    focusTicketNumber: conversation.ticketNumber,
    closed: row.closed,
    outcomeTicketNumber: row.outcomeTicketNumber,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  const rowOf = (id: number): SparRow => {
    const row = db.select().from(spars).where(eq(spars.id, id)).get();
    if (!row) {
      throw new NotFoundError(`There is no Spar ${id}.`);
    }
    return row;
  };

  const getSpar = (id: number): Spar =>
    sparOf(rowOf(id), conversations.get(id));

  return {
    getSpar,

    /**
     * Starts a Spar about a Project, or with `focusTicketNumber` about one of
     * its Tickets or Epics, with an optional one-line topic. Its Conversation
     * starts with the Spar command, the topic and the focus. Only the User
     * starts one, through a Server Action.
     */
    async startSpar(input: StartSparInput): Promise<Spar> {
      const project = tickets.getProject(Number(input.projectId));
      if (project.archived) {
        throw new NotAllowedError(`${project.name} is archived.`);
      }
      const topic = topicOf(input.topic);
      const focus = input.focusTicketNumber ?? null;
      if (focus !== null && tickets.getTicket(focus).projectId !== project.id) {
        throw new ValidationError({
          focusTicketNumber: `T${focus} belongs to another Project.`,
        });
      }
      const conversation = await conversations.start({
        startedBy: 'user',
        projectId: project.id,
        ...(focus === null ? {} : { ticketNumber: focus }),
        intent: 'spar',
        prompt: sparCommandMessage(
          topic,
          focus,
          tickets.getProjectAgentCommands(project.id),
        ),
      });
      const now = new Date();
      db.insert(spars)
        .values({
          id: conversation.id,
          projectId: project.id,
          topic,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      announce(conversation.id);
      return getSpar(conversation.id);
    },

    /** A Project's Spars, newest first. */
    listSpars(projectId: number): SparListing[] {
      return db
        .select()
        .from(spars)
        .where(eq(spars.projectId, projectId))
        .orderBy(desc(spars.id))
        .all()
        .map((row) => {
          const conversation = conversations.get(row.id);
          const spar = sparOf(row, conversation);
          return {
            ...spar,
            focusTitle:
              spar.focusTicketNumber === null
                ? null
                : tickets.getTicket(spar.focusTicketNumber).title,
            state: conversation.state,
            costUsd: conversation.costUsd,
            lastActivity: new Date(
              Math.max(
                conversation.updatedAt.getTime(),
                row.updatedAt.getTime(),
              ),
            ),
          };
        });
    },
  };
}

export type Spars = ReturnType<typeof createSpars>;
