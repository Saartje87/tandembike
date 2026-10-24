import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import {
  loadProjectTicket,
  type ProjectTicketPageProps,
} from '../../../ticket/[number]/ticket-data';
import { TicketDrawerSlot } from '../../../ticket-drawer-slot/ticket-drawer-slot';

export async function generateMetadata({
  params,
}: ProjectTicketPageProps): Promise<Metadata> {
  const { ticket } = await loadProjectTicket(params);
  return { title: `#${ticket.number} ${ticket.title}` };
}

const InterceptedTicketPage: FC<ProjectTicketPageProps> = ({ params }) => (
  <Suspense fallback={null}>
    <TicketDrawerSlot params={params} />
  </Suspense>
);

export default InterceptedTicketPage;
