'use client';

import {
  Alert,
  Button,
  Heading,
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
  attachTicketToEpic,
  detachTicketFromEpic,
} from '../../app/tickets/actions';
import type { EpicChild, Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import {
  claimEscape,
  keepDrawerOpen,
} from '../keep-drawer-open/keep-drawer-open';
import { NewTicketInline } from '../new-ticket-inline/new-ticket-inline';
import * as styles from './epic-children.css';

export type EpicChildrenProps = {
  epic: Pick<Ticket, 'number' | 'projectId' | 'archived'>;
  /** The Epic's children, by Ticket number. */
  items: EpicChild[];
};

/** A child's Status, and whether it is blocked or archived, as shown. */
function describeChild(child: EpicChild): string {
  return [
    child.status,
    ...(child.blocked && child.status !== 'Done' ? ['Blocked'] : []),
    ...(child.archived ? ['Archived'] : []),
  ].join(' · ');
}

/**
 * An Epic's child Tickets in its drawer (ADR 0011): each linked with its
 * Status and a button to detach it, which shows at once. Below, unless the
 * Epic is archived, a field creates a child and Attach Ticket opens a field
 * for the number of an existing Ticket to attach, which shows once saved.
 */
export const EpicChildren: FC<EpicChildrenProps> = ({ epic, items }) => {
  const headingId = useId();
  const inputId = useId();
  const errorId = useId();
  const [shown, showDetached] = useOptimistic(
    items,
    (current, detached: number) =>
      current.filter((child) => child.number !== detached),
  );
  const [attaching, setAttaching] = useState(false);
  const [refocusAttach, setRefocusAttach] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ number: string }>({ defaultValues: { number: '' } });
  const fieldError = errors.number?.message;
  const serverError = errors.root?.server?.message;
  const [detachError, setDetachError] = useState<string>();
  const [, startDetach] = useTransition();

  const stopAttaching = () => {
    setAttaching(false);
    setRefocusAttach(true);
    reset();
  };

  const attach = handleSubmit(async ({ number }) => {
    const child = parseTicketNumber(number);
    if (child === undefined) {
      return;
    }
    const result = await attachTicketToEpic({ epic: epic.number, child });
    if (!result.ok) {
      setError('root.server', { message: result.error });
      return;
    }
    setAttaching(false);
    reset();
  });

  const detach = (child: number) => {
    setDetachError(undefined);
    startDetach(async () => {
      showDetached(child);
      const result = await detachTicketFromEpic({ number: child });
      if (!result.ok) {
        setDetachError(result.error);
      }
    });
  };

  return (
    <Stack gap={2}>
      <Heading id={headingId} level={3} fontSize="medium">
        Child Tickets
      </Heading>
      {shown.length > 0 ? (
        <Stack
          tag="ul"
          gap={1}
          aria-labelledby={headingId}
          className={styles.list}
        >
          {shown.map((child) => (
            <li key={child.number}>
              <Inline gap={2} alignY="center" flexWrap="wrap">
                <AppLink href={ticketByNumberPath(child.number)}>
                  T{child.number} {child.title}
                </AppLink>
                <Text fontSize="xsmall" color="muted">
                  {describeChild(child)}
                </Text>
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  aria-label={`Detach T${child.number}`}
                  onClick={(event) => {
                    keepDrawerOpen(event);
                    detach(child.number);
                  }}
                >
                  <Icon name="x-mark" size="small" />
                </Button>
              </Inline>
            </li>
          ))}
        </Stack>
      ) : (
        <Text tag="p" fontSize="small" color="muted">
          No child Tickets
        </Text>
      )}
      {!epic.archived && (
        <NewTicketInline projectId={epic.projectId} epicNumber={epic.number} />
      )}
      {epic.archived ? null : attaching ? (
        <form
          onSubmit={attach}
          onKeyDown={(event) => {
            if (claimEscape(event) && !isSubmitting) {
              stopAttaching();
            }
          }}
        >
          <Stack gap={1}>
            <Label htmlFor={inputId}>
              <VisuallyHidden>Ticket number to attach</VisuallyHidden>
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
                Attach
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="small"
                disabled={isSubmitting}
                onClick={(event) => {
                  keepDrawerOpen(event);
                  stopAttaching();
                }}
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
            startSlot={<Icon name="link" size="small" />}
            autoFocus={refocusAttach}
            onClick={(event) => {
              keepDrawerOpen(event);
              setAttaching(true);
            }}
          >
            Attach Ticket
          </Button>
        </Inline>
      )}
      {detachError && <Alert intent="error">{detachError}</Alert>}
      {serverError && <Alert intent="error">{serverError}</Alert>}
    </Stack>
  );
};
