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
import { type FC, useId, useOptimistic, useState, useTransition } from 'react';

import type { ActionResult } from '../../app/lib/action-result';
import { ticketByNumberPath } from '../../app/lib/paths';
import {
  attachTicketToEpic,
  detachTicketFromEpic,
} from '../../app/tickets/actions';
import type { EpicLink, Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { keepDrawerOpen } from '../keep-drawer-open/keep-drawer-open';

export type TicketEpicProps = {
  ticket: Pick<Ticket, 'number' | 'projectId' | 'epic'>;
  /** The live Epics of the Ticket's Project, to pick from. Defaults to none. */
  epics?: EpicLink[];
};

/**
 * Which Epic a normal Ticket is a child of, in the Ticket drawer: a link to
 * it with Detach from Epic, or None, and a picker of the Project's other
 * Epics to attach it to or move it to. A change shows at once.
 */
export const TicketEpic: FC<TicketEpicProps> = ({ ticket, epics = [] }) => {
  const [epic, showEpic] = useOptimistic(ticket.epic);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const pickerId = useId();
  const choices = epics.filter((choice) => choice.number !== epic?.number);
  const pickerName = epic ? 'Move to another Epic' : 'Attach to Epic';

  const change = (
    shown: EpicLink | null,
    save: () => Promise<ActionResult>,
  ) => {
    setError(undefined);
    startTransition(async () => {
      showEpic(shown);
      const result = await save();
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  const attach = (number: number) => {
    const picked = epics.find((choice) => choice.number === number);
    if (picked) {
      change(picked, () =>
        attachTicketToEpic({ epic: number, child: ticket.number }),
      );
    }
  };

  return (
    <Stack gap={1}>
      {epic ? (
        <Inline gap={2} alignY="center" flexWrap="wrap">
          <AppLink href={ticketByNumberPath(epic.number)}>
            T{epic.number} {epic.title}
          </AppLink>
          <Button
            type="button"
            variant="outline"
            intent="neutral"
            size="small"
            disabled={pending}
            onClick={(event) => {
              keepDrawerOpen(event);
              change(null, () =>
                detachTicketFromEpic({ number: ticket.number }),
              );
            }}
          >
            Detach from Epic
          </Button>
        </Inline>
      ) : (
        <Text color="muted">None</Text>
      )}
      {choices.length > 0 && (
        <>
          <Label htmlFor={pickerId}>
            <VisuallyHidden>{pickerName}</VisuallyHidden>
          </Label>
          <Select
            id={pickerId}
            name="epic"
            value=""
            disabled={pending}
            onChange={(event) => attach(Number(event.currentTarget.value))}
          >
            <option value="">{pickerName}…</option>
            {choices.map((choice) => (
              <option key={choice.number} value={choice.number}>
                T{choice.number} {choice.title}
              </option>
            ))}
          </Select>
        </>
      )}
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
