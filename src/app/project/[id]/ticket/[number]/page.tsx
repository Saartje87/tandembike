import type { Metadata } from 'next';
import type { FC } from 'react';

import { Board } from '../../../../../components/board/board';
import { TicketDrawer } from '../../../../../components/ticket-drawer/ticket-drawer';
import { loadProjectTicket, type ProjectTicketPageProps } from './ticket-data';

export async function generateMetadata({
  params,
}: ProjectTicketPageProps): Promise<Metadata> {
  const { ticket } = await loadProjectTicket(params);
  return { title: `#${ticket.number} ${ticket.title}` };
}

const TicketPage: FC<ProjectTicketPageProps> = async ({ params }) => {
  const { ticket, project, tickets } = await loadProjectTicket(params);
  return (
    <>
      <Board
        project={project}
        tickets={tickets.listTickets({
          projectId: project.id,
          includeArchived: true,
        })}
        openTicket={ticket.number}
      />
      <TicketDrawer
        ticket={ticket}
        projects={tickets.listProjects()}
        allLabels={tickets.listLabels()}
        comments={tickets.listComments(ticket.number)}
        blockers={tickets.listBlockers(ticket.number)}
      />
    </>
  );
};

export default TicketPage;
