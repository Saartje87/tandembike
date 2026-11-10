import { Inline } from '@blockle/blocks';
import type { FC } from 'react';

import { Cockpit } from '../../../../components/cockpit/cockpit';
import { CycleCompleteBanner } from '../../../../components/cycle-complete-banner/cycle-complete-banner';
import { CycleHeader } from '../../../../components/cycle-header/cycle-header';
import { CycleTicketList } from '../../../../components/cycle-ticket-list/cycle-ticket-list';
import { PlanButton } from '../../../../components/plan-button/plan-button';
import { ProjectAgentProvider } from '../../../../components/project-agent/project-agent';
import { SparButton } from '../../../../components/spar-button/spar-button';
import { TicketDrawerShell } from '../../../../components/ticket-drawer-shell/ticket-drawer-shell';
import { TriageSpend } from '../../../../components/triage-spend/triage-spend';
import { appConversations } from '../../../../conversations/app-conversations';
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
import {
  autopilotOf,
  cycleEstimate,
  cycleTicketsWithEpics,
  runSlotsOf,
} from '../project-data';

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
  const settings = appTickets('user').getProjectAgentSettings(project.id);
  const cycleId = tab === 'backlog' ? null : tab.id;
  // Closing the drawer keeps the Board filtered.
  const boardPath = filteredBoardPath(boardPathOf(project.id, cycleId), filter);
  // One drawer for every Ticket opened over this tab, so it slides in once
  // and only its contents stream in (T333).
  const drawer = openTicket !== undefined && (
    <TicketDrawerShell number={openTicket} boardPath={boardPath}>
      <BoardTicketDrawer
        projectId={project.id}
        cycleId={cycleId}
        filter={filter}
        number={openTicket}
      />
    </TicketDrawerShell>
  );
  const board = (
    <>
      {tab === 'backlog' && settings.repositoryPath !== null && (
        <Inline gap={2} alignY="start">
          <PlanButton projectId={project.id} />
          <SparButton projectId={project.id} />
        </Inline>
      )}
      <BoardTab
        project={project}
        tab={tab}
        openTicket={openTicket}
        filter={filter}
      />
      {drawer}
    </>
  );
  // With a repository path the title fields may create through an Agent.
  return settings.repositoryPath === null ? (
    board
  ) : (
    <ProjectAgentProvider mode={settings.agentMode ? 'default' : 'optional'}>
      {board}
    </ProjectAgentProvider>
  );
};

/** The tab's Board, or an Archived Cycle's read-only list. */
const BoardTab: FC<ProjectBoardProps> = ({ project, tab, filter }) => {
  const tickets = appTickets('user');
  const cycleId = tab === 'backlog' ? null : tab.id;
  const cycles = tickets.listCycles(project.id);
  if (tab !== 'backlog' && tab.state === 'Archived') {
    // Its final membership, including Tickets moved to another Project since.
    return (
      <>
        <CycleHeader
          key={tab.id}
          cycle={tab}
          retro={appConversations().retroOf(tab.id)}
        />
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
  const archived = tickets
    .listTickets({ projectId: project.id, cycleId, includeArchived: true })
    .filter((ticket) => ticket.archived);
  const epics = tickets.listTickets({ projectId: project.id, type: 'Epic' });
  // What every Board gets alike.
  const shared = {
    projectId: project.id,
    archived,
    cycles,
    epics,
    filter,
    proposedTriage: tickets.pendingTriageNumbers(project.id),
  };
  if (tab === 'backlog') {
    // The Backlog is the whole scope of its Board: no progress, no runs.
    const budget = appConversations().triageBudget(project.id);
    return (
      <>
        {budget && <TriageSpend {...budget} />}
        <Cockpit
          {...shared}
          cycle={null}
          tickets={tickets.listTickets({
            projectId: project.id,
            cycleId: null,
          })}
          planning
        />
      </>
    );
  }
  if (tab.state === 'Active') {
    // The Active Cycle's Board is one column, by what needs the User.
    return (
      <>
        <CycleHeader key={tab.id} cycle={tab} />
        {tickets.isCycleComplete(tab.id) && (
          <CycleCompleteBanner
            key={tab.id}
            cycle={tab}
            retro={appConversations().retroOf(tab.id)}
          />
        )}
        <Cockpit
          {...shared}
          cycle={tab}
          tickets={cycleTicketsWithEpics(project.id, tab.id)}
          runSlots={runSlotsOf(project.id)}
          autopilot={autopilotOf(project.id, tab.id)}
        />
      </>
    );
  }
  // A Prepared Cycle plans its Tickets: progress and Start Cycle, no runs.
  return (
    <>
      <CycleHeader
        key={tab.id}
        cycle={tab}
        activeCycle={tickets.activeCycle(project.id) ?? undefined}
        estimate={cycleEstimate(project.id, tab.id)}
      />
      <Cockpit
        {...shared}
        cycle={tab}
        tickets={cycleTicketsWithEpics(project.id, tab.id)}
        planning
      />
    </>
  );
};
