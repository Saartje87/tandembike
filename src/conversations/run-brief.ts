import type { ConversationIntent } from './conversation-state';

export type RunBrief = {
  conversationId: number;
  ticketNumber: number | null;
  ticketTitle: string | null;
  projectName: string;
  intent: ConversationIntent;
  parallelRuns: boolean;
};

const intentLines: Record<ConversationIntent, string> = {
  start:
    'The User started this Conversation to have you do the work of the Ticket.',
  triage: 'The User started this Conversation to have you triage the Ticket.',
  ask: 'The User started this Conversation to ask you something.',
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
    'A human answers in the Tandembike UI, not in a terminal: ask your questions in your messages.',
    `Your Agent-run ID: ${brief.conversationId}. Use it when you claim a Ticket with the Tandembike tools.`,
  ];
  if (brief.parallelRuns && brief.intent === 'start') {
    lines.push(
      "Other runs may work in this repository at the same time. Work in a git worktree of your own, and create it before you change any file: follow the repository's own conventions for worktrees, or if it has none, use the EnterWorktree tool. Name your branch by the repository's rules.",
    );
  }
  return lines.join('\n');
}
