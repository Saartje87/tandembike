import type { FC } from 'react';

import { Board } from '../../../../components/board/board';
import { CycleHeader } from '../../../../components/cycle-header/cycle-header';
import { CycleTicketList } from '../../../../components/cycle-ticket-list/cycle-ticket-list';
import { ProjectFrame } from '../../../../components/project-frame/project-frame';
import { ProjectTabs } from '../../../../components/project-tabs/project-tabs';
import { appTickets } from '../../../../tickets/app-tickets';
import type { Cycle } from '../../../../tickets/cycles';
import type { Project } from '../../../../tickets/tickets';

export type ProjectBoardProps = {
  project: Project;
  /** The tab on screen: the Backlog, or one of the Project's Cycles. */
  tab: 'backlog' | Cycle;
  /** The Ticket open in the drawer over the Board, if any. */
  openTicket?: number;
};

/**
 * One tab of a Project: its Board holding the Backlog's Tickets (those in no
 * Prepared or Active Cycle) or one Cycle's, under the Project's tabs. An
 * Archived Cycle belongs to the History, and lists its final Tickets
 * read-only instead.
 */
export const ProjectBoard: FC<ProjectBoardProps> = ({
  project,
  tab,
  openTicket,
}) => {
  const tickets = appTickets();
  const cycleId = tab === 'backlog' ? null : tab.id;
  const cycles = tickets.listCycles(project.id);
  if (tab !== 'backlog' && tab.state === 'Archived') {
    // Its final membership, including Tickets moved to another Project since.
    return (
      <ProjectFrame project={project} cycles={cycles}>
        <CycleHeader key={tab.id} cycle={tab} />
        <CycleTicketList
          tickets={tickets.listTickets({
            cycleId: tab.id,
            includeArchived: true,
          })}
        />
      </ProjectFrame>
    );
  }
  const shown = tickets.listTickets({
    projectId: project.id,
    cycleId,
    includeArchived: true,
  });
  return (
    <Board
      project={project}
      tickets={shown}
      cycleId={cycleId}
      openTicket={openTicket}
      header={
        <>
          <ProjectTabs
            projectId={project.id}
            cycles={cycles}
            current={tab === 'backlog' ? 'backlog' : tab.id}
          />
          {tab !== 'backlog' && (
            <CycleHeader
              key={tab.id}
              cycle={tab}
              activeCycle={cycles.find(({ state }) => state === 'Active')}
            />
          )}
        </>
      }
    />
  );
};
