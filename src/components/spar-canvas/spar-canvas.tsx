'use client';

import {
  Alert,
  Heading,
  IconButton,
  Inline,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import {
  DragDropProvider,
  type DragEndEvent,
  type DragOverEvent,
  useDroppable,
} from '@dnd-kit/react';
import { isSortable } from '@dnd-kit/react/sortable';
import {
  type FC,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useForm } from 'react-hook-form';

import { refusalReason } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { editSparCanvas } from '../../app/spars/actions';
import {
  applyCanvasOps,
  type Canvas,
  type CanvasOp,
  type Column,
} from '../../spars/canvas';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import { InlineEdit } from '../inline-edit/inline-edit';
import { SparSticky } from '../spar-sticky/spar-sticky';
import * as styles from './spar-canvas.css';

export type SparCanvasProps = {
  sparId: number;
  canvas: Canvas;
  /** A closed Spar: the Canvas shows, but nothing changes. */
  readOnly?: boolean;
  /** Stickies of the Agent's that arrived since the page last showed: they animate in. */
  arrived?: ReadonlySet<number>;
};

/** Saves Canvas edits and resolves to the reason when refused. */
type OnEdit = (ops: CanvasOp[]) => Promise<string | undefined>;

/** The Canvas after `ops`, or as it was when they do not apply. */
const shownAfter = (canvas: Canvas, ops: CanvasOp[]): Canvas => {
  let temporary = -1_000_000;
  try {
    return applyCanvasOps(canvas, ops, 'user', () => --temporary);
  } catch {
    return canvas;
  }
};

const columnDropId = (columnId: number) => `column:${columnId}`;

const columnOfDrop = (id: unknown): number | undefined =>
  typeof id === 'string' && id.startsWith('column:')
    ? Number(id.slice('column:'.length))
    : undefined;

/** Where Sticky `stickyId` is on `canvas`. */
const placeOf = (canvas: Canvas, stickyId: number) => {
  for (const column of canvas.columns) {
    const index = column.stickies.findIndex(({ id }) => id === stickyId);
    if (index >= 0) {
      return { columnId: column.id, index };
    }
  }
  return undefined;
};

type AddFormProps = {
  label: string;
  placeholder: string;
  onAdd: (title: string) => Promise<string | undefined>;
};

/**
 * A one-line field that adds a Column or a Sticky on Enter. It clears at
 * once, as the Canvas shows the new item; a refusal puts the text back and
 * shows the reason.
 */
const AddForm: FC<AddFormProps> = ({ label, placeholder, onAdd }) => {
  const inputId = useId();
  const errorId = useId();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ title: string }>({ defaultValues: { title: '' } });
  const reason = errors.title?.message;

  const submit = handleSubmit(async ({ title }) => {
    if (title.trim() === '') {
      return;
    }
    reset();
    const refused = await onAdd(title);
    if (refused !== undefined) {
      reset({ title });
      setError('title', { type: 'server', message: refused });
    }
  });

  return (
    <form onSubmit={submit}>
      <Stack gap={1}>
        <label htmlFor={inputId}>
          <VisuallyHidden>{label}</VisuallyHidden>
        </label>
        <TextInput
          {...register('title')}
          id={inputId}
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={reason ? true : undefined}
          aria-describedby={reason ? errorId : undefined}
        />
        <FieldError id={errorId} reason={reason} />
      </Stack>
    </form>
  );
};

type SparColumnProps = {
  column: Column;
  index: number;
  columns: Column[];
  onEdit: OnEdit;
  readOnly: boolean;
  arrived: ReadonlySet<number>;
};

/** A Column: its title, its buttons, its Stickies and a field to add one. */
const SparColumn: FC<SparColumnProps> = ({
  column,
  index,
  columns,
  onEdit,
  readOnly,
  arrived,
}) => {
  const headingId = useId();
  const { ref } = useDroppable({
    id: columnDropId(column.id),
    type: 'column',
    accept: 'sticky',
    // Below the Stickies in it, so a drop on a Sticky places it there.
    collisionPriority: 1,
  });
  const others = columns
    .filter(({ id }) => id !== column.id)
    .map(({ id, title }) => ({ id, title }));

  return (
    <section ref={ref} className={styles.column} aria-labelledby={headingId}>
      <Inline gap={1} alignY="center" flexWrap="nowrap">
        <Heading id={headingId} level={3} fontSize="small">
          <InlineEdit
            value={column.title}
            label="Column title"
            readOnly={readOnly}
            onSave={(title) =>
              onEdit([{ op: 'renameColumn', columnId: column.id, title }])
            }
          />
        </Heading>
        {!readOnly && (
          <Inline gap={0} flexWrap="nowrap">
            <IconButton
              variant="ghost"
              size="small"
              label={`Move ${column.title} left`}
              disabled={index === 0}
              onClick={() =>
                void onEdit([
                  { op: 'moveColumn', columnId: column.id, index: index - 1 },
                ])
              }
            >
              <Icon name="arrow-left" size="small" />
            </IconButton>
            <IconButton
              variant="ghost"
              size="small"
              label={`Move ${column.title} right`}
              disabled={index === columns.length - 1}
              onClick={() =>
                void onEdit([
                  { op: 'moveColumn', columnId: column.id, index: index + 1 },
                ])
              }
            >
              <Icon name="arrow-right" size="small" />
            </IconButton>
            <IconButton
              variant="ghost"
              size="small"
              label={`Remove ${column.title}`}
              onClick={() =>
                void onEdit([{ op: 'removeColumn', columnId: column.id }])
              }
            >
              <Icon name="trash" size="small" />
            </IconButton>
          </Inline>
        )}
      </Inline>
      <Stack gap={2} listStyle="none" role="list" asChild>
        <ul aria-label={`Stickies in ${column.title}`}>
          {column.stickies.map((sticky, at) => (
            <SparSticky
              key={sticky.id}
              sticky={sticky}
              index={at}
              columnId={column.id}
              otherColumns={others}
              onEdit={onEdit}
              readOnly={readOnly}
              arrived={arrived.has(sticky.id)}
            />
          ))}
        </ul>
      </Stack>
      {!readOnly && (
        <AddForm
          label={`New Sticky in ${column.title}`}
          placeholder="Add a Sticky…"
          onAdd={(title) =>
            onEdit([{ op: 'addSticky', columnId: column.id, title }])
          }
        />
      )}
    </section>
  );
};

