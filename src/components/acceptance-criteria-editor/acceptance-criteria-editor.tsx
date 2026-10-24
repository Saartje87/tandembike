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

import {
  checkTicketAcceptanceCriterion,
  setTicketAcceptanceCriteria,
} from '../../app/tickets/actions';
import type { AcceptanceCriterion } from '../../tickets/tickets';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import { claimEscape, keepDrawerOpen } from '../ticket-drawer/keep-drawer-open';
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
  children: ReactNode;
};

/**
 * A criterion that can be dragged by its handle to another place. Only a
 * criterion that shows, not one being edited or removed, renders one: a
 * sortable without its handle makes its whole item the handle.
 */
const SortableCriterion: FC<SortableCriterionProps> = ({
  criterion,
  index,
  children,
}) => {
  const { ref, handleRef } = useSortable({ id: criterion.id, index });

  return (
    <li ref={ref} className={styles.sortable}>
      <Inline gap={1} alignY="center">
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
        {children}
      </Inline>
    </li>
  );
};

/** Whether a criterion shows, is being edited, or asks to confirm its removal. */
type CriterionMode = 'show' | 'edit' | 'remove';

type CriterionItemProps = {
  criterion: AcceptanceCriterion;
  /** Its place in the list, from 0. */
  index: number;
  onCheck: (checked: boolean) => void;
  /** Saves new text; `onRefused` gets the reason when the server refuses it. */
  onEdit: (text: string, onRefused: (reason: string) => void) => void;
  onRemove: () => void;
};

/**
 * One criterion: a handle to drag it to another place, its checkbox, its
 * text, which opens a field to edit it, and a button to remove it. In the
 * field Enter saves and Escape cancels; a refused edit opens the field again
 * with the User's text. Remove asks first, in place of the criterion.
 */
const CriterionItem: FC<CriterionItemProps> = ({
  criterion,
  index,
  onCheck,
  onEdit,
  onRemove,
}) => {
  const inputId = useId();
  const errorId = useId();
  const [mode, setMode] = useState<CriterionMode>('show');
  // The button to focus once the criterion shows again.
  const [refocus, setRefocus] = useState<Exclude<CriterionMode, 'show'>>();
  // The form outlives the field, which closes on submit while the text
  // saves. It has no pending state: the optimistic text shows instead.
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ text: string }>({
    defaultValues: { text: criterion.text },
    // A refused text keeps its reason until the edit ends.
    reValidateMode: 'onSubmit',
  });
  const error = errors.text?.message;

  const keepingDrawerOpen = (run: () => void) => (event: MouseEvent) => {
    keepDrawerOpen(event);
    run();
  };
  const showAgain = (focus: typeof refocus) => {
    setMode('show');
    setRefocus(focus);
  };
  const endEdit = () => showAgain('edit');
  const save = handleSubmit(({ text }) => {
    endEdit();
    if (text.trim() === criterion.text) {
      reset({ text: criterion.text });
      return;
    }
    onEdit(text, (reason) => {
      reset({ text });
      setError('text', { type: 'server', message: reason });
      setMode('edit');
    });
  });
  const cancel = () => {
    endEdit();
    reset({ text: criterion.text });
  };

  if (mode === 'remove') {
    return (
      <li
        onKeyDown={(event) => {
          if (claimEscape(event)) {
            showAgain('remove');
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
              onClick={keepingDrawerOpen(() => showAgain('remove'))}
            >
              Cancel
            </Button>
          </Inline>
        </Stack>
      </li>
    );
  }

  if (mode === 'edit') {
    return (
      <li>
        <form
          onSubmit={save}
          onKeyDown={(event) => {
            if (claimEscape(event)) {
              cancel();
            }
          }}
        >
          <Stack gap={1}>
            <Label htmlFor={inputId}>
              <VisuallyHidden>Edit acceptance criterion</VisuallyHidden>
            </Label>
            <Inline gap={2} alignY="center">
              <TextInput
                {...register('text')}
                id={inputId}
                autoComplete="off"
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
              <Button type="submit" size="small" onClick={keepDrawerOpen}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="small"
                onClick={keepingDrawerOpen(cancel)}
              >
                Cancel
              </Button>
            </Inline>
            <FieldError id={errorId} reason={error} />
          </Stack>
        </form>
      </li>
    );
  }

  return (
    <SortableCriterion criterion={criterion} index={index}>
      <Checkbox
        name={`criterion-${criterion.id}`}
        aria-label={criterion.text}
        className={styles.checkbox}
        checked={criterion.checked}
        onChange={(event) => onCheck(event.currentTarget.checked)}
      />
      <Box
        asChild
        flex={1}
        backgroundColor="transparent"
        border="none"
        borderRadius={1}
        paddingBlock={0}
        paddingInline={1}
        wordBreak="break-word"
        className={styles.text}
      >
        <button
          type="button"
          aria-label={`Edit criterion: ${criterion.text}`}
          // biome-ignore lint/a11y/noAutofocus: returns focus to the text when its edit ends, as the Blocks buttons here do.
          autoFocus={refocus === 'edit'}
          onClick={keepingDrawerOpen(() => {
            reset({ text: criterion.text });
            setMode('edit');
          })}
        >
          {criterion.text}
        </button>
      </Box>
      <Inline gap={0} alignY="center">
        <Button
          type="button"
          variant="ghost"
          size="small"
          intent="danger"
          aria-label={`Remove criterion: ${criterion.text}`}
          autoFocus={refocus === 'remove'}
          onClick={keepingDrawerOpen(() => setMode('remove'))}
        >
          <Icon name="x-mark" size="small" />
        </Button>
      </Inline>
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
      if (!result.ok) {
        setError(result.fieldErrors?.acceptanceCriteria ?? result.error);
      }
    });
  };

  /** Saves `next` as the whole list, showing it at once. */
  const replace = (
    next: AcceptanceCriterion[],
    onRefused: (reason: string) => void = setError,
  ) => {
    setError(undefined);
    startChange(async () => {
      showChange({ type: 'replace', criteria: next });
      const result = await setTicketAcceptanceCriteria({
        number: ticketNumber,
        acceptanceCriteria: asReplacement(next),
      });
      if (!result.ok) {
        onRefused(result.fieldErrors?.acceptanceCriteria ?? result.error);
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
                onEdit={(text, onRefused) =>
                  replace(
                    shown.map((other) =>
                      // Editing a criterion unchecks it, as the server does.
                      other.id === criterion.id
                        ? { ...other, text: text.trim(), checked: false }
                        : other,
                    ),
                    onRefused,
                  )
                }
                onRemove={() => {
                  document.getElementById(headingId)?.focus();
                  replace(shown.filter(({ id }) => id !== criterion.id));
                }}
              />
            ))}
          </Stack>
        </DragDropProvider>
      ) : (
        <Text tag="p" fontSize="small" color="text-600">
          No acceptance criteria
        </Text>
      )}
      <NewCriterion ticketNumber={ticketNumber} criteria={shown} />
      {error && <Alert intent="error">{error}</Alert>}
    </Stack>
  );
};
