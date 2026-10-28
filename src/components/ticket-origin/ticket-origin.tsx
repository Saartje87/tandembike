'use client';

import {
  Alert,
  Button,
  Inline,
  Label,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import { type FC, useId, useOptimistic, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { ticketByNumberPath } from '../../app/lib/paths';
import {
  parseTicketNumber,
  ticketNumberRule,
} from '../../app/lib/ticket-number';
import { setTicketOrigin } from '../../app/tickets/actions';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { FieldError } from '../field-error/field-error';
import {
  claimEscape,
  keepDrawerOpen,
} from '../keep-drawer-open/keep-drawer-open';

export type TicketOriginProps = {
  ticket: Pick<Ticket, 'number' | 'origin'>;
};

/**
 * The Ticket a Ticket was split from, in its drawer (ADR 0015): a link to it
 * with its Status, Change Origin and Clear Origin, or None with Set Origin.
 * Setting or changing opens a field for the Origin's number, which shows
 * once saved; clearing shows at once.
 */
export const TicketOrigin: FC<TicketOriginProps> = ({ ticket }) => {
  const inputId = useId();
  const errorId = useId();
  const [origin, showOrigin] = useOptimistic(ticket.origin);
  const [editing, setEditing] = useState(false);
  const [refocusEdit, setRefocusEdit] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ number: string }>({ defaultValues: { number: '' } });
  const fieldError = errors.number?.message;
  const serverError = errors.root?.server?.message;
  const [clearError, setClearError] = useState<string>();
  const [clearPending, startClear] = useTransition();

  const stopEditing = () => {
    setEditing(false);
    setRefocusEdit(true);
    reset();
  };

  const save = handleSubmit(async ({ number }) => {
    const originNumber = parseTicketNumber(number);
    if (originNumber === undefined) {
      return;
    }
    const result = await setTicketOrigin({
      number: ticket.number,
      originNumber,
    });
    if (!result.ok) {
      setError('root.server', { message: result.error });
      return;
    }
    stopEditing();
  });

  const clear = () => {
    setClearError(undefined);
    startClear(async () => {
      showOrigin(null);
      const result = await setTicketOrigin({
        number: ticket.number,
        originNumber: null,
      });
      if (!result.ok) {
        setClearError(result.error);
      }
    });
  };

  if (editing) {
    return (
      <form
        onSubmit={save}
        onKeyDown={(event) => {
          if (claimEscape(event) && !isSubmitting) {
            stopEditing();
          }
        }}
      >
        <Stack gap={1}>
          <Label htmlFor={inputId}>
            <VisuallyHidden>Origin Ticket number</VisuallyHidden>
          </Label>
          <Inline gap={2} alignY="center">
            <TextInput
              {...register('number', {
                validate: (value) =>
                  parseTicketNumber(value) === undefined
                    ? ticketNumberRule
                    : undefined,
              })}
              id={inputId}
              inputMode="numeric"
              placeholder="T42"
              autoComplete="off"
              autoFocus
              disabled={isSubmitting}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? errorId : undefined}
            />
            <Button
              type="submit"
              size="small"
              loading={isSubmitting}
              onClick={keepDrawerOpen}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="small"
              disabled={isSubmitting}
              onClick={(event) => {
                keepDrawerOpen(event);
                stopEditing();
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
  }

  return (
    <Stack gap={1}>
      <Inline gap={2} alignY="center" flexWrap="wrap">
        {origin ? (
          <>
            <AppLink href={ticketByNumberPath(origin.number)}>
              T{origin.number} {origin.title}
            </AppLink>
            <Text fontSize="xsmall" color="muted">
              {origin.status}
            </Text>
          </>
        ) : (
          <Text color="muted">None</Text>
        )}
        <Button
          type="button"
          variant="ghost"
          size="small"
          autoFocus={refocusEdit}
          onClick={(event) => {
            keepDrawerOpen(event);
            setEditing(true);
          }}
        >
          {origin ? 'Change Origin' : 'Set Origin'}
        </Button>
        {origin && (
          <Button
            type="button"
            variant="ghost"
            size="small"
            disabled={clearPending}
            onClick={(event) => {
              keepDrawerOpen(event);
              clear();
            }}
          >
            Clear Origin
          </Button>
        )}
      </Inline>
      {clearError && <Alert intent="error">{clearError}</Alert>}
    </Stack>
  );
};
