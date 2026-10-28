import { type FC, Suspense } from 'react';

import { Board } from '../../../../components/board/board';
import { CycleHeader } from '../../../../components/cycle-header/cycle-header';
import { CycleTicketList } from '../../../../components/cycle-ticket-list/cycle-ticket-list';
import { TicketDrawerSkeleton } from '../../../../components/ticket-drawer-skeleton/ticket-drawer-skeleton';
import { appTickets } from '../../../../tickets/app-tickets';
import type { Cycle } from '../../../../tickets/cycles';
import type { Project } from '../../../../tickets/tickets';
import {
  type BoardFilter,
  boardPathOf,
  filteredBoardPath,
  noBoardFilter,
} from '../../../lib/paths';
import { BoardTicketDrawer } from '../board-ticket-drawer/board-ticket-drawer';

export type ProjectBoardProps = {
  project: Project;
  /** The tab on screen: the Backlog, or one of the Project's Cycles. */
  tab: 'backlog' | Cycle;
  /** The Ticket `?ticket=` opens in a drawer over the Board, if any. */
  openTicket?: number;
  /** The Board filter in `?q=` and `?label=`. Defaults to none. */
  filter?: BoardFilter;
};

/**
 * One tab of a Project, under the Project's layout: its Board holding the
 * Backlog's Tickets (those in no Prepared or Active Cycle) or one Cycle's,
 * under the Cycle's header, with the Ticket `?ticket=` opens in a drawer
 * over it (ADR 0013). An Archived Cycle belongs to the History, and lists
 * its final Tickets read-only instead.
 */
export const ProjectBoard: FC<ProjectBoardProps> = ({
  project,
  tab,
  openTicket,
  filter = noBoardFilter,
}) => {
  // Closing the drawer keeps the Board filtered.
  const boardPath = filteredBoardPath(
    boardPathOf(project.id, tab === 'backlog' ? null : tab.id),
    filter,
  );
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
      <BoardTab
        project={project}
        tab={tab}
        openTicket={openTicket}
        filter={filter}
      />
      {drawer}
    </>
  );
};

/** The tab's Board, or an Archived Cycle's read-only list. */
const BoardTab: FC<ProjectBoardProps> = ({
  project,
  tab,
  openTicket,
  filter,
}) => {
  const tickets = appTickets('user');
  const cycleId = tab === 'backlog' ? null : tab.id;
  const cycles = tickets.listCycles(project.id);
  if (tab !== 'backlog' && tab.state === 'Archived') {
    // Its final membership, including Tickets moved to another Project since.
    return (
      <>
        <CycleHeader key={tab.id} cycle={tab} />
        <CycleTicketList
          cycle={tab}
          tickets={tickets.listTickets({
            cycleId: tab.id,
            includeArchived: true,
          })}
        />
      </>
    );
  }
  const shown = tickets.listTickets({
    projectId: project.id,
    cycleId,
    includeArchived: true,
  });
  return (
    <>
      {tab !== 'backlog' && (
        <CycleHeader
          key={tab.id}
          cycle={tab}
          activeCycle={cycles.find(({ state }) => state === 'Active')}
        />
      )}
      <Board
        project={project}
        tickets={shown}
        epics={tickets.listTickets({ projectId: project.id, type: 'Epic' })}
        cycleId={cycleId}
        cycles={cycles}
        openTicket={openTicket}
        filter={filter}
      />
    </>
  );
};
