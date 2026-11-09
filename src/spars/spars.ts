import { and, asc, desc, eq, notInArray } from 'drizzle-orm';

import type { ConversationState } from '../conversations/conversation-state';
import type {
  Conversation,
  Conversations,
} from '../conversations/conversations';
import type { DatabaseConnection } from '../db/connection';
import { sparColumns, sparStickies, spars } from '../db/schema';
import { sparCommandMessage } from '../tickets/agent-commands';
import type { ChangeChannel } from '../tickets/changes';
import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';
import type { Tickets } from '../tickets/tickets';
import {
  applyCanvasOps,
  type Canvas,
  type CanvasOp,
  defaultColumnTitles,
  type Sticky,
  type StickyAuthor,
} from './canvas';

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

  /** The Canvas of Spar `id` as stored. */
  const canvasOf = (id: number): Canvas => {
    const stickies = db
      .select()
      .from(sparStickies)
      .where(eq(sparStickies.sparId, id))
      .orderBy(asc(sparStickies.position), asc(sparStickies.id))
      .all();
    return {
      columns: db
        .select()
        .from(sparColumns)
        .where(eq(sparColumns.sparId, id))
        .orderBy(asc(sparColumns.position), asc(sparColumns.id))
        .all()
        .map((column) => ({
          id: column.id,
          title: column.title,
          stickies: stickies
            .filter(({ columnId }) => columnId === column.id)
            .map(
              ({
                id: stickyId,
                title,
                note,
                author,
                ticketNumber,
              }): Sticky => ({
                id: stickyId,
                title,
                note,
                author,
                ticketNumber,
              }),
            ),
        })),
    };
  };

  /** Stores `next` as Spar `id`'s Canvas: new items (negative ids) are inserted, gone ones deleted. */
  const saveCanvas = (id: number, next: Canvas) => {
    const columnIds = new Map<number, number>();
    next.columns.forEach((column, position) => {
      if (column.id < 0) {
        const inserted = db
          .insert(sparColumns)
          .values({ sparId: id, position, title: column.title })
          .returning({ id: sparColumns.id })
          .get();
        columnIds.set(column.id, inserted.id);
      } else {
        columnIds.set(column.id, column.id);
        db.update(sparColumns)
          .set({ position, title: column.title })
          .where(and(eq(sparColumns.id, column.id), eq(sparColumns.sparId, id)))
          .run();
      }
    });
    const keptStickies: number[] = [];
    for (const column of next.columns) {
      const columnId = columnIds.get(column.id) as number;
      column.stickies.forEach((sticky, position) => {
        const values = {
          columnId,
          position,
          title: sticky.title,
          note: sticky.note,
          ticketNumber: sticky.ticketNumber,
        };
        if (sticky.id < 0) {
          keptStickies.push(
            db
              .insert(sparStickies)
              .values({ ...values, sparId: id, author: sticky.author })
              .returning({ id: sparStickies.id })
              .get().id,
          );
        } else {
          keptStickies.push(sticky.id);
          db.update(sparStickies)
            .set(values)
            .where(
              and(eq(sparStickies.id, sticky.id), eq(sparStickies.sparId, id)),
            )
            .run();
        }
      });
    }
    db.delete(sparStickies)
      .where(
        and(
          eq(sparStickies.sparId, id),
          notInArray(sparStickies.id, keptStickies),
        ),
      )
      .run();
    db.delete(sparColumns)
      .where(
        and(
          eq(sparColumns.sparId, id),
          notInArray(sparColumns.id, [...columnIds.values()]),
        ),
      )
      .run();
  };

  const touch = (id: number) => {
    db.update(spars)
      .set({ updatedAt: new Date() })
      .where(eq(spars.id, id))
      .run();
  };

  /** Refuses an edit of a closed Spar, naming why. */
  const checkOpen = (id: number) => {
    if (rowOf(id).closed) {
      throw new NotAllowedError('This Spar is closed. Reopen it to change it.');
    }
  };

  /** Refuses a Sticky linked to a Ticket that does not exist. */
  const checkTickets = (ops: readonly CanvasOp[]) => {
    for (const op of ops) {
      const number =
        op.op === 'addSticky' || op.op === 'editSticky'
          ? op.ticketNumber
          : undefined;
      if (typeof number === 'number') {
        try {
          tickets.getTicket(number);
        } catch (error) {
          if (error instanceof NotFoundError) {
            throw new ValidationError({
              ticketNumber: `There is no Ticket T${number}.`,
            });
          }
          throw error;
        }
      }
    }
  };

  /**
   * Applies `ops` to Spar `id`'s Canvas by `author`, all or nothing, and
   * returns the Canvas. Refused on a closed Spar, and for any op the Canvas
   * refuses (see `applyCanvasOp`).
   */
  const editCanvas = (
    id: number,
    ops: readonly CanvasOp[],
    author: StickyAuthor,
  ): Canvas => {
    checkOpen(id);
    if (!Array.isArray(ops) || ops.length === 0) {
      throw new ValidationError({ ops: 'Give at least one Canvas edit.' });
    }
    checkTickets(ops);
    let temporary = 0;
    const next = applyCanvasOps(canvasOf(id), ops, author, () => --temporary);
    db.transaction(() => {
      saveCanvas(id, next);
      touch(id);
    });
    announce(id);
    return canvasOf(id);
  };

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
      defaultColumnTitles.forEach((title, position) => {
        db.insert(sparColumns)
          .values({ sparId: conversation.id, position, title })
          .run();
      });
      announce(conversation.id);
      return getSpar(conversation.id);
    },

    /** Spar `id`'s Canvas: its Columns in order, each with its Stickies in order. */
    getCanvas(id: number): Canvas {
      rowOf(id);
      return canvasOf(id);
    },

    editCanvas,

    addColumn: (
      id: number,
      input: { title: string; index?: number },
      author: StickyAuthor,
    ) => editCanvas(id, [{ op: 'addColumn', ...input }], author),

    renameColumn: (
      id: number,
      columnId: number,
      title: string,
      author: StickyAuthor,
    ) => editCanvas(id, [{ op: 'renameColumn', columnId, title }], author),

    moveColumn: (
      id: number,
      columnId: number,
      index: number,
      author: StickyAuthor,
    ) => editCanvas(id, [{ op: 'moveColumn', columnId, index }], author),

    removeColumn: (id: number, columnId: number, author: StickyAuthor) =>
      editCanvas(id, [{ op: 'removeColumn', columnId }], author),

    addSticky: (
      id: number,
      input: Omit<Extract<CanvasOp, { op: 'addSticky' }>, 'op'>,
      author: StickyAuthor,
    ) => editCanvas(id, [{ op: 'addSticky', ...input }], author),

    editSticky: (
      id: number,
      stickyId: number,
      input: Omit<Extract<CanvasOp, { op: 'editSticky' }>, 'op' | 'stickyId'>,
      author: StickyAuthor,
    ) => editCanvas(id, [{ op: 'editSticky', stickyId, ...input }], author),

    moveSticky: (
      id: number,
      stickyId: number,
      to: { columnId: number; index?: number },
      author: StickyAuthor,
    ) => editCanvas(id, [{ op: 'moveSticky', stickyId, ...to }], author),

    removeSticky: (id: number, stickyId: number, author: StickyAuthor) =>
      editCanvas(id, [{ op: 'removeSticky', stickyId }], author),

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
