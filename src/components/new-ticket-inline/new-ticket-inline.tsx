'use client';

import {
  Button,
  Label,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import type { FC } from 'react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { createTicket } from '../../app/tickets/actions';
import type { TicketType } from '../../tickets/ticket-type';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import { useProjectAgent } from '../project-agent/project-agent';

export type NewTicketInlineProps = {
  /** The Project the new Ticket goes in. */
  projectId: number;
  /** The Cycle to plan it into, on that Cycle's tab. */
  cycleId?: number;
  /** The Epic to create it under, in that Epic's drawer. */
  epicNumber?: number;
  /** What to create; defaults to a normal Ticket. */
  type?: TicketType;
  /** Focus the field as it appears. */
  autoFocus?: boolean;
  /** Called after a Ticket is created, and when Escape clears the field. */
  onDone?: () => void;
  /** Called with the number of each Ticket created, before `onDone`. */
  onCreated?: (number: number) => void;
};

/** What the field is called and says when empty, by what it creates. */
const copy = {
  ticket: { label: 'New Ticket title', placeholder: 'Add a Ticket…' },
  child: {
    label: 'New child Ticket title',
    placeholder: 'Add a child Ticket…',
  },
  epic: { label: 'New Epic title', placeholder: 'Add an Epic…' },
};

/**
 * A title field that creates a Ticket in Todo in `projectId`, planned into
 * `cycleId` or under `epicNumber` when given, on Enter or with its Create
 * Ticket button, and clears for the next one; Escape clears it without
 * creating; both call `onDone`. With `type` Epic it creates an Epic instead.
 * The module validates, and its reason shows under the field. On success
 * the Server Action revalidates the Board, which shows the new Ticket.
 *
 * In a Project with an Agent (`ProjectAgentProvider`, T592) one of Enter and
 * Ctrl/Cmd+Enter creates through a New Ticket Conversation instead: the title
 * is the first message, the field's Cycle, Epic and type go as defaults, and
 * a `Draft · New Ticket` tab opens in the Conversation dialog and Send there starts the Conversation. A hint under the focused field says
 * which key does which.
 */
export const NewTicketInline: FC<NewTicketInlineProps> = ({
  projectId,
  cycleId,
  epicNumber,
  type = 'Ticket',
  autoFocus,
  onDone,
  onCreated,
}) => {
  const titleId = useId();
  const errorId = useId();
  const hintId = useId();
  const agent = useProjectAgent();
  const dialog = useConversationDialog();
  const [focused, setFocused] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ title: string }>({ defaultValues: { title: '' } });
  const reason = errors.title?.message ?? errors.root?.server?.message;
  const { label, placeholder } =
    copy[
      type === 'Epic' ? 'epic' : epicNumber === undefined ? 'ticket' : 'child'
    ];

  const showRefusal = (
    result: { error: string; fieldErrors?: Record<string, string> | undefined },
    field: 'title',
  ) => {
    const titleReason = result.fieldErrors?.[field];
    if (titleReason) {
      setError('title', { type: 'server', message: titleReason });
    } else {
      setError('root.server', { message: result.error });
    }
  };

  const create = async (title: string) => {
    const result = await createTicket({
      projectId,
      title,
      ...(cycleId === undefined ? {} : { cycleId }),
      ...(epicNumber === undefined ? {} : { epicNumber }),
      ...(type === 'Epic' ? { type } : {}),
    });
    if (!result.ok) {
      showRefusal(result, 'title');
      return;
    }
    reset();
    onCreated?.(result.number);
    onDone?.();
  };

  // The title opens a draft; nothing starts until the User sends it.
  const createWithAgent = (title: string) => {
    dialog.openDraft({
      intent: 'new_ticket',
      projectId,
      text: title,
      defaults: {
        ...(cycleId === undefined ? {} : { cycleId }),
        ...(epicNumber === undefined ? {} : { epicNumber }),
        type,
      },
    });
    reset();
    onDone?.();
  };

  // With an Agent, the default mode decides what Enter does; Ctrl/Cmd+Enter
  // does the other.
  const submitWith = (withAgent: boolean) =>
    handleSubmit(({ title }) =>
      agent && withAgent ? createWithAgent(title) : create(title),
    );
  const submit = submitWith(agent?.mode === 'default');
  const noun = type === 'Epic' ? 'Epic' : 'Ticket';
  const hint =
    agent?.mode === 'default'
      ? `Enter asks an Agent to create it. Ctrl/Cmd+Enter creates the ${noun} yourself.`
      : `Enter creates the ${noun}. Ctrl/Cmd+Enter asks an Agent to create it.`;

  // While a Ticket saves, the field is read-only and ignores Enter and
  // Escape, so a Ticket is created once and what was saved is what clears.
  return (
    <form
      onSubmit={(event) => {
        if (isSubmitting) {
          event.preventDefault();
          return;
        }
        submit(event);
      }}
    >
      <Stack gap={1}>
        <Label htmlFor={titleId}>
          <VisuallyHidden>{label}</VisuallyHidden>
        </Label>
        <TextInput
          {...register('title')}
          id={titleId}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              if (!isSubmitting) {
                submitWith(agent?.mode === 'optional')(event);
              }
              return;
            }
            if (event.key === 'Escape' && !isSubmitting) {
              event.preventDefault();
              reset();
              event.currentTarget.blur();
              onDone?.();
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          readOnly={isSubmitting}
          endSlot={
            <Button
              type="submit"
              variant="ghost"
              size="small"
              loading={isSubmitting}
              aria-label={type === 'Epic' ? 'Create Epic' : 'Create Ticket'}
            >
              <Icon name="plus" size="small" />
            </Button>
          }
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={
            [
              reason ? errorId : undefined,
              agent && focused ? hintId : undefined,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        <FieldError id={errorId} reason={reason} />
        {agent && focused && (
          <Text id={hintId} fontSize="small" color="muted">
            {hint}
          </Text>
        )}
      </Stack>
    </form>
  );
};
