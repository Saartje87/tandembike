import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';

/**
 * A Spar's Canvas (GLOSSARY: Canvas): Columns of Stickies in order, and the
 * one way an edit changes it. The Spars module saves what `applyCanvasOps`
 * returns, and the Spar page shows it at once, so both read an edit alike.
 */

/** Who wrote a Sticky: the User, or the Agent. */
export const stickyAuthors = ['user', 'agent'] as const;
export type StickyAuthor = (typeof stickyAuthors)[number];

export type Sticky = {
  id: number;
  title: string;
  /** Markdown; null for none. */
  note: string | null;
  author: StickyAuthor;
  /** A Ticket the idea already has work in; null for none. */
  ticketNumber: number | null;
};

export type Column = { id: number; title: string; stickies: Sticky[] };

export type Canvas = { columns: Column[] };

/** One edit of a Canvas. An index is a place from 0; left out, the end. */
export type CanvasOp =
  | { op: 'addColumn'; title: string; index?: number }
  | { op: 'renameColumn'; columnId: number; title: string }
  | { op: 'moveColumn'; columnId: number; index: number }
  | { op: 'removeColumn'; columnId: number }
  | {
      op: 'addSticky';
      columnId: number;
      title: string;
      note?: string | null;
      ticketNumber?: number | null;
      index?: number;
    }
  | {
      op: 'editSticky';
      stickyId: number;
      title?: string;
      note?: string | null;
      ticketNumber?: number | null;
    }
  | { op: 'moveSticky'; stickyId: number; columnId: number; index?: number }
  | { op: 'removeSticky'; stickyId: number };

/** The Columns a new Spar starts with. */
export const defaultColumnTitles = ['Ideas', 'Explore', 'Keep', 'Park'];

export const maxTitleLength = 200;
export const maxNoteLength = 5000;

const titleOf = (title: unknown, what: string): string => {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (trimmed === '') {
    throw new ValidationError({ title: `Give the ${what} a title.` });
  }
  if (trimmed.length > maxTitleLength) {
    throw new ValidationError({
      title: `Keep the ${what}'s title to ${maxTitleLength} characters.`,
    });
  }
  return trimmed.replace(/\s+/g, ' ');
};

const noteOf = (note: unknown): string | null => {
  const trimmed = typeof note === 'string' ? note.trim() : '';
  if (trimmed.length > maxNoteLength) {
    throw new ValidationError({
      note: `Keep the note to ${maxNoteLength} characters.`,
    });
  }
  return trimmed === '' ? null : trimmed;
};

const ticketOf = (ticketNumber: unknown): number | null => {
  if (ticketNumber === null || ticketNumber === undefined) {
    return null;
  }
  if (!Number.isSafeInteger(ticketNumber) || (ticketNumber as number) < 1) {
    throw new ValidationError({ ticketNumber: 'Name a Ticket by its number.' });
  }
  return ticketNumber as number;
};

/** `index` within a list of `length` items, or the end. */
const placeOf = (index: unknown, length: number): number =>
  typeof index === 'number' && Number.isInteger(index)
    ? Math.min(Math.max(index, 0), length)
    : length;

const inserted = <T>(items: readonly T[], item: T, index: number): T[] => [
  ...items.slice(0, index),
  item,
  ...items.slice(index),
];

const columnIndex = (canvas: Canvas, columnId: number): number => {
  const index = canvas.columns.findIndex(({ id }) => id === columnId);
  if (index < 0) {
    throw new NotFoundError(`There is no Column ${columnId} on this Canvas.`);
  }
  return index;
};

const stickyPlace = (canvas: Canvas, stickyId: number) => {
  for (const [column, { stickies }] of canvas.columns.entries()) {
    const index = stickies.findIndex(({ id }) => id === stickyId);
    if (index >= 0) {
      return { column, index, sticky: stickies[index] };
    }
  }
  throw new NotFoundError(`There is no Sticky ${stickyId} on this Canvas.`);
};

const withColumn = (
  canvas: Canvas,
  index: number,
  change: (column: Column) => Column,
): Canvas => ({
  columns: canvas.columns.map((column, at) =>
    at === index ? change(column) : column,
  ),
});

