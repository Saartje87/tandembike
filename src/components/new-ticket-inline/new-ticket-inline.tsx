'use client';

import {
  Button,
  Label,
  Stack,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import type { FC } from 'react';
import { useId } from 'react';
import { useForm } from 'react-hook-form';

import { createTicket } from '../../app/tickets/actions';
import type { TicketType } from '../../tickets/ticket-type';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';

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
 */
export const NewTicketInline: FC<NewTicketInlineProps> = ({
  projectId,
  cycleId,
  epicNumber,
  type = 'Ticket',
  autoFocus,
  onDone,
}) => {
  const titleId = useId();
  const errorId = useId();
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

  const submit = handleSubmit(async ({ title }) => {
    const result = await createTicket({
      projectId,
      title,
      ...(cycleId === undefined ? {} : { cycleId }),
      ...(epicNumber === undefined ? {} : { epicNumber }),
      ...(type === 'Epic' ? { type } : {}),
    });
    if (!result.ok) {
      const titleReason = result.fieldErrors?.title;
      if (titleReason) {
        setError('title', { type: 'server', message: titleReason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    reset();
    onDone?.();
  });

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
          onKeyDown={(event) => {
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
          aria-describedby={reason ? errorId : undefined}
        />
        <FieldError id={errorId} reason={reason} />
      </Stack>
    </form>
  );
};
