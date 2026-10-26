import { type FC, Suspense } from 'react';

import { ArchivedProjectNotice } from '../../../../components/archived-project-notice/archived-project-notice';
import { Board } from '../../../../components/board/board';
import { CycleHeader } from '../../../../components/cycle-header/cycle-header';
import { CycleTicketList } from '../../../../components/cycle-ticket-list/cycle-ticket-list';
import { ProjectFrame } from '../../../../components/project-frame/project-frame';
import { ProjectTabs } from '../../../../components/project-tabs/project-tabs';
import { TicketDrawerSkeleton } from '../../../../components/ticket-drawer-skeleton/ticket-drawer-skeleton';
import { appTickets } from '../../../../tickets/app-tickets';
import type { Cycle } from '../../../../tickets/cycles';
import type { Project } from '../../../../tickets/tickets';
import { boardPathOf } from '../../../lib/paths';
import { BoardTicketDrawer } from '../board-ticket-drawer/board-ticket-drawer';

export type ProjectBoardProps = {
  project: Project;
  /** The tab on screen: the Backlog, or one of the Project's Cycles. */
  tab: 'backlog' | Cycle;
  /** The Ticket `?ticket=` opens in a drawer over the Board, if any. */
  openTicket?: number;
};

/**
 * One tab of a Project: its Board holding the Backlog's Tickets (those in no
 * Prepared or Active Cycle) or one Cycle's, under the Project's tabs, with
 * the Ticket `?ticket=` opens in a drawer over it (ADR 0013). An Archived
 * Cycle belongs to the History, and lists its final Tickets read-only
 * instead.
 */
export const ProjectBoard: FC<ProjectBoardProps> = ({
  project,
  tab,
  openTicket,
}) => {
  if (project.archived) {
    // Its Tickets are hidden, drawers included, until it is restored.
    return <ArchivedProjectNotice project={project} />;
  }
  const boardPath = boardPathOf(project.id, tab === 'backlog' ? null : tab.id);
  const drawer = openTicket !== undefined && (
    <Suspense
      key={openTicket}
      fallback={<TicketDrawerSkeleton boardPath={boardPath} />}
    >
      <BoardTicketDrawer
        projectId={project.id}
        number={openTicket}
        boardPath={boardPath}
      />
    </Suspense>
  );
  return (
    <>
      <BoardTab project={project} tab={tab} openTicket={openTicket} />
      {drawer}
    </>
  );
};

/** The tab's Board, or an Archived Cycle's read-only list. */
const BoardTab: FC<ProjectBoardProps> = ({ project, tab, openTicket }) => {
  const tickets = appTickets('user');
  const cycleId = tab === 'backlog' ? null : tab.id;
  const cycles = tickets.listCycles(project.id);
  if (tab !== 'backlog' && tab.state === 'Archived') {
    // Its final membership, including Tickets moved to another Project since.
    return (
      <ProjectFrame project={project} cycles={cycles}>
        <CycleHeader key={tab.id} cycle={tab} />
        <CycleTicketList
          cycle={tab}
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
      epics={tickets.listTickets({ projectId: project.id, type: 'Epic' })}
      cycleId={cycleId}
      cycles={cycles}
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