/**
 * `canvas` after `op`, by `author`; `newId` gives the id of a new Column or
 * Sticky. Refused, with nothing changed, for an unknown Column or Sticky, a
 * blank title, or a Column that still holds Stickies.
 */
export function applyCanvasOp(
  canvas: Canvas,
  op: CanvasOp,
  author: StickyAuthor,
  newId: () => number,
): Canvas {
  switch (op.op) {
    case 'addColumn':
      return {
        columns: inserted(
          canvas.columns,
          { id: newId(), title: titleOf(op.title, 'Column'), stickies: [] },
          placeOf(op.index, canvas.columns.length),
        ),
      };
    case 'renameColumn': {
      const title = titleOf(op.title, 'Column');
      return withColumn(canvas, columnIndex(canvas, op.columnId), (column) => ({
        ...column,
        title,
      }));
    }
    case 'moveColumn': {
      const from = columnIndex(canvas, op.columnId);
      const rest = canvas.columns.filter((_, at) => at !== from);
      return {
        columns: inserted(
          rest,
          canvas.columns[from],
          placeOf(op.index, rest.length),
        ),
      };
    }
    case 'removeColumn': {
      const index = columnIndex(canvas, op.columnId);
      const column = canvas.columns[index];
      if (column.stickies.length > 0) {
        throw new NotAllowedError(
          `The Column "${column.title}" still holds ${column.stickies.length} ${column.stickies.length === 1 ? 'Sticky' : 'Stickies'}. Move or remove them first.`,
        );
      }
      return { columns: canvas.columns.filter((_, at) => at !== index) };
    }
    case 'addSticky': {
      const index = columnIndex(canvas, op.columnId);
      const sticky: Sticky = {
        id: newId(),
        title: titleOf(op.title, 'Sticky'),
        note: noteOf(op.note),
        author,
        ticketNumber: ticketOf(op.ticketNumber),
      };
      return withColumn(canvas, index, (column) => ({
        ...column,
        stickies: inserted(
          column.stickies,
          sticky,
          placeOf(op.index, column.stickies.length),
        ),
      }));
    }
    case 'editSticky': {
      const { column, index, sticky } = stickyPlace(canvas, op.stickyId);
      const edited: Sticky = {
        ...sticky,
        ...(op.title === undefined
          ? {}
          : { title: titleOf(op.title, 'Sticky') }),
        ...(op.note === undefined ? {} : { note: noteOf(op.note) }),
        ...(op.ticketNumber === undefined
          ? {}
          : { ticketNumber: ticketOf(op.ticketNumber) }),
      };
      return withColumn(canvas, column, (current) => ({
        ...current,
        stickies: current.stickies.map((item, at) =>
          at === index ? edited : item,
        ),
      }));
    }
    case 'moveSticky': {
      const { column, sticky } = stickyPlace(canvas, op.stickyId);
      const target = columnIndex(canvas, op.columnId);
      const without = withColumn(canvas, column, (current) => ({
        ...current,
        stickies: current.stickies.filter(({ id }) => id !== sticky.id),
      }));
      return withColumn(without, target, (current) => ({
        ...current,
        stickies: inserted(
          current.stickies,
          sticky,
          placeOf(op.index, current.stickies.length),
        ),
      }));
    }
    case 'removeSticky': {
      const { column, sticky } = stickyPlace(canvas, op.stickyId);
      return withColumn(canvas, column, (current) => ({
        ...current,
        stickies: current.stickies.filter(({ id }) => id !== sticky.id),
      }));
    }
    default:
      throw new ValidationError({ op: 'That is not a Canvas edit.' });
  }
}

/** `canvas` after every op in turn: all or nothing, as one throws. */
export function applyCanvasOps(
  canvas: Canvas,
  ops: readonly CanvasOp[],
  author: StickyAuthor,
  newId: () => number,
): Canvas {
  return ops.reduce(
    (current, op) => applyCanvasOp(current, op, author, newId),
    canvas,
  );
}

const quoted = (text: string) => JSON.stringify(text);

/** `ids` in their order in `order`, keeping only those in both. */
const commonOrder = (ids: number[], other: Set<number>) =>
  ids.filter((id) => other.has(id));

