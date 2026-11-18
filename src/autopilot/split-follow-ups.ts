import type { Conversations, SplitReply } from '../conversations/conversations';
import type { ChangeChannel } from '../tickets/changes';
import type { Tickets } from '../tickets/tickets';

export type SplitFollowUpsDeps = {
  /** Where the follow-up is looked for and the note is added. */
  tickets: Tickets;
  /** Where the Split replies are read and their follow-up recorded. */
  conversations: Conversations;
  changes: ChangeChannel;
};

/**
 * Checks Auto-reply's Splits (ADR 0054): once the Start run that was asked
 * to file a follow-up no longer works, it looks for a Ticket with the Start's
 * Ticket as Origin, filed after the answer. It records the follow-up filed,
 * or missing with a note on the Ticket, which the `split_follow_up` Notice
 * then tells the User. Autopilot writes no Ticket, so this lives apart.
 */
export function createSplitFollowUps({
  tickets,
  conversations,
  changes,
}: SplitFollowUpsDeps) {
  /** Whether a Ticket with `reply`'s Ticket as Origin was filed at or after the answer. */
  const filed = (reply: SplitReply): boolean =>
    tickets
      .getTicket(reply.ticketNumber)
      .splitOff.some(
        ({ number }) => tickets.getTicket(number).createdAt >= reply.at,
      );

  const check = () => {
    for (const reply of conversations.splitRepliesAwaitingFollowUp()) {
      if (reply.working) {
        continue;
      }
      try {
        if (filed(reply)) {
          conversations.setSplitFollowUp(reply.entryId, 'filed');
          continue;
        }
        conversations.setSplitFollowUp(reply.entryId, 'missing');
        const question = conversations
          .transcript(reply.conversationId)
          .find((entry) => entry.id === reply.entryId)?.widget?.widget.prompt;
        tickets.addComment(reply.ticketNumber, {
          author: 'agent',
          body: `Auto-reply split off a question of the Start run, asking it to file a follow-up with this Ticket as Origin, but the run ended without filing one. File it yourself if the matter still needs doing:${question ? `\n\n> ${question}` : ''}`,
        });
      } catch (error) {
        console.error(
          `The Split follow-up of T${reply.ticketNumber} could not be checked`,
          error,
        );
      }
    }
  };

  return {
    /** Checks on every change; returns a function that stops listening. */
    start(): () => void {
      return changes.subscribe((change) => {
        if (change.type !== 'notice') {
          check();
        }
      });
    },
  };
}

export type SplitFollowUps = ReturnType<typeof createSplitFollowUps>;
