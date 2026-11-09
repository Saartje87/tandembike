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
  canvasChanges,
  defaultColumnTitles,
  type Sticky,
  type StickyAuthor,
} from './canvas';
import { summariseMessage } from './spar-moves';

/** A Spar's Write-up (GLOSSARY): three Markdown sections, empty for none. */
export type WriteUp = {
  decisions: string;
  openQuestions: string;
  nextSteps: string;
};

export const writeUpSections = [
  'decisions',
  'openQuestions',
  'nextSteps',
] as const satisfies readonly (keyof WriteUp)[];

const maxWriteUpLength = 20_000;

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
  /** Close was asked: it closes once the Summarise turn ends. */
  closing: boolean;
  /** The Ticket its Hand-off filed; null before. */
  outcomeTicketNumber: number | null;
  writeUp: WriteUp;
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
    closing: row.closing,
    outcomeTicketNumber: row.outcomeTicketNumber,
    writeUp: {
      decisions: row.decisions,
      openQuestions: row.openQuestions,
      nextSteps: row.nextSteps,
    },
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

  /**
   * Stores `next` as Spar `id`'s Canvas: new items (negative ids) are
   * inserted, gone ones deleted. Returns the ids the new ones got, by their
   * temporary id.
   */
  const saveCanvas = (id: number, next: Canvas): Map<number, number> => {
    const created = new Map<number, number>();
    const columnIds = new Map<number, number>();
    next.columns.forEach((column, position) => {
      if (column.id < 0) {
        const inserted = db
          .insert(sparColumns)
          .values({ sparId: id, position, title: column.title })
          .returning({ id: sparColumns.id })
          .get();
        columnIds.set(column.id, inserted.id);
        created.set(column.id, inserted.id);
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
          const inserted = db
            .insert(sparStickies)
            .values({ ...values, sparId: id, author: sticky.author })
            .returning({ id: sparStickies.id })
            .get().id;
          keptStickies.push(inserted);
          created.set(sticky.id, inserted);
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
    return created;
  };

  const setBaseline = (id: number, baseline: Canvas) => {
    db.update(spars).set({ baseline }).where(eq(spars.id, id)).run();
  };

  /** The Canvas as the Agent last saw it, with its own edits since. */
  const baselineOf = (id: number): Canvas => rowOf(id).baseline ?? canvasOf(id);

  /**
   * Adds the Agent's own edit to the baseline, so the next message does not
   * tell it what it did itself. New items take the ids they were saved with.
   * An op the baseline cannot take, such as on a Sticky the User added
   * since, leaves the baseline, and the next message names it.
   */
  const addToBaseline = (
    id: number,
    ops: readonly CanvasOp[],
    created: Map<number, number>,
  ) => {
    let temporary = 0;
    let next: Canvas;
    try {
      next = applyCanvasOps(baselineOf(id), ops, 'agent', () => --temporary);
    } catch {
      return;
    }
    const real = (itemId: number) => created.get(itemId) ?? itemId;
    setBaseline(id, {
      columns: next.columns.map((column) => ({
        ...column,
        id: real(column.id),
        stickies: column.stickies.map((sticky) => ({
          ...sticky,
          id: real(sticky.id),
        })),
      })),
    });
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

  /** Marks a closing Spar closed and stops its run, once its Summarise turn has ended. */
  const finishClosing = (id: number) => {
    const row = db.select().from(spars).where(eq(spars.id, id)).get();
    if (!row?.closing) {
      return;
    }
    const state = conversations.get(id).state;
    if (state === 'running' || state === 'waiting') {
      return;
    }
    db.update(spars)
      .set({ closing: false, closed: true, updatedAt: new Date() })
      .where(eq(spars.id, id))
      .run();
    announce(id);
    void conversations.stop(id).catch(() => undefined);
  };

  // A closing Spar closes when its Conversation's turn ends.
  changes?.subscribe((change) => {
    if (change.type === 'conversation') {
      finishClosing(change.id);
    }
  });

  /**
   * Sends `message` into Spar `id` with what changed on the Canvas since the
   * Agent's last turn after it, and makes the Canvas now the baseline.
   */
  const sendTurn = async (id: number, text: string): Promise<Conversation> => {
    const row = rowOf(id);
    if (row.closed) {
      throw new NotAllowedError('This Spar is closed. Reopen it to reply.');
    }
    if (row.closing) {
      throw new NotAllowedError('This Spar is closing.');
    }
    const current = canvasOf(id);
    const changes = canvasChanges(baselineOf(id), current);
    const typed = (text ?? '').trim();
    const message = [
      typed === '' ? 'Your move.' : typed,
      changes.length > 0
        ? `Canvas changes since your last turn:\n${changes.map((line) => `- ${line}`).join('\n')}`
        : typed === ''
          ? 'The Canvas has not changed since your last turn.'
          : null,
    ]
      .filter((part) => part !== null)
      .join('\n\n');
    const conversation = await conversations.reply(id, message, 'user');
    setBaseline(id, current);
    announce(id);
    return conversation;
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
      const created = saveCanvas(id, next);
      if (author === 'agent') {
        addToBaseline(id, ops, created);
      }
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
      setBaseline(conversation.id, canvasOf(conversation.id));
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

    /**
     * What changed on Spar `id`'s Canvas since the Agent's last turn, other
     * than the Agent's own edits, one line each; empty when nothing did.
     */
    canvasDiff(id: number): string[] {
      return canvasChanges(baselineOf(id), canvasOf(id));
    },

    /**
     * Sends the User's message into Spar `id`, with what changed on the
     * Canvas since the Agent's last turn after it, and makes the Canvas now
     * the baseline. A blank message is "Your move": the turn passes with
     * only the changes. Canvas edits alone never send anything. Refused on a
     * closed or closing Spar.
     */
    sendTurn,

    /**
     * Replaces the sections of Spar `id`'s Write-up given in `input`, by
     * `author`; the others stay. Refused on a closed Spar.
     */
    updateWriteUp(
      id: number,
      input: Partial<WriteUp>,
      _author: StickyAuthor,
    ): WriteUp {
      checkOpen(id);
      const values: Partial<WriteUp> = {};
      for (const section of writeUpSections) {
        const value = input?.[section];
        if (value === undefined) {
          continue;
        }
        if (typeof value !== 'string' || value.length > maxWriteUpLength) {
          throw new ValidationError({
            [section]: `Keep each section to ${maxWriteUpLength} characters.`,
          });
        }
        values[section] = value.trim();
      }
      if (Object.keys(values).length === 0) {
        throw new ValidationError({
          writeUp: 'Give at least one section of the Write-up.',
        });
      }
      db.update(spars)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(spars.id, id))
        .run();
      announce(id);
      return getSpar(id).writeUp;
    },

    /**
     * Closes Spar `id`: sends Summarise, so the Agent brings the Write-up up
     * to date, and once that turn ends the Spar is closed and its run
     * stopped. A closed Spar keeps its page, read-only, until reopened.
     */
    async closeSpar(id: number): Promise<Spar> {
      const row = rowOf(id);
      if (row.closed || row.closing) {
        return getSpar(id);
      }
      await sendTurn(id, summariseMessage);
      db.update(spars).set({ closing: true }).where(eq(spars.id, id)).run();
      announce(id);
      finishClosing(id);
      return getSpar(id);
    },

    /** Reopens closed Spar `id`: editable again; the next reply resumes its run. */
    reopenSpar(id: number): Spar {
      rowOf(id);
      db.update(spars)
        .set({ closed: false, closing: false, updatedAt: new Date() })
        .where(eq(spars.id, id))
        .run();
      announce(id);
      return getSpar(id);
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
