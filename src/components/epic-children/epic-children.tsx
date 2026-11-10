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

import { callAction } from '../../app/lib/call-action';
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
import { claimEscape } from '../claim-escape/claim-escape';
import { EpicOrder } from '../epic-order/epic-order';
import type { OutsideBlocker } from '../epic-order/epic-order-layout';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import { NewTicketInline } from '../new-ticket-inline/new-ticket-inline';
import { type ChildrenBoard, childLink } from './child-link';

export type EpicChildrenProps = {
  epic: Pick<Ticket, 'number' | 'projectId' | 'archived'>;
  /** The Epic's children, by Ticket number. */
  items: EpicChild[];
  /** The children's direct Blockers from outside the Epic. Defaults to none. */
  outside?: OutsideBlocker[];
  /**
   * The Board the drawer opens over. Without one, every child opens over
   * its own Board.
   */
  board?: ChildrenBoard;
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
 * An Epic's child Tickets in its drawer (ADR 0011), below a diagram of the
 * order to work them in (`EpicOrder`): each with its title linked, over this
 * Board when it is on it and else over its own (ADR 0013), its Status and a
 * button to detach it, unless the Epic is archived, which shows at once in
 * both. Below, unless the Epic is archived, a field creates a child and Attach Ticket opens a field
 * for the number of an existing Ticket to attach, which shows once saved.
 */
export const EpicChildren: FC<EpicChildrenProps> = ({
  epic,
  items,
  outside,
  board,
}) => {
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
    const result = await callAction(
      () => attachTicketToEpic({ epic: epic.number, child }),
      'The Ticket could not be attached. Try again.',
    );
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
      const result = await callAction(
        () => detachTicketFromEpic({ number: child }),
        'The Ticket could not be detached. Try again.',
      );
      if (!result.ok) {
        setDetachError(result.error);
      }
    });
  };

  return (
    <>
      <EpicOrder items={shown} outside={outside} board={board} />
      <Stack gap={2}>
        <Heading id={headingId} level={3} fontSize="medium">
          Child Tickets
        </Heading>
        {shown.length > 0 ? (
          <Stack
            gap={1}
            aria-labelledby={headingId}
            listStyle="none"
            role="list"
            asChild
          >
            <ul>
              {shown.map((child) => (
                <li key={child.number}>
                  <Inline gap={2} alignY="center" flexWrap="wrap">
                    <Text fontSize="small" fontFamily="mono" color="muted">
                      T{child.number}
                    </Text>
                    <AppLink {...childLink(child.number, board)}>
                      {child.title}
                    </AppLink>
                    <Text fontSize="xsmall" color="muted">
                      {describeChild(child)}
                    </Text>
                    {!epic.archived && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="small"
                        aria-label={`Detach T${child.number}`}
                        onClick={() => detach(child.number)}
                      >
                        <Icon name="x-mark" size="small" />
                      </Button>
                    )}
                  </Inline>
                </li>
              ))}
            </ul>
          </Stack>
        ) : (
          <Text tag="p" fontSize="small" color="muted">
            No child Tickets
          </Text>
        )}
        {!epic.archived && (
          <NewTicketInline
            projectId={epic.projectId}
            epicNumber={epic.number}
          />
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
                <Button type="submit" size="small" loading={isSubmitting}>
                  Attach
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  disabled={isSubmitting}
                  onClick={stopAttaching}
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
              onClick={() => setAttaching(true)}
            >
              Attach Ticket
            </Button>
          </Inline>
        )}
        {detachError && <Alert intent="danger">{detachError}</Alert>}
        {serverError && <Alert intent="danger">{serverError}</Alert>}
      </Stack>
    </>
  );
};
