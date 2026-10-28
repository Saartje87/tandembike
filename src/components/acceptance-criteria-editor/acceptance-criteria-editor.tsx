'use client';

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Heading,
  Inline,
  Label,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import {
  type FC,
  type MouseEvent,
  type ReactNode,
  useId,
  useOptimistic,
  useState,
  useTransition,
} from 'react';
import { useForm } from 'react-hook-form';

import { refusalReason } from '../../app/lib/action-result';
import {
  checkTicketAcceptanceCriterion,
  setTicketAcceptanceCriteria,
} from '../../app/tickets/actions';
import type { AcceptanceCriterion } from '../../tickets/tickets';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import { InlineEdit } from '../inline-edit/inline-edit';
import {
  claimEscape,
  keepDrawerOpen,
} from '../keep-drawer-open/keep-drawer-open';
import * as styles from './acceptance-criteria-editor.css';

export type AcceptanceCriteriaEditorProps = {
  ticketNumber: number;
  /** The Ticket's acceptance criteria, in order. */
  criteria: AcceptanceCriterion[];
};

/** One criterion checked or unchecked. */
type CheckChange = Pick<AcceptanceCriterion, 'id' | 'checked'>;

/** A change to the criteria shown before the server confirms it. */
type CriteriaChange =
  | ({ type: 'check' } & CheckChange)
  | { type: 'replace'; criteria: AcceptanceCriterion[] };

function changedCriteria(
  criteria: AcceptanceCriterion[],
  change: CriteriaChange,
): AcceptanceCriterion[] {
  if (change.type === 'replace') {
    return change.criteria;
  }
  return criteria.map((criterion) =>
    criterion.id === change.id
      ? { ...criterion, checked: change.checked }
      : criterion,
  );
}

/**
 * `criteria` as a replacement list for the server: by id and text, without
 * checked states, so the server keeps each one unless its text changed.
 */
function asReplacement(criteria: readonly AcceptanceCriterion[]) {
  return criteria.map(({ id, text }) => ({ id, text }));
}

/** `criteria` with the one at `from` moved to `to`. */
function moved<T>(criteria: readonly T[], from: number, to: number): T[] {
  const next = [...criteria];
  const [criterion] = next.splice(from, 1);
  next.splice(to, 0, criterion);
  return next;
}

type SortableCriterionProps = {
  criterion: AcceptanceCriterion;
  /** Its place in the list, from 0. */
  index: number;
  /** Whether its text is being edited: it cannot be dragged meanwhile. */
  editing: boolean;
  children: ReactNode;
};

/**
 * A criterion that can be dragged by its handle to another place, except
 * while its text is being edited: then it is disabled and its handle hidden.
 * The handle stays in the DOM, as a sortable without one makes its whole
 * item the handle.
 */
const SortableCriterion: FC<SortableCriterionProps> = ({
  criterion,
  index,
  editing,
  children,
}) => {
  const { ref, handleRef } = useSortable({
    id: criterion.id,
    index,
    disabled: editing,
  });

  return (
    <li ref={ref} className={styles.sortable}>
      <Inline gap={1} alignY="center" flexWrap="nowrap">
        {/* Hidden, not removed, so the handle stays the only activator. */}
        <Box hidden={editing}>
          <Button
            ref={handleRef}
            className={styles.handle}
            type="button"
            variant="ghost"
            size="small"
            aria-label={`Drag criterion: ${criterion.text}`}
          >
            <Icon name="bars-3" size="small" />
          </Button>
        </Box>
        {children}
      </Inline>
    </li>
  );
};

type CriterionItemProps = {
  criterion: AcceptanceCriterion;
  /** Its place in the list, from 0. */
  index: number;
  onCheck: (checked: boolean) => void;
  /** Saves new text; resolves to the reason when the server refuses it. */
  onEdit: (text: string) => Promise<string | undefined>;
  onRemove: () => void;
};

/**
 * One criterion: a handle to drag it to another place, its checkbox, its
 * text, which edits in place, and a button to remove it. While the text is
 * edited only the checkbox stays beside it. Remove asks first, in place of
 * the criterion.
 */
