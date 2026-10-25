import type { FC } from 'react';

import { TicketDrawer } from '../../../../components/ticket-drawer/ticket-drawer';
import {
  findProjectTicket,
  type ProjectTicketPageProps,
} from '../ticket/[number]/ticket-data';

export const TicketDrawerSlot: FC<ProjectTicketPageProps> = async ({
  params,
}) => {
  // On the redirect after deleting from this drawer, Next keeps the slot's
  // last state: render nothing rather than a not-found for the whole page.
  const found = await findProjectTicket(params);
  if (found === null) {
    return null;
  }
  const { ticket, tickets, epicClaim } = found;
  return (
    <TicketDrawer
      ticket={ticket}
      projects={tickets.listProjects()}
      allLabels={tickets.listLabels()}
      comments={tickets.listComments(ticket.number)}
      blockers={tickets.listBlockers(ticket.number)}
      cycles={tickets.listCycles(ticket.projectId)}
      epicClaim={epicClaim}
      closeWithBack
    />
  );
};
