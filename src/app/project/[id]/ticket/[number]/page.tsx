import type { Metadata } from 'next';
import type { FC } from 'react';

import { TicketDrawer } from '../../../../../components/ticket-drawer/ticket-drawer';
import { openCycleOf } from '../../../../../tickets/cycles';
import { cyclePath, projectPath } from '../../../../lib/paths';
import { ProjectBoard } from '../../project-board/project-board';
import { loadProjectTicket, type ProjectTicketPageProps } from './ticket-data';

export async function generateMetadata({
  params,
}: ProjectTicketPageProps): Promise<Metadata> {
  const { ticket } = await loadProjectTicket(params);
  return { title: `#${ticket.number} ${ticket.title}` };
}

/** A Ticket in its drawer over its tab: its Cycle's, or the Backlog. */
const TicketPage: FC<ProjectTicketPageProps> = async ({ params }) => {
  const { ticket, project, tickets, epicClaim } =
    await loadProjectTicket(params);
  const cycles = tickets.listCycles(project.id);
  const cycle = openCycleOf(cycles, ticket.number);
  return (
    <>
      <ProjectBoard
        project={project}
        tab={cycle ?? 'backlog'}
        openTicket={ticket.number}
      />
      <TicketDrawer
        ticket={ticket}
        projects={tickets.listProjects()}
        allLabels={tickets.listLabels()}
        comments={tickets.listComments(ticket.number)}
        blockers={tickets.listBlockers(ticket.number)}
        cycles={cycles}
        epicClaim={epicClaim}
        boardPath={
          cycle ? cyclePath(project.id, cycle.id) : projectPath(project.id)
        }
      />
    </>
  );
};

export default TicketPage;
