'use client';

import { Alert, Button, Inline, Stack, Textarea } from '@blockle/blocks';
import {
  type FC,
  type KeyboardEvent,
  type Ref,
  useId,
  useImperativeHandle,
  useRef,
} from 'react';
import { useForm } from 'react-hook-form';

import { ConversationSkillChips } from '../conversation-skill-chips/conversation-skill-chips';
import { FieldError } from '../field-error/field-error';

/** What the chat does to the message input besides the User typing (T613). */
export type MessageInputControl = {
  /** Adds a line to the input, replacing an earlier line with the same prefix. */
  addLine: (prefix: string, line: string) => void;
  /** Sends the input's text with this line at once. */
  sendWith: (line: string) => void;
};

/** What sending a message came to: done, or a refusal to show. */
export type SendOutcome =
  | { ok: true }
  | {
      ok: false;
      /** Shown under the input when it names the text itself. */
      textError?: string | undefined;
      /** Shown as an alert otherwise. */
      error: string;
    };

export type ConversationMessageInputProps = {
  /** Sends the text; a refusal keeps the text and shows its reason. */
  onSend: (text: string) => Promise<SendOutcome>;
  label: string;
  placeholder: string;
  rows: number;
  /** The text to start with. */
  initialText?: string;
  autoFocus?: boolean;
  /** Called as the User types. */
  onTextChange?: (text: string) => void;
  control?: Ref<MessageInputControl>;
  className?: string;
  /** The Project's Skill commands, offered as chips above the input (T620). */
  skills?: string[];
};

/** `text` starting with `command`, in place of a command it started with. */
const withSkill = (text: string, command: string) =>
  `${command} ${text.replace(/^\/\S*[ \t]*/, '')}`;

/**
 * The text input and Send button of a Conversation message, shared by the
 * chat's reply form and a draft. Enter sends and Shift+Enter starts a new
 * line. A refused send keeps its text and shows the reason; a sent one
 * clears the input.
 */
export const ConversationMessageInput: FC<ConversationMessageInputProps> = ({
  onSend,
  label,
  placeholder,
  rows,
  initialText = '',
  autoFocus,
  onTextChange,
  control,
  className,
  skills = [],
}) => {
  const errorId = useId();
  const field = useRef<HTMLTextAreaElement | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<{ text: string }>({
    defaultValues: { text: initialText },
    reValidateMode: 'onSubmit',
  });
  const fieldError = errors.text?.message;
  const error = errors.root?.server?.message;
  const text = register('text');
  const empty = watch('text').trim() === '';

  const submit = handleSubmit(async ({ text }) => {
    const outcome = await onSend(text);
    if (outcome.ok) {
      reset();
    } else if (outcome.textError) {
      setError('text', { type: 'server', message: outcome.textError });
    } else {
      setError('root.server', { message: outcome.error });
    }
  });

  useImperativeHandle(control, () => ({
    addLine: (prefix, line) => {
      const lines = watch('text')
        .split('\n')
        .filter((existing) => existing !== '' && !existing.startsWith(prefix));
      setValue('text', [...lines, line].join('\n'));
    },
    sendWith: (line) => {
      if (!isSubmitting) {
        const typed = watch('text').trim();
        setValue('text', typed === '' ? line : `${typed}\n${line}`);
        submit();
      }
    },
  }));

  const chooseSkill = (command: string) => {
    const next = withSkill(watch('text'), command);
    setValue('text', next);
    onTextChange?.(next);
    field.current?.focus();
    field.current?.setSelectionRange(next.length, next.length);
  };

  const send = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!isSubmitting && !empty) {
      submit();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      send(event);
    }
  };

  return (
    <form onSubmit={send} className={className}>
      <Stack gap={1}>
        <ConversationSkillChips skills={skills} onChoose={chooseSkill} />
        <Textarea
          {...text}
          ref={(element) => {
            text.ref(element);
            field.current = element;
          }}
          onChange={(event) => {
            text.onChange(event);
            onTextChange?.(event.target.value);
          }}
          aria-label={label}
          placeholder={placeholder}
          rows={rows}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
        />
        <FieldError id={errorId} reason={fieldError} />
        {error && <Alert intent="danger">{error}</Alert>}
        <Inline gap={2} alignX="end">
          <Button
            type="submit"
            size="small"
            loading={isSubmitting}
            disabled={isSubmitting || empty}
          >
            Send
          </Button>
        </Inline>
      </Stack>
    </form>
  );
};
