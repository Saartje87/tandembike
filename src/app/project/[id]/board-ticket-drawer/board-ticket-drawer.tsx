import { Text } from '@blockle/blocks';
import { connection } from 'next/server';
import type { FC } from 'react';

import { TicketDrawer } from '../../../../components/ticket-drawer/ticket-drawer';
import { appConversations } from '../../../../conversations/app-conversations';
import { appTickets } from '../../../../tickets/app-tickets';
import { epicLinkOf } from '../../../../tickets/tickets';
import { findBoardTicket } from '../project-data';

export type BoardTicketDrawerProps = {
  /** The Project whose Board it opens over. */
  projectId: number;
  number: number;
};

/**
 * The contents of the drawer of the Ticket a Board's `?ticket=` parameter
 * opens (ADR 0013), streamed into its `TicketDrawerShell` after the Board so
 * the Board and the drawer stay put while it loads. A Ticket that does not
 * exist, such as one just deleted, or that belongs to another Project, is
 * not found.
 */
export const BoardTicketDrawer: FC<BoardTicketDrawerProps> = async ({
  projectId,
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
  return (
    <TicketDrawer
      ticket={ticket}
      allLabels={tickets.listLabels()}
      comments={tickets.listComments(ticket.number)}
      activity={tickets.listActivity(ticket.number)}
      blockers={tickets.listBlockers(ticket.number)}
      cycles={tickets.listCycles(ticket.projectId)}
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
      conversations={conversations
        .list({ ticketNumber: ticket.number })
        .map((conversation) => ({
          conversation,
          transcript: conversations.transcript(conversation.id),
        }))}
    />
  );
};
