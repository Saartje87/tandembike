import type { FC } from 'react';

import { Board } from '../../../components/board/board';
import { CycleHeader } from '../../../components/cycle-header/cycle-header';
import { ProjectTabs } from '../../../components/project-tabs/project-tabs';
import { appTickets } from '../../../tickets/app-tickets';
import type { Cycle } from '../../../tickets/cycles';
import type { Project } from '../../../tickets/tickets';

export type ProjectBoardProps = {
  project: Project;
  /** The tab on screen: the Backlog, or one of the Project's Cycles. */
  tab: 'backlog' | Cycle;
  /** The Ticket open in the drawer over the Board, if any. */
  openTicket?: number;
};

/**
 * One tab of a Project: its Board holding the Backlog's Tickets (those in no
 * Prepared or Active Cycle) or one Cycle's, under the Project's tabs.
 */
export const ProjectBoard: FC<ProjectBoardProps> = ({
  project,
  tab,
  openTicket,
}) => {
  const tickets = appTickets();
  const cycleId = tab === 'backlog' ? null : tab.id;
  return (
    <Board
      project={project}
      tickets={tickets.listTickets({
        projectId: project.id,
        cycleId,
        includeArchived: true,
      })}
      cycleId={cycleId}
      openTicket={openTicket}
      header={
        <>
          <ProjectTabs
            projectId={project.id}
            cycles={tickets.listCycles(project.id)}
            current={tab === 'backlog' ? 'backlog' : tab.id}
          />
          {tab !== 'backlog' && <CycleHeader key={tab.id} cycle={tab} />}
        </>
      }
    />
  );
};
