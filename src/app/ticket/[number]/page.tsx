import { redirect } from 'next/navigation';
import type { FC } from 'react';

import { ticketPath } from '../../lib/paths';
import { loadTicketByNumber } from '../../project/[id]/ticket/[number]/ticket-data';

type TicketByNumberPageProps = {
  params: Promise<{ number: string }>;
};

/** A number-only link, as Blockers use, sends the User to the Ticket's page. */
const TicketByNumberPage: FC<TicketByNumberPageProps> = async ({ params }) => {
  const ticket = await loadTicketByNumber((await params).number);
  redirect(ticketPath(ticket.projectId, ticket.number));
};

export default TicketByNumberPage;