const CriterionItem: FC<CriterionItemProps> = ({
  criterion,
  index,
  onCheck,
  onEdit,
  onRemove,
}) => {
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);
  // Puts focus back on the remove button when its removal is cancelled.
  const [refocusRemove, setRefocusRemove] = useState(false);

  const keepingDrawerOpen = (run: () => void) => (event: MouseEvent) => {
    keepDrawerOpen(event);
    run();
  };
  const keep = () => {
    setRemoving(false);
    setRefocusRemove(true);
  };

  if (removing) {
    return (
      <li
        onKeyDown={(event) => {
          if (claimEscape(event)) {
            keep();
          }
        }}
      >
        <Stack gap={2}>
          <Text tag="p" fontSize="small">
            Remove this criterion? It cannot be restored.
          </Text>
          <Inline gap={2}>
            <Button
              type="button"
              size="small"
              intent="danger"
              autoFocus
              onClick={keepingDrawerOpen(onRemove)}
            >
              Remove criterion
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="small"
              onClick={keepingDrawerOpen(keep)}
            >
              Cancel
            </Button>
          </Inline>
        </Stack>
      </li>
    );
  }

  return (
    <SortableCriterion criterion={criterion} index={index} editing={editing}>
      <Checkbox
        name={`criterion-${criterion.id}`}
        aria-label={criterion.text}
        className={styles.checkbox}
        checked={criterion.checked}
        onChange={(event) => onCheck(event.currentTarget.checked)}
      />
      <Box flex={1}>
        <InlineEdit
          value={criterion.text}
          label="Acceptance criterion"
          onSave={onEdit}
          onEditingChange={setEditing}
        />
      </Box>
      {!editing && (
        <Button
          type="button"
          variant="ghost"
          size="small"
          intent="danger"
          aria-label={`Remove criterion: ${criterion.text}`}
          autoFocus={refocusRemove}
          onClick={keepingDrawerOpen(() => setRemoving(true))}
        >
          <Icon name="x-mark" size="small" />
        </Button>
      )}
    </SortableCriterion>
  );
};

type NewCriterionProps = {
  ticketNumber: number;
  /** The criteria shown, to which the new one is added at the end. */
  criteria: AcceptanceCriterion[];
};

/**
 * A button that opens a field for a new criterion. Enter adds it once the
 * server saves it and keeps the field open for the next; Escape closes it.
 */