/**
 * What changed from `before` to `after`, one line each, for the Agent: Columns
 * added, removed, renamed and reordered, and Stickies added, removed, edited,
 * moved between Columns and reordered within one. Empty when nothing did.
 */
export function canvasChanges(before: Canvas, after: Canvas): string[] {
  const lines: string[] = [];
  const beforeColumns = new Map(before.columns.map((c) => [c.id, c]));
  const afterColumns = new Map(after.columns.map((c) => [c.id, c]));
  const titleIn = (canvas: Map<number, Column>, id: number) =>
    quoted(canvas.get(id)?.title ?? '?');

  for (const column of after.columns) {
    const old = beforeColumns.get(column.id);
    if (!old) {
      lines.push(`Added Column ${quoted(column.title)}`);
    } else if (old.title !== column.title) {
      lines.push(
        `Renamed Column ${quoted(old.title)} to ${quoted(column.title)}`,
      );
    }
  }
  for (const column of before.columns) {
    if (!afterColumns.has(column.id)) {
      lines.push(`Removed Column ${quoted(column.title)}`);
    }
  }
  const keptColumns = new Set(
    after.columns.filter(({ id }) => beforeColumns.has(id)).map(({ id }) => id),
  );
  const oldColumnOrder = commonOrder(
    before.columns.map(({ id }) => id),
    keptColumns,
  );
  const newColumnOrder = commonOrder(
    after.columns.map(({ id }) => id),
    keptColumns,
  );
  if (oldColumnOrder.join() !== newColumnOrder.join()) {
    lines.push(
      `Reordered Columns: ${after.columns.map(({ title }) => quoted(title)).join(', ')}`,
    );
  }

  const placesOf = (canvas: Canvas) => {
    const places = new Map<number, { sticky: Sticky; columnId: number }>();
    for (const column of canvas.columns) {
      for (const sticky of column.stickies) {
        places.set(sticky.id, { sticky, columnId: column.id });
      }
    }
    return places;
  };
  const beforeStickies = placesOf(before);
  const afterStickies = placesOf(after);

  for (const column of after.columns) {
    for (const sticky of column.stickies) {
      const old = beforeStickies.get(sticky.id);
      const name = quoted(sticky.title);
      if (!old) {
        lines.push(
          `Added Sticky ${name} to ${quoted(column.title)}${sticky.note ? `, note: ${quoted(sticky.note)}` : ''}`,
        );
        continue;
      }
      const edits = [
        old.sticky.title === sticky.title
          ? null
          : `title was ${quoted(old.sticky.title)}`,
        old.sticky.note === sticky.note
          ? null
          : sticky.note === null
            ? 'note removed'
            : `note now ${quoted(sticky.note)}`,
        old.sticky.ticketNumber === sticky.ticketNumber
          ? null
          : sticky.ticketNumber === null
            ? 'unlinked from its Ticket'
            : `linked to T${sticky.ticketNumber}`,
      ].filter((edit) => edit !== null);
      if (edits.length > 0) {
        lines.push(`Edited Sticky ${name}: ${edits.join('; ')}`);
      }
      if (old.columnId !== column.id) {
        lines.push(
          `Moved Sticky ${name} from ${titleIn(beforeColumns, old.columnId)} to ${quoted(column.title)}`,
        );
      }
    }
  }
  for (const [id, { sticky, columnId }] of beforeStickies) {
    if (!afterStickies.has(id)) {
      lines.push(
        `Removed Sticky ${quoted(sticky.title)} from ${titleIn(beforeColumns, columnId)}`,
      );
    }
  }
  for (const column of after.columns) {
    const old = beforeColumns.get(column.id);
    if (!old) {
      continue;
    }
    const stayed = new Set(
      column.stickies
        .filter(({ id }) => beforeStickies.get(id)?.columnId === column.id)
        .map(({ id }) => id),
    );
    const was = commonOrder(
      old.stickies.map(({ id }) => id),
      stayed,
    );
    const now = commonOrder(
      column.stickies.map(({ id }) => id),
      stayed,
    );
    if (was.join() !== now.join()) {
      lines.push(
        `Reordered Stickies in ${quoted(column.title)}: ${column.stickies.map(({ title }) => quoted(title)).join(', ')}`,
      );
    }
  }
  return lines;
}
