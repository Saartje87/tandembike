'use client';

import {
  Box,
  Button,
  Inline,
  Label,
  Stack,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import {
  type FC,
  type FormEvent,
  type ReactNode,
  useId,
  useOptimistic,
  useState,
  useTransition,
} from 'react';
import { useForm } from 'react-hook-form';

import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import { claimEscape, keepDrawerOpen } from '../ticket-drawer/keep-drawer-open';
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
   * Wraps the text at rest, such as in a `Heading`; the text inherits its
   * font. The input is not wrapped.
   */
  renderText?: (text: ReactNode) => ReactNode;
  /** For the `<input>`, such as to match the wrapper's font. */
  inputClassName?: string;
  /**
   * Told when an edit opens (true) and ends (false), and when a refused
   * save reopens it, such as to hide the item's other buttons meanwhile.
   */
  onEditingChange?: (editing: boolean) => void;
};

const asIs = (text: ReactNode) => text;

/**
 * Text that edits in place. At rest it is plain text with a hover tint and a
 * focus ring; a click, or Enter on it, opens an input with Save (✓) and
 * Cancel (✗). Enter or Save closes it at once showing the new text while the
 * save runs; a refused save reopens it with the User's text and the reason.
 * Escape or Cancel drops the draft. Leaving the input does nothing.
 */
export const InlineEdit: FC<InlineEditProps> = ({
  value,
  label,
  onSave,
  readOnly = false,
  renderText = asIs,
  inputClassName,
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
  // Puts focus back on the text when the User ends an edit.
  const [refocus, setRefocus] = useState(false);
  const [shown, showSaved] = useOptimistic(value);
  const [, startSave] = useTransition();
  // The form outlives the input, which closes on submit while the text
  // saves. It has no pending state: the optimistic text shows instead.
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ text: string }>({
    defaultValues: { text: value },
    // A refused text keeps its reason until the edit ends.
    reValidateMode: 'onSubmit',
  });
  const error = errors.text?.message;

  const open = () => {
    reset({ text: value });
    setEditing(true);
  };
  const close = () => {
    setEditing(false);
    setRefocus(true);
  };
  const cancel = () => {
    close();
    reset({ text: value });
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    close();
    void handleSubmit(({ text }) => {
      if (text === value) {
        reset({ text: value });
        return;
      }
      startSave(async () => {
        showSaved(text);
        const reason = await onSave(text);
        if (reason !== undefined) {
          reset({ text });
          setError('text', { type: 'server', message: reason });
          setEditing(true);
        }
      });
    })();
  };

  if (readOnly) {
    return renderText(shown);
  }

  if (!editing) {
    return (
      <>
        {renderText(
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
            {shown}
          </button>,
        )}
        <VisuallyHidden id={hintId}>
          Edit {label.charAt(0).toLowerCase() + label.slice(1)}
        </VisuallyHidden>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <Stack gap={1}>
        <Inline gap={1} alignY="center" flexWrap="nowrap">
          <Box flex={1}>
            <Label htmlFor={inputId}>
              <VisuallyHidden>{label}</VisuallyHidden>
            </Label>
            <TextInput
              {...register('text')}
              id={inputId}
              onKeyDown={(event) => {
                if (claimEscape(event)) {
                  cancel();
                }
              }}
              inputClassName={inputClassName}
              autoComplete="off"
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </Box>
          <Button
            type="submit"
            variant="ghost"
            size="small"
            aria-label="Save"
            onClick={keepDrawerOpen}
          >
            <Icon name="check" size="small" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="small"
            aria-label="Cancel"
            onClick={(event) => {
              keepDrawerOpen(event);
              cancel();
            }}
          >
            <Icon name="x-mark" size="small" />
          </Button>
        </Inline>
        <FieldError id={errorId} reason={error} />
      </Stack>
    </form>
  );
};
