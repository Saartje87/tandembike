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

import { planTicket, unplanTicket } from '../../app/cycles/actions';
import { callAction } from '../../app/lib/call-action';
import type { Cycle } from '../../tickets/cycles';
import type { EpicChild, Ticket } from '../../tickets/tickets';

/** A child the Epic would take along, and the Cycle it would leave. */
export type EpicCycleChild = Pick<EpicChild, 'number' | 'title' | 'status'> & {
  /**
   * When planning, the title of the other open Cycle it is in now, or
   * `null`. Left out when removing.
   */
  leaves?: string | null;
};

export type EpicCycleDialogProps = {
  /**
   * Whether the Epic is being planned into `cycle` (the default) or removed
   * from it. Removal lists the children in `cycle` and shows no `leaves`.
   */
  mode?: 'plan' | 'unplan';
  epic: Pick<Ticket, 'number' | 'title'>;
  /** The Cycle the User picked. */
  cycle: Pick<Cycle, 'id' | 'title'>;
  /**
   * The Epic's children that are not archived: those not in `cycle` yet when
   * planning, those in it when removing.
   */
  epicChildren: EpicCycleChild[];
  /** Called when the dialog is cancelled or the Epic has been planned or removed. */
  onClose: () => void;
};

const copy = {
  plan: {
    heading: (epic: number, cycle: string) => `Plan T${epic} into ${cycle}?`,
    description: (epic: number, title: string, cycle: string) =>
      `Plan T${epic} "${title}" into the Cycle "${cycle}"`,
    action: planTicket,
    failed: 'The Epic could not be planned. Try again.',
  },
  unplan: {
    heading: (epic: number, cycle: string) => `Remove T${epic} from ${cycle}?`,
    description: (epic: number, title: string, cycle: string) =>
      `Remove T${epic} "${title}" from the Cycle "${cycle}"`,
    action: unplanTicket,
    failed: 'The Epic could not be taken out of the Cycle. Try again.',
  },
};

/**
 * Asks, before an Epic is planned into or removed from a Cycle in the Ticket
 * drawer, whether to take its live children along, all or nothing, or to
 * change only the Epic. Rendered open; the parent unmounts it on `onClose`.
 * A refusal is shown in the dialog, which stays open.
 */
export const EpicCycleDialog: FC<EpicCycleDialogProps> = ({
  mode = 'plan',
  epic,
  cycle,
  epicChildren,
  onClose,
}) => {
  const [error, setError] = useState<string>();
  const [pending, startConfirm] = useTransition();
  const headingId = useId();
  const descriptionId = useId();
  const count = epicChildren.length;

  const confirm = (withChildren: boolean) => {
    setError(undefined);
    startConfirm(async () => {
      const result = await callAction(
        () =>
          copy[mode].action({
            cycleId: cycle.id,
            number: epic.number,
            withChildren,
          }),
        copy[mode].failed,
      );
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
          {copy[mode].heading(epic.number, cycle.title)}
        </Heading>
        <Text id={descriptionId} tag="p">
          {copy[mode].description(epic.number, epic.title, cycle.title)} with
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
                  {leaves != null && <> · leaves "{leaves}"</>}
                </li>
              </Text>
            ))}
          </ul>
        </Stack>
        {error && <Alert intent="danger">{error}</Alert>}
        <Inline gap={2}>
          <Button
            type="button"
            disabled={pending}
            onClick={() => confirm(true)}
          >
            Epic and {count} {count === 1 ? 'child' : 'children'}
          </Button>
          <Button
            type="button"
            variant="outline"
            intent="neutral"
            disabled={pending}
            onClick={() => confirm(false)}
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
