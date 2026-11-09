import { Text } from '@blockle/blocks';
import { connection } from 'next/server';
import type { FC } from 'react';

import { outsideBlockersOf } from '../../../../components/epic-order/epic-order-layout';
import { TicketDrawer } from '../../../../components/ticket-drawer/ticket-drawer';
import { appConversations } from '../../../../conversations/app-conversations';
import { appTickets } from '../../../../tickets/app-tickets';
import { boardCycleOf, type Cycle } from '../../../../tickets/cycles';
import { epicLinkOf } from '../../../../tickets/epic-link';
import type { EpicChild } from '../../../../tickets/tickets';
import {
  type BoardFilter,
  boardPathOf,
  noBoardFilter,
} from '../../../lib/paths';
import { findBoardTicket } from '../project-data';

/**
 * The numbers of `children` that show on Cycle `cycleId`'s Board, or the
 * Backlog's for `null`, by `boardCycleOf`. An archived one counts too: the
 * Board lists its archived Tickets.
 */
function childrenOnBoard(
  children: EpicChild[],
  cycles: Cycle[],
  cycleId: number | null,
): number[] {
  return children
    .filter((child) => (boardCycleOf(cycles, child)?.id ?? null) === cycleId)
    .map((child) => child.number);
}

export type BoardTicketDrawerProps = {
  /** The Project whose Board it opens over. */
  projectId: number;
  /** The Cycle whose Board it opens over, or `null` for the Backlog's. */
  cycleId: number | null;
  /** The Board's filter. Defaults to none. */
  filter?: BoardFilter;
  number: number;
};

/**
 * The contents of the drawer of the Ticket a Board's `?ticket=` parameter
 * opens (ADR 0013), streamed into its `TicketDrawerShell` after the Board so
 * the Board and the drawer stay put while it loads. A Ticket that does not
 * exist, such as one just deleted, or that belongs to another Project, is
 * not found. An Epic's drawer opens its children on this Board over it.
 */
export const BoardTicketDrawer: FC<BoardTicketDrawerProps> = async ({
  projectId,
  cycleId,
  filter = noBoardFilter,
  number,
}) => {
  // Request-time data, so it streams after the Board inside its Suspense.
  await connection();
  const ticket = findBoardTicket(projectId, number);
  if (ticket === null) {
    return <Text tag="p">{`Ticket T${number} not found`}</Text>;
  }
  const tickets = appTickets('user');
  const conversations = appConversations();
  const cycles = tickets.listCycles(ticket.projectId);
  const childBlockers = new Map(
    ticket.children.map((child) => [
      child.number,
      tickets.listBlockers(child.number),
    ]),
  );
  const blockersOf = (number: number) =>
    childBlockers.get(number) ?? { blockedBy: [], blocks: [] };
  return (
    <TicketDrawer
      ticket={ticket}
      allLabels={tickets.listLabels()}
      comments={tickets.listComments(ticket.number)}
      activity={tickets.listActivity(ticket.number)}
      blockers={tickets.listBlockers(ticket.number)}
      cycles={cycles}
      epics={tickets
        .listTickets({ projectId: ticket.projectId, type: 'Epic' })
        .map(epicLinkOf)}
      epicClaim={
        ticket.epic === null
          ? null
          : tickets.getTicket(ticket.epic.number).claim
      }
      epicChildren={ticket.children.map((child) => ({
        number: child.number,
        title: child.title,
        claim: tickets.getTicket(child.number).claim,
        blocks: blockersOf(child.number).blocks,
      }))}
      outsideBlockers={outsideBlockersOf(
        ticket.children,
        (number) => blockersOf(number).blockedBy,
      )}
      referenceTemplates={tickets.listReferenceTemplates(ticket.projectId)}
      conversations={conversations.list({ ticketNumber: ticket.number })}
      agentCommands={tickets.getProjectAgentCommands(ticket.projectId)}
      triageProposal={tickets.pendingTriage(ticket.number)}
      board={{
        path: boardPathOf(projectId, cycleId),
        filter,
        onBoard: childrenOnBoard(ticket.children, cycles, cycleId),
      }}
    />
  );
};
