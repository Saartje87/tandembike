import { Text } from '@blockle/blocks';
import { connection } from 'next/server';
import type { FC } from 'react';

import { appAutopilot } from '../../../../autopilot/app-autopilot';
import { outsideBlockersOf } from '../../../../components/epic-order/epic-order-layout';
import { TicketDrawer } from '../../../../components/ticket-drawer/ticket-drawer';
import { WhyHere } from '../../../../components/why-here/why-here';
import { whyHereOf } from '../../../../components/why-here/why-here-of';
import { appConversations } from '../../../../conversations/app-conversations';
import { conversationActivity } from '../../../../conversations/conversation-activity';
import { appTickets } from '../../../../tickets/app-tickets';
import { boardCycleOf, type Cycle } from '../../../../tickets/cycles';
import { epicLinkOf } from '../../../../tickets/epic-link';
import { inheritsSection, laneOf } from '../../../../tickets/ticket-lanes';
import type { EpicChild, Ticket } from '../../../../tickets/tickets';
import {
  type BoardFilter,
  boardPathOf,
  conversationOnPath,
  noBoardFilter,
  ticketByNumberPath,
  ticketOnBoardPath,
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

/**
 * "Why is this here?" for `ticket` (ADR 0044): its Board placement, from the
 * Board's own derivation, and Autopilot's answer for its Project. Null for a
 * Done Ticket.
 */
function whyHere(ticket: Ticket, projectId: number) {
  if (ticket.status === 'Done') {
    return null;
  }
  const { live } = conversationActivity(appConversations().activityRows());
  const own = live[ticket.number];
  const epicLive = ticket.epic ? live[ticket.epic.number] : undefined;
  // The section comes from the Epic's run when the child inherits it (T1143).
  const placedBy = inheritsSection(ticket, own) ? epicLive : own;
  // Only a Todo Ticket has an entry in Autopilot's answer.
  const explanation =
    ticket.status === 'Todo' ? appAutopilot().explain(projectId) : null;
  return whyHereOf({
    placement: laneOf(ticket, own, epicLive),
    hasLive: placedBy !== undefined,
    epicNumber: ticket.epic?.number ?? null,
    autopilot: explanation?.autopilot ?? { state: 'running' },
    autoTriage: explanation?.autoTriage ?? { state: 'running' },
    entry:
      explanation?.tickets.find(({ number }) => number === ticket.number) ??
      null,
  });
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
  const why = whyHere(ticket, projectId);
  const boardPath = boardPathOf(projectId, cycleId);
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
      why={
        why && (
          <WhyHere
            segments={why}
            ticketHref={ticketByNumberPath}
            conversationHref={(id) =>
              conversationOnPath(
                ticketOnBoardPath(boardPath, ticket.number, filter),
                id,
              )
            }
          />
        )
      }
      board={{
        path: boardPath,
        filter,
        onBoard: childrenOnBoard(ticket.children, cycles, cycleId),
      }}
    />
  );
};
