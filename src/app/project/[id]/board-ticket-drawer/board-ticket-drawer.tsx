import { Text } from '@blockle/blocks';
import { connection } from 'next/server';
import type { FC } from 'react';

import { TicketDrawer } from '../../../../components/ticket-drawer/ticket-drawer';
import { appConversations } from '../../../../conversations/app-conversations';
import { appTickets } from '../../../../tickets/app-tickets';
import { boardCycleOf } from '../../../../tickets/cycles';
import { epicLinkOf } from '../../../../tickets/epic-link';
import {
  type BoardFilter,
  boardPathOf,
  noBoardFilter,
} from '../../../lib/paths';
import { findBoardTicket } from '../project-data';

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
        blocks: tickets.listBlockers(child.number).blocks,
      }))}
      referenceTemplates={tickets.listReferenceTemplates(ticket.projectId)}
      conversations={conversations.list({ ticketNumber: ticket.number })}
      agentCommands={tickets.getProjectAgentCommands(ticket.projectId)}
      board={{
        path: boardPathOf(projectId, cycleId),
        filter,
        onBoard: ticket.children
          .filter(
            (child) => (boardCycleOf(cycles, child)?.id ?? null) === cycleId,
          )
          .map((child) => child.number),
      }}
    />
  );
};