/**
 * A Spar's Canvas (GLOSSARY: Canvas): Columns of Stickies the User and the
 * Agent both edit. Every edit shows at once and is saved as the User's; a
 * refusal, such as on a closed Spar, puts the Canvas back and says why.
 * Stickies drag within and between Columns, by pointer or by keyboard (Space
 * lifts and drops, arrow keys move). Editing it sends the Agent nothing: the
 * next message carries what changed.
 */
export const SparCanvas: FC<SparCanvasProps> = ({
  sparId,
  canvas,
  readOnly = false,
  arrived = new Set(),
}) => {
  const [shown, showEdit] = useOptimistic(canvas, shownAfter);
  const [error, setError] = useState<string>();
  const [, startEdit] = useTransition();
  // A drag between Columns, shown until it is dropped (dnd-kit's own sorting
  // reorders within a Column; React owns the move between them).
  const [dragging, setDragging] = useState<Canvas>();
  const dragFrom = useRef<{ columnId: number; index: number }>(undefined);
  const view = dragging ?? shown;

  const onEdit: OnEdit = (ops) =>
    new Promise((resolve) => {
      setError(undefined);
      startEdit(async () => {
        showEdit(ops);
        const result = await callAction(
          () => editSparCanvas({ sparId, ops }),
          'The Canvas could not be saved. Try again.',
        );
        const reason = refusalReason(result);
        if (reason !== undefined) {
          setError(reason);
        }
        resolve(reason);
      });
    });

  const over = (event: DragOverEvent) => {
    const { source, target } = event.operation;
    if (!source || !target || !isSortable(source)) {
      return;
    }
    const current = dragging ?? shown;
    const stickyId = Number(source.id);
    const from = placeOf(current, stickyId);
    const toColumn = isSortable(target)
      ? Number(target.group)
      : columnOfDrop(target.id);
    if (!from || toColumn === undefined || toColumn === from.columnId) {
      return;
    }
    const index = isSortable(target) ? target.index : undefined;
    setDragging(
      shownAfter(current, [
        { op: 'moveSticky', stickyId, columnId: toColumn, index },
      ]),
    );
  };

  const end = (event: DragEndEvent) => {
    const { source } = event.operation;
    const from = dragFrom.current;
    const moved = dragging;
    dragFrom.current = undefined;
    setDragging(undefined);
    if (event.canceled || !source || !isSortable(source) || !from) {
      return;
    }
    const stickyId = Number(source.id);
    const to = placeOf(moved ?? shown, stickyId);
    const columnId = to?.columnId ?? from.columnId;
    const index =
      columnId === from.columnId && !moved ? source.index : (to?.index ?? 0);
    if (columnId === from.columnId && index === from.index) {
      return;
    }
    void onEdit([{ op: 'moveSticky', stickyId, columnId, index }]);
  };

  return (
    <Stack gap={2}>
      <Heading level={2} fontSize="medium">
        Canvas
      </Heading>
      {error && <Alert intent="danger">{error}</Alert>}
      <DragDropProvider
        onDragStart={(event) => {
          const { source } = event.operation;
          dragFrom.current =
            source && isSortable(source)
              ? placeOf(shown, Number(source.id))
              : undefined;
        }}
        onDragOver={over}
        onDragEnd={end}
      >
        <div className={styles.columns}>
          {view.columns.map((column, index) => (
            <SparColumn
              key={column.id}
              column={column}
              index={index}
              columns={view.columns}
              onEdit={onEdit}
              readOnly={readOnly}
              arrived={arrived}
            />
          ))}
        </div>
      </DragDropProvider>
      {!readOnly && (
        <Inline gap={2} alignY="center">
          <AddForm
            label="New Column"
            placeholder="Add a Column…"
            onAdd={(title) => onEdit([{ op: 'addColumn', title }])}
          />
          {view.columns.length === 0 && (
            <Text color="muted">The Canvas has no Columns yet.</Text>
          )}
        </Inline>
      )}
    </Stack>
  );
};