const NewCriterion: FC<NewCriterionProps> = ({ ticketNumber, criteria }) => {
  const inputId = useId();
  const errorId = useId();
  const [adding, setAdding] = useState(false);
  // Focus goes back to the add button after Escape.
  const [refocusAdd, setRefocusAdd] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    setFocus,
  } = useForm<{ text: string }>({ defaultValues: { text: '' } });
  const fieldError = errors.text?.message;
  const serverError = errors.root?.server?.message;

  const stopAdding = () => {
    setAdding(false);
    setRefocusAdd(true);
    reset();
  };

  const add = handleSubmit(async ({ text }) => {
    const result = await setTicketAcceptanceCriteria({
      number: ticketNumber,
      acceptanceCriteria: [...asReplacement(criteria), { text }],
    });
    if (!result.ok) {
      const reason = result.fieldErrors?.acceptanceCriteria;
      if (reason) {
        setError('text', { type: 'server', message: reason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    reset();
    setFocus('text');
  });

  if (!adding) {
    return (
      <Inline gap={0}>
        <Button
          type="button"
          variant="ghost"
          size="small"
          startSlot={<Icon name="plus" size="small" />}
          autoFocus={refocusAdd}
          onClick={(event) => {
            keepDrawerOpen(event);
            setAdding(true);
          }}
        >
          Add criterion
        </Button>
      </Inline>
    );
  }

  return (
    <form
      onSubmit={add}
      onKeyDown={(event) => {
        if (claimEscape(event) && !isSubmitting) {
          stopAdding();
        }
      }}
    >
      <Stack gap={1}>
        <Label htmlFor={inputId}>
          <VisuallyHidden>New acceptance criterion</VisuallyHidden>
        </Label>
        <Inline gap={2} alignY="center">
          <TextInput
            {...register('text')}
            id={inputId}
            autoComplete="off"
            autoFocus
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
          />
          <Button
            type="submit"
            size="small"
            loading={isSubmitting}
            onClick={keepDrawerOpen}
          >
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="small"
            disabled={isSubmitting}
            onClick={(event) => {
              keepDrawerOpen(event);
              stopAdding();
            }}
          >
            Cancel
          </Button>
        </Inline>
        <FieldError id={errorId} reason={fieldError} />
        {serverError && <Alert intent="error">{serverError}</Alert>}
      </Stack>
    </form>
  );
};

/**
 * A Ticket's acceptance criteria as a checklist (ADR 0007). Checking one
 * shows at once and saves only its checked state; it never changes the
 * Ticket's Status.
 */
export const AcceptanceCriteriaEditor: FC<AcceptanceCriteriaEditorProps> = ({
  ticketNumber,
  criteria,
}) => {
  const headingId = useId();
  const [shown, showChange] = useOptimistic(criteria, changedCriteria);
  const [error, setError] = useState<string>();
  const [, startChange] = useTransition();

  const check = (change: CheckChange) => {
    setError(undefined);
    startChange(async () => {
      showChange({ type: 'check', ...change });
      const result = await checkTicketAcceptanceCriterion({
        number: ticketNumber,
        ...change,
      });
      setError(refusalReason(result, 'acceptanceCriteria'));
    });
  };

  /**
   * Saves `next` as the whole list, showing it at once. Call it inside a
   * transition. Resolves to the reason when the server refuses it.
   */
  const save = async (next: AcceptanceCriterion[]) => {
    setError(undefined);
    showChange({ type: 'replace', criteria: next });
    const result = await setTicketAcceptanceCriteria({
      number: ticketNumber,
      acceptanceCriteria: asReplacement(next),
    });
    return refusalReason(result, 'acceptanceCriteria');
  };

  /** Saves `next` as the whole list, saying why when it is refused. */
  const replace = (next: AcceptanceCriterion[]) => {
    startChange(async () => {
      const reason = await save(next);
      if (reason !== undefined) {
        setError(reason);
      }
    });
  };

  /** Saves the order a criterion was dropped in, unless it stayed put. */
  const drop = (event: DragEndEvent) => {
    const { source } = event.operation;
    if (
      event.canceled ||
      !isSortable(source) ||
      source.initialIndex === source.index
    ) {
      return;
    }
    replace(moved(shown, source.initialIndex, source.index));
  };

  return (
    <Stack gap={2}>
      {/* Focusable, to take focus from a removed criterion's button. */}
      <Heading id={headingId} level={3} fontSize="medium" tabIndex={-1}>
        Acceptance criteria
      </Heading>
      {shown.length > 0 ? (
        <DragDropProvider onDragEnd={drop}>
          <Stack
            tag="ul"
            gap={1}
            aria-labelledby={headingId}
            className={styles.list}
          >
            {shown.map((criterion, index) => (
              <CriterionItem
                key={criterion.id}
                criterion={criterion}
                index={index}
                onCheck={(checked) => check({ id: criterion.id, checked })}
                onEdit={async (text) => {
                  // The server trims it too, so spaces alone change nothing.
                  if (text.trim() === criterion.text) {
                    return undefined;
                  }
                  // Runs in InlineEdit's transition.
                  return save(
                    shown.map((other) =>
                      // Editing a criterion unchecks it, as the server does.
                      other.id === criterion.id
                        ? { ...other, text: text.trim(), checked: false }
                        : other,
                    ),
                  );
                }}
                onRemove={() => {
                  document.getElementById(headingId)?.focus();
                  replace(shown.filter(({ id }) => id !== criterion.id));
                }}
              />
            ))}
          </Stack>
        </DragDropProvider>
      ) : (
        <Text tag="p" fontSize="small" color="muted">
          No acceptance criteria
        </Text>
      )}
      <NewCriterion ticketNumber={ticketNumber} criteria={shown} />
      {error && <Alert intent="error">{error}</Alert>}
    </Stack>
  );
};
