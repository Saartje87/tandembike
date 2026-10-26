'use client';

import {
  Box,
  Button,
  Inline,
  Label,
  Stack,
  Text,
  Textarea,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import {
  type FC,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useForm } from 'react-hook-form';

import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import {
  claimEscape,
  keepDrawerOpen,
} from '../keep-drawer-open/keep-drawer-open';
import * as styles from './inline-edit.css';

export type InlineEditProps = {
  /** The saved text. */
  value: string;
  /** The field's name, such as "Title": the input's label and the edit hint. */
  label: string;
  /**
   * Saves the User's text. Resolves to the reason when the server refuses
   * it, or to nothing when it is saved. Runs inside a transition, so it may
   * show its own optimistic state before its first `await`.
   */
  onSave: (value: string) => Promise<string | undefined>;
  /** Plain text with no cue that cannot be opened, such as in an archived Project. */
  readOnly?: boolean;
  /**
   * Wraps the text at rest, read-only included, such as in a `Heading`; the
   * text inherits its font. The input is not wrapped.
   */
  wrap?: (text: ReactNode) => ReactNode;
  /** For the `<input>`, such as to match the wrapper's font. */
  inputClassName?: string;
  /**
   * Edits in a textarea with Cancel below it, where Enter adds a line and
   * Cmd/Ctrl+Enter saves.
   */
  multiline?: boolean;
  /** The textarea's height in lines, when `multiline`. Defaults to 12. */
  rows?: number;
  /**
   * Renders the saved text as content at rest, such as Markdown, inside
   * `wrap`. Links in it still work: a click or Enter on one follows it
   * instead of opening the edit.
   */
  renderContent?: (value: string) => ReactNode;
  /** Shown, muted, at rest when the text is empty, such as "Add a description…". */
  placeholder?: string;
  /**
   * Told when an edit opens (true) and ends (false), and when a refused
   * save reopens it, such as to hide the item's other buttons meanwhile.
   */
  onEditingChange?: (editing: boolean) => void;
};

const asIs = (text: ReactNode) => text;

/** Whether `event` started on a link, which it should follow instead. */
const onLink = (event: { target: EventTarget }) =>
  event.target instanceof Element && event.target.closest('a') !== null;

/**
 * Text that edits in place. At rest it is plain text with a hover tint and a
 * focus ring; a click, or Enter on it, opens an input with Cancel (✗).
 * Enter, or focus leaving it for elsewhere in the page, closes it at once
 * showing the new text while the save runs; a refused save reopens it with
 * the User's text and the reason. Escape or Cancel drops the draft. Switching
 * windows leaves it open.
 */
export const InlineEdit: FC<InlineEditProps> = ({
  value,
  label,
  onSave,
  readOnly = false,
  wrap = asIs,
  inputClassName,
  multiline = false,
  rows = 12,
  renderContent = asIs,
  placeholder,
  onEditingChange,
}) => {
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  const [editing, setEditingState] = useState(false);
  const setEditing = (next: boolean) => {
    setEditingState(next);
    onEditingChange?.(next);
  };
  // Puts focus back on the text when the User ends an edit, unless they
  // ended it by leaving.
  const [refocus, setRefocus] = useState(false);
  // Whether the input takes focus when it opens: not when a save refused
  // after leaving reopens it, which leaves focus where the User went.
  const [focusInput, setFocusInput] = useState(true);
  // Set once an edit ends, so the input's blur as it unmounts saves nothing.
  const ended = useRef(false);
  // The multiline text at rest, which is not a button, so React does not
  // autofocus it.
  const atRest = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editing && refocus) {
      atRest.current?.focus();
    }
  }, [editing, refocus]);
  const [shown, showSaved] = useOptimistic(value);
  const [, startSave] = useTransition();
  // The form outlives the input, which closes on submit while the text
  // saves. It has no pending state: the optimistic text shows instead.
  const {
    formState: { defaultValues, errors },
    getValues,
    register,
    reset,
    setError,
    setValue,
  } = useForm<{ text: string }>({
    defaultValues: { text: value },
    // A refused text keeps its reason until the edit ends.
    reValidateMode: 'onSubmit',
  });
  const error = errors.text?.message;

  const reopen = (focus: boolean) => {
    ended.current = false;
    setFocusInput(focus);
    setEditing(true);
  };
  const open = () => {
    reset({ text: value });
    reopen(true);
  };
  const close = (left: boolean) => {
    ended.current = true;
    setEditing(false);
    setRefocus(!left);
  };
  const cancel = () => {
    close(false);
    reset({ text: value });
  };
  // Not `handleSubmit`: it validates asynchronously, so the input would
  // close a frame before the new text shows. The field has no rules to check.
  const save = (left: boolean) => {
    const text = getValues('text');
    // The text when the edit began, which may since have changed elsewhere.
    const original = defaultValues?.text ?? value;
    close(left);
    if (text === original) {
      reset({ text: value });
      return;
    }
    // In the same update as `close`, so the new text replaces the input.
    startSave(async () => {
      showSaved(text);
      const reason = await onSave(text);
      if (reason !== undefined) {
        // Compared with the original again on the next save.
        reset({ text: original });
        setValue('text', text);
        setError('text', { type: 'server', message: reason });
        reopen(!left);
      }
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save(false);
  };
  // Saves when focus leaves the form for elsewhere in the page. Moving to
  // Cancel stays inside it, and a click on Cancel keeps focus in the input.
  // When the window loses focus, the input stays the page's focused element.
  const leave = (event: FocusEvent<HTMLFormElement>) => {
    if (
      ended.current ||
      event.currentTarget.contains(event.relatedTarget) ||
      document.activeElement === event.target
    ) {
      return;
    }
    save(true);
  };

  if (readOnly) {
    return wrap(renderContent(shown));
  }

  const content =
    shown === '' && placeholder !== undefined ? (
      <Text color="text-600">{placeholder}</Text>
    ) : (
      renderContent(shown)
    );
  const hint = (
    <VisuallyHidden id={hintId}>
      Edit {label.charAt(0).toLowerCase() + label.slice(1)}
    </VisuallyHidden>
  );

  if (!editing && multiline) {
    // Not a <button>: the text may hold links, which a button cannot.
    return (
      <>
        {wrap(
          // biome-ignore lint/a11y/noStaticElementInteractions: a button role would hide the links inside from assistive technology.
          <div
            ref={atRest}
            className={styles.text}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: opens on Enter, like the single-line button.
            tabIndex={0}
            aria-describedby={hintId}
            onClick={(event) => {
              if (onLink(event)) {
                return;
              }
              keepDrawerOpen(event);
              open();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !onLink(event)) {
                event.preventDefault();
                open();
              }
            }}
          >
            {content}
          </div>,
        )}
        {hint}
      </>
    );
  }

  if (!editing) {
    return (
      <>
        {wrap(
          <button
            type="button"
            className={styles.text}
            aria-describedby={hintId}
            // biome-ignore lint/a11y/noAutofocus: only after the User ends an edit, to put focus back where it was.
            autoFocus={refocus}
            onClick={(event) => {
              keepDrawerOpen(event);
              open();
            }}
          >
            {content}
          </button>,
        )}
        {hint}
      </>
    );
  }

  const cancelButton = (
    <Button
      type="button"
      variant="ghost"
      size="small"
      aria-label="Cancel"
      // Keeps focus in the input, so the click does not count as leaving.
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        keepDrawerOpen(event);
        cancel();
      }}
    >
      <Icon name="x-mark" size="small" />
    </Button>
  );
  const fieldLabel = (
    <Label htmlFor={inputId}>
      <VisuallyHidden>{label}</VisuallyHidden>
    </Label>
  );
  const fieldProps = {
    ...register('text'),
    id: inputId,
    autoFocus: focusInput,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
  };

  if (multiline) {
    return (
      <form onSubmit={submit} onBlur={leave}>
        <Stack gap={1}>
          <Box>
            {fieldLabel}
            <Textarea
              {...fieldProps}
              rows={rows}
              onKeyDown={(event) => {
                if (claimEscape(event)) {
                  cancel();
                } else if (
                  event.key === 'Enter' &&
                  (event.metaKey || event.ctrlKey)
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </Box>
          <FieldError id={errorId} reason={error} />
          <Box>{cancelButton}</Box>
        </Stack>
      </form>
    );
  }

  return (
    <form onSubmit={submit} onBlur={leave}>
      <Stack gap={1}>
        <Inline gap={1} alignY="center" flexWrap="nowrap">
          <Box flex={1}>
            {fieldLabel}
            <TextInput
              {...fieldProps}
              onKeyDown={(event) => {
                if (claimEscape(event)) {
                  cancel();
                }
              }}
              inputClassName={inputClassName}
              autoComplete="off"
            />
          </Box>
          {cancelButton}
        </Inline>
        <FieldError id={errorId} reason={error} />
      </Stack>
    </form>
  );
};
