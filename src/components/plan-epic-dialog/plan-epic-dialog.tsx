'use client';

import {
  Alert,
  Button,
  Dialog,
  Heading,
  Inline,
  Stack,
  Text,
} from '@blockle/blocks';
import { type FC, useId, useState, useTransition } from 'react';

import { planTicket } from '../../app/cycles/actions';
import type { Cycle } from '../../tickets/cycles';
import type { EpicChild, Ticket } from '../../tickets/tickets';

/** A child the Epic would take along, and the Cycle it would leave. */
export type PlanEpicChild = Pick<EpicChild, 'number' | 'title' | 'status'> & {
  /** The title of the other open Cycle it is in now, or `null`. */
  leaves: string | null;
};

export type PlanEpicDialogProps = {
  epic: Pick<Ticket, 'number' | 'title'>;
  /** The Cycle the User picked. */
  cycle: Pick<Cycle, 'id' | 'title'>;
  /** The Epic's children that are not archived and not in `cycle` yet. */
  epicChildren: PlanEpicChild[];
  /** Called when the dialog is cancelled or the Epic has been planned. */
  onClose: () => void;
};

/**
 * Asks, before an Epic is planned into a Cycle from the Ticket drawer,
 * whether to take its live children along, all or nothing, or to plan only
 * the Epic. Rendered open; the parent unmounts it on `onClose`. A refusal is
 * shown in the dialog, which stays open.
 */
export const PlanEpicDialog: FC<PlanEpicDialogProps> = ({
  epic,
  cycle,
  epicChildren,
  onClose,
}) => {
  const [error, setError] = useState<string>();
  const [pending, startPlan] = useTransition();
  const headingId = useId();
  const descriptionId = useId();
  const count = epicChildren.length;

  const plan = (withChildren: boolean) => {
    setError(undefined);
    startPlan(async () => {
      const result = await planTicket({
        cycleId: cycle.id,
        number: epic.number,
        ...(withChildren ? { withChildren } : {}),
      });
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Dialog
      open
      onRequestClose={onClose}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
    >
      <Stack gap={4}>
        <Heading id={headingId} level={2}>
          Plan T{epic.number} into {cycle.title}?
        </Heading>
        <Text id={descriptionId} tag="p">
          Plan T{epic.number} "{epic.title}" into the Cycle "{cycle.title}" with
          its {count} {count === 1 ? 'child' : 'children'}, or on its own?
        </Text>
        <Stack
          gap={1}
          aria-label="Children"
          listStyle="none"
          role="list"
          asChild
        >
          <ul>
            {epicChildren.map(({ number, title, status, leaves }) => (
              <Text key={number} asChild>
                <li>
                  T{number} {title} ·{' '}
                  <Text
                    tag="span"
                    fontWeight={status === 'Done' ? 'normal' : 'strong'}
                  >
                    {status}
                  </Text>
                  {leaves !== null && <> · leaves "{leaves}"</>}
                </li>
              </Text>
            ))}
          </ul>
        </Stack>
        {error && <Alert intent="danger">{error}</Alert>}
        <Inline gap={2}>
          <Button type="button" disabled={pending} onClick={() => plan(true)}>
            Epic and {count} {count === 1 ? 'child' : 'children'}
          </Button>
          <Button
            type="button"
            variant="outline"
            intent="neutral"
            disabled={pending}
            onClick={() => plan(false)}
          >
            Only the Epic
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </Inline>
      </Stack>
    </Dialog>
  );
};
