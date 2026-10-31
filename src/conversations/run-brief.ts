import type { TicketType } from '../tickets/ticket-type';
import type { ConversationIntent } from './conversation-state';

/** Where a New Ticket Conversation's title field was: defaults for the Agent. */
export type NewTicketDefaults = {
  cycleId?: number | null;
  epicNumber?: number | null;
  type?: TicketType | null;
};

export type RunBrief = {
  conversationId: number;
  ticketNumber: number | null;
  ticketTitle: string | null;
  projectName: string;
  intent: ConversationIntent;
  parallelRuns: boolean;
  defaults?: NewTicketDefaults;
};

const intentLines: Record<ConversationIntent, string> = {
  start:
    'The User started this Conversation to have you do the work of the Ticket.',
  triage: 'The User started this Conversation to have you triage the Ticket.',
  ask: 'The User started this Conversation to ask you something.',
  new_ticket:
    'The User started this Conversation from a title field, to create a new Ticket together with you. Their first message is the title they typed. Create one or more Tickets, an Epic with children, or none, over the Tandembike tools, as the conversation leads.',
};

/**
 * What Tandembike tells a run (ADR 0019): only its situation. How to do the
 * work stays with the repository's own instructions.
 */
export function runBrief(brief: RunBrief): string {
  const lines = [
    `You were started by Tandembike, a ticket tracker, in a Conversation with the User about the Project "${brief.projectName}".`,
    brief.ticketNumber === null
      ? 'This Conversation is about the Project; it has no Ticket yet.'
      : `This Conversation is about Ticket T${brief.ticketNumber}, "${brief.ticketTitle}".`,
    intentLines[brief.intent],
    'A human answers in the Tandembike UI, not in a terminal: when you need a decision, offer the choices with the AskUserQuestion tool, which shows the User a form; ask open questions in your messages.',
    `Your Agent-run ID: ${brief.conversationId}. Use it when you claim a Ticket with the Tandembike tools.`,
  ];
  const { cycleId, epicNumber, type } = brief.defaults ?? {};
  if (brief.intent === 'new_ticket') {
    const fields = [
      cycleId == null ? null : `Cycle ${cycleId}`,
      epicNumber == null ? null : `Epic T${epicNumber}`,
      type == null ? null : `type ${type}`,
    ].filter((field) => field !== null);
    if (fields.length > 0) {
      lines.push(
        `Defaults from the title field, unless this Conversation leads elsewhere: ${fields.join(', ')}.`,
      );
    }
  }
  if (brief.parallelRuns && brief.intent === 'start') {
    lines.push(
      "Other runs may work in this repository at the same time. Work in a git worktree of your own, and create it before you change any file: follow the repository's own conventions for worktrees, or if it has none, use the EnterWorktree tool. Name your branch by the repository's rules.",
    );
  }
  return lines.join('\n');
}
