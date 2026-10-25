import { connection } from 'next/server';
import type { FC } from 'react';

import { TicketDrawer } from '../../../../components/ticket-drawer/ticket-drawer';
import { appTickets } from '../../../../tickets/app-tickets';
import { findBoardTicket } from '../project-data';

export type BoardTicketDrawerProps = {
  /** The Project whose Board it opens over. */
  projectId: number;
  number: number;
  /** The Board's own URL, without `?ticket=`: where closing goes. */
  boardPath: string;
};

/**
 * The drawer of the Ticket a Board's `?ticket=` parameter opens (ADR 0013),
 * streamed after the Board so the Board stays put while it loads.
 * It renders nothing for a Ticket that does not exist, such as one just
 * deleted, or that belongs to another Project: the Board shows on its own.
 */
export const BoardTicketDrawer: FC<BoardTicketDrawerProps> = async ({
  projectId,
  number,
  boardPath,
}) => {
  // Request-time data, so it streams after the Board inside its Suspense.
  await connection();
  const ticket = findBoardTicket(projectId, number);
  if (ticket === null) {
    return null;
  }
  const tickets = appTickets();
  return (
    <TicketDrawer
      ticket={ticket}
      projects={tickets.listProjects()}
      allLabels={tickets.listLabels()}
      comments={tickets.listComments(ticket.number)}
      blockers={tickets.listBlockers(ticket.number)}
      cycles={tickets.listCycles(ticket.projectId)}
      epics={tickets
        .listTickets({ projectId: ticket.projectId, type: 'Epic' })
        .map(({ number, title }) => ({ number, title }))}
      epicClaim={
        ticket.epic === null
          ? null
          : tickets.getTicket(ticket.epic.number).claim
      }
      epicChildren={ticket.children.map((child) => ({
        number: child.number,
        title: child.title,
        claim: tickets.getTicket(child.number).claim,
        blocks: tickets.listBlockers(child.number).blocks,
      }))}
      boardPath={boardPath}
    />
  );
};
