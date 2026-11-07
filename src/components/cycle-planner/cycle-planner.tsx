'use client';

import {
  Alert,
  Button,
  Inline,
  Label,
  Select,
  Stack,
  Text,
  VisuallyHidden,
} from '@blockle/blocks';
import { type FC, type ReactNode, useId, useState, useTransition } from 'react';

import { planTicket, unplanTicket } from '../../app/cycles/actions';
import { cyclePath } from '../../app/lib/paths';
import type { Cycle } from '../../tickets/cycles';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import {
  type EpicCycleChild,
  EpicCycleDialog,
} from '../epic-cycle-dialog/epic-cycle-dialog';

export type CyclePlannerProps = {
  ticket: Pick<
    Ticket,
    'number' | 'title' | 'status' | 'archived' | 'type' | 'children'
  >;
  /** The Cycles of the Ticket's Project; Archived ones are left out. */
  cycles: Cycle[];
};

/** The Epic dialog to show: which direction, and for which Cycle. */
type Asking = { mode: 'plan' | 'unplan'; cycle: Cycle };

/**
 * Which Cycle a Ticket is planned into, in the Ticket drawer: a link to it
 * with Remove from Cycle, or, for a non-archived Ticket in none, whatever
 * its Status, a select of the Project's Prepared and Active Cycles to plan
 * it into.
 */
export const CyclePlanner: FC<CyclePlannerProps> = ({ ticket, cycles }) => {
  const selectId = useId();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState<Asking>();
  const plannable = cycles.filter((cycle) => cycle.state !== 'Archived');
  const current = plannable.find((cycle) =>
    cycle.ticketNumbers.includes(ticket.number),
  );

  const change = (action: typeof planTicket, cycleId: number) => {
    setError(undefined);
    startTransition(async () => {
      const result = await action({ cycleId, number: ticket.number });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  // An Epic's non-archived children whose membership of `cycle` is `member`,
  // as the dialog lists them: the ones planning would take along, or the ones
  // removing would.
  const dialogChildren = (cycle: Cycle, member: boolean): EpicCycleChild[] =>
    ticket.type === 'Epic'
      ? ticket.children
          .filter(
            ({ archived, number }) =>
              !archived && cycle.ticketNumbers.includes(number) === member,
          )
          .map(({ number, title, status }) => ({
            number,
            title,
            status,
            leaves: member
              ? undefined
              : (plannable.find((other) => other.ticketNumbers.includes(number))
                  ?.title ?? null),
          }))
      : [];

  const childrenOf = ({ mode, cycle }: Asking) =>
    dialogChildren(cycle, mode === 'unplan');

  const choose = (cycle: Cycle) => {
    if (dialogChildren(cycle, false).length > 0) {
      setAsking({ mode: 'plan', cycle });
    } else {
      change(planTicket, cycle.id);
    }
  };

  const remove = (cycle: Cycle) => {
    if (dialogChildren(cycle, true).length > 0) {
      setAsking({ mode: 'unplan', cycle });
    } else {
      change(unplanTicket, cycle.id);
    }
  };

  let control: ReactNode;
  if (current) {
    control = (
      <Inline gap={2} alignY="center">
        <AppLink href={cyclePath(current.projectId, current.id)}>
          {current.title}
        </AppLink>
        <Button
          type="button"
          variant="outline"
          intent="neutral"
          size="small"
          disabled={pending}
          onClick={() => remove(current)}
        >
          Remove from Cycle
        </Button>
      </Inline>
    );
  } else if (ticket.archived) {
    control = (
      <Text color="muted">Restore this Ticket to plan it into a Cycle.</Text>
    );
  } else if (plannable.length === 0) {
    control = <Text color="muted">Not planned</Text>;
  } else {
    control = (
      <>
        <Label htmlFor={selectId}>
          <VisuallyHidden>Plan into a Cycle</VisuallyHidden>
        </Label>
        <Select
          id={selectId}
          name="cycleId"
          value=""
          disabled={pending}
          onChange={(event) => {
            const picked = plannable.find(
              ({ id }) => id === Number(event.currentTarget.value),
            );
            if (picked) {
              choose(picked);
            }
          }}
        >
          <option value="">Not planned</option>
          {plannable.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>
              {cycle.title}
            </option>
          ))}
        </Select>
      </>
    );
  }

  return (
    <Stack gap={1}>
      {control}
      {error && <Alert intent="danger">{error}</Alert>}
      {asking && (
        <EpicCycleDialog
          mode={asking.mode}
          epic={{ number: ticket.number, title: ticket.title }}
          cycle={asking.cycle}
          epicChildren={childrenOf(asking)}
          onClose={() => setAsking(undefined)}
        />
      )}
    </Stack>
  );
};
