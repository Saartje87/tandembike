import { redirect } from 'next/navigation';
import type { FC } from 'react';

import { appTickets } from '../../../tickets/app-tickets';
import { openCycleOf } from '../../../tickets/cycles';
import { cyclePath, projectPath, ticketOnBoardPath } from '../../lib/paths';
import { loadTicketByNumber } from './ticket-data';

type TicketByNumberPageProps = {
  params: Promise<{ number: string }>;
};

/**
 * Opens a Ticket by number alone over its own Board: its open Cycle's, or
 * the Backlog (ADR 0013). Every link to another Ticket goes through here, so
 * it resolves the Board when followed.
 */
const TicketByNumberPage: FC<TicketByNumberPageProps> = async ({ params }) => {
  const ticket = await loadTicketByNumber((await params).number);
  const cycle = openCycleOf(
    appTickets().listCycles(ticket.projectId),
    ticket.number,
  );
  redirect(
    ticketOnBoardPath(
      cycle
        ? cyclePath(ticket.projectId, cycle.id)
        : projectPath(ticket.projectId),
      ticket.number,
    ),
  );
};

export default TicketByNumberPage;
