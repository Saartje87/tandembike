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
import {
  addTicketBlocker,
  removeTicketBlocker,
} from '../../app/tickets/actions';
import type {
  BlockerInput,
  Blockers,
  RelatedTicket,
} from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { claimEscape } from '../claim-escape/claim-escape';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';

export type BlockerEditorProps = {
  ticketNumber: number;
  /** Edit the Ticket's Blockers, or the Tickets it blocks. */
  direction: keyof Blockers;
  /** The Tickets on the other side, by number. */
  related: RelatedTicket[];
};

const copy = {
  blockedBy: {
    list: 'Blocked by',
    add: 'Add blocker',
    input: 'Ticket number of the Blocker',
    remove: (number: number) => `Remove Blocker T${number}`,
  },
  blocks: {
    list: 'Blocks',
    add: 'Add blocked Ticket',
    input: 'Ticket number of the blocked Ticket',
    remove: (number: number) => `Stop blocking T${number}`,
  },
} satisfies Record<keyof Blockers, unknown>;

/** A related Ticket's Status, and that it is archived when it is. */
function stateOf(ticket: RelatedTicket): string {
  return ticket.archived ? `${ticket.status} · Archived` : ticket.status;
}

type ReadinessProps = { blockers: RelatedTicket[] };

/**
 * Whether a Ticket with Blockers is blocked or ready to start; nothing for a
 * Ticket without any.
 */
const Readiness: FC<ReadinessProps> = ({ blockers }) => {
  if (blockers.length === 0) {
    return null;
  }
  const blocked = blockers.some((ticket) => !ticket.resolved);

  return (
    <Text
      tag="p"
      fontSize="small"
      fontWeight="medium"
      color={blocked ? 'warning-800' : 'success-800'}
    >
      {blocked ? 'Blocked' : 'Ready to start'}
    </Text>
  );
};

/**
 * One side of a Ticket's blocking relationships: the Tickets it is blocked
 * by, or the Tickets it blocks, each linked with its Status and a button to
 * remove it, then a button that opens a field for another Ticket number. A
 * removal shows at once; an addition shows once the server saves it. The
 * Blocked by side first says whether the Ticket is blocked or ready to start,
 * following the list as shown.
 */
export const BlockerEditor: FC<BlockerEditorProps> = ({
  ticketNumber,
  direction,
  related,
}) => {
  const wording = copy[direction];
  const inputId = useId();
  const errorId = useId();
  const [shown, showRemoved] = useOptimistic(
    related,
    (current, removed: number) =>
      current.filter((ticket) => ticket.number !== removed),
  );
  const [adding, setAdding] = useState(false);
  // Focus goes back to the add button after Escape.
  const [refocusAdd, setRefocusAdd] = useState(false);
  const {
    clearErrors,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ number: string }>({ defaultValues: { number: '' } });
  const fieldError = errors.number?.message;
  const serverError = errors.root?.server?.message;
  const [, startRemove] = useTransition();

  /** The relationship between this Ticket and Ticket `other`. */
  const relationshipWith = (other: number): BlockerInput =>
    direction === 'blockedBy'
      ? { blocker: other, blocked: ticketNumber }
      : { blocker: ticketNumber, blocked: other };

  const stopAdding = () => {
    setAdding(false);
    setRefocusAdd(true);
    reset();
  };

  const add = handleSubmit(async ({ number }) => {
    const other = parseTicketNumber(number);
    if (other === undefined) {
      return;
    }
    const result = await addTicketBlocker(relationshipWith(other));
    if (!result.ok) {
      // The module names `blocker` or `blocked`; this form has one number.
      const reason = Object.values(result.fieldErrors ?? {})[0];
      if (reason) {
        setError('number', { type: 'server', message: reason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    setAdding(false);
    reset();
  });

  const remove = (other: number) => {
    clearErrors();
    startRemove(async () => {
      showRemoved(other);
      const result = await removeTicketBlocker(relationshipWith(other));
      if (!result.ok) {
        setError('root.server', { message: result.error });
      }
    });
  };

  return (
    <Stack gap={2}>
      {direction === 'blockedBy' && <Readiness blockers={shown} />}
      {shown.length > 0 ? (
        <Stack
          gap={1}
          aria-label={wording.list}
          listStyle="none"
          role="list"
          asChild
        >
          <ul>
            {shown.map((ticket) => (
              <li key={ticket.number}>
                <Inline gap={2} alignY="center" flexWrap="wrap">
                  <AppLink href={ticketByNumberPath(ticket.number)}>
                    T{ticket.number} {ticket.title}
                  </AppLink>
                  <Text fontSize="xsmall" color="muted">
                    {stateOf(ticket)}
                  </Text>
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    aria-label={wording.remove(ticket.number)}
                    onClick={() => remove(ticket.number)}
                  >
                    <Icon name="x-mark" size="small" />
                  </Button>
                </Inline>
              </li>
            ))}
          </ul>
        </Stack>
      ) : (
        <Text tag="p" fontSize="small" color="muted">
          None
        </Text>
      )}
      {adding ? (
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
              <VisuallyHidden>{wording.input}</VisuallyHidden>
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
              <Button type="submit" size="small" loading={isSubmitting}>
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="small"
                disabled={isSubmitting}
                onClick={stopAdding}
              >
                Cancel
              </Button>
            </Inline>
            <FieldError id={errorId} reason={fieldError} />
          </Stack>
        </form>
      ) : (
        <Inline gap={0}>
          <Button
            type="button"
            variant="ghost"
            size="small"
            startSlot={<Icon name="plus" size="small" />}
            autoFocus={refocusAdd}
            onClick={() => setAdding(true)}
          >
            {wording.add}
          </Button>
        </Inline>
      )}
      {serverError && <Alert intent="danger">{serverError}</Alert>}
    </Stack>
  );
};
