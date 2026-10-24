import type { FC } from 'react';

import { TicketDrawer } from '../../../../components/ticket-drawer/ticket-drawer';
import {
  loadProjectTicket,
  type ProjectTicketPageProps,
} from '../ticket/[number]/ticket-data';

export const TicketDrawerSlot: FC<ProjectTicketPageProps> = async ({
  params,
}) => {
  const { ticket, tickets } = await loadProjectTicket(params);
  return (
    <TicketDrawer
      ticket={ticket}
      projects={tickets.listProjects()}
      allLabels={tickets.listLabels()}
      comments={tickets.listComments(ticket.number)}
      blockers={tickets.listBlockers(ticket.number)}
      closeWithBack
    />
  );
};
