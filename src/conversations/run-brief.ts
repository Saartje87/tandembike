import type { TicketType } from '../tickets/ticket-type';
import type { ConversationIntent } from './conversation-state';
import { cycleReference, type RetroCycle } from './retro-prompt';

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
  /** The Ticket's type: an Epic changes what Start means, and it never goes stale. */
  ticketType: TicketType | null;
  projectName: string;
  intent: ConversationIntent;
  /** Retro only: the Cycle it looks back on. */
  retroCycle?: RetroCycle | null;
  parallelRuns: boolean;
  /** The worktree Tandembike made for this Conversation, and what it is detached at. */
  worktree?: { path: string; base: string } | null;
  /** The Project's Check command: what a Start run must see pass before a PR. */
  checkCommand?: string | null;
  /** The Project's Agent run mode, which Setup reports (ADR 0029). */
  runMode: 'default' | 'auto';
  defaults?: NewTicketDefaults;
};

const intentLines: Record<ConversationIntent, string> = {
  start:
    'The User started this Conversation to have you do the work of the Ticket.',
  triage: 'The User started this Conversation to have you triage the Ticket.',
  ask: 'The User started this Conversation to ask you something.',
  new_ticket:
    'The User started this Conversation from a title field, to create a new Ticket together with you. Their first message is the title they typed. Create one or more Tickets, an Epic with children, or none, over the Tandembike tools, as the conversation leads.',
  setup:
    "The User started this Conversation to check that this Project's repository has what Tandembike's Agent runs rely on (Setup). Their first message asks for it.",
  retro:
    'The User started this Conversation for a retrospective (Retro) on a Cycle.',
  merge:
    'The User approved the merge of the Ticket (Approve merge) and started this Conversation to merge its pull request.',
  spec: 'The User started this Conversation to turn the Ticket, an idea or an Epic without children, into a spec and its build Tickets (Spec).',
};

/** What Setup checks (ADR 0020): fixed, and only what Tandembike relies on. */
const setupChecklist = (brief: RunBrief): string[] => {
  const items = [
    "A CLAUDE.md exists and loads the repository's instructions (it includes AGENTS.md when the instructions live there).",
    'The permission allowlist covers the Tandembike MCP tools.',
  ];
  items.push(
    `The Project's Agent run mode is ${brief.runMode}. Report it; do not suggest changing it.`,
    'Report whether a hook in the repository blocks destructive git commands (force pushes, pushes to the main branch, git reset --hard, git clean). Only report whether one exists; do not suggest a run mode.',
  );
  if (brief.parallelRuns) {
    items.push(
      "Parallel runs is on: the instructions give a convention for working in a git worktree of one's own.",
    );
  }
  return [
    'Check the repository against this checklist, and nothing else; its branch names and the rest of its process are its own:',
    ...items.map((item, index) => `${index + 1}. ${item}`),
    'Setup is advisory. For each item that is missing, offer to add it and wait for the User: every edit goes through their Allow or Deny. Work in the main checkout. Never commit, push or open a pull request: the User reviews the diff and commits it their own way.',
    'End with a summary that marks each checklist item by number as exactly one of: ok, added (uncommitted), skipped by the User, or missing.',
  ];
};

/**
 * What Tandembike tells a run (ADR 0019): only its situation. How to do the
 * work stays with the repository's own instructions. It points to the Ticket
 * by number, title and type, and never copies what the Agent reads live and
 * may change meanwhile: its Status, labels, Epic, Cycle or description.
 */
export function runBrief(brief: RunBrief): string {
  const lines = [
    `You were started by Tandembike, a ticket tracker, in a Conversation with the User about the Project "${brief.projectName}".`,
    brief.ticketNumber === null
      ? 'This Conversation is about the Project; it has no Ticket yet.'
      : `This Conversation is about Ticket T${brief.ticketNumber}, "${brief.ticketTitle}"${brief.ticketType === 'Epic' ? ', an Epic' : ''}.`,
    intentLines[brief.intent],
    'A human answers in the Tandembike UI, not in a terminal: when you need a decision, offer the choices with the AskUserQuestion tool, which shows the User a form; ask open questions in your messages.',
    `Your Agent-run ID: ${brief.conversationId}. Tandembike's tools already know it.`,
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
  if (
    brief.worktree &&
    (brief.intent === 'start' || brief.intent === 'merge')
  ) {
    lines.push(
      `You are in a git worktree Tandembike made for this Conversation at ${brief.worktree.path}, detached at ${brief.worktree.base}. Create your branch here; do not create or enter another worktree; Tandembike removes it when the Conversation closes or the Ticket is Done.`,
    );
  } else if (brief.parallelRuns && brief.intent === 'start') {
    lines.push(
      "Other runs may work in this repository at the same time. Work in a git worktree of your own, and create it before you change any file: follow the repository's own conventions for worktrees, or if it has none, use the EnterWorktree tool. Name your branch by the repository's rules. Remove your worktree before you finish, as your last step, after your work on the Ticket is merged or handed back: by the repository's conventions, or with the ExitWorktree tool if you made it with EnterWorktree (push your branch first). Tandembike gives no prompt to keep or remove it when this run ends, so remove it yourself and tell the User you did.",
    );
  }
  if (brief.intent === 'start' || brief.intent === 'merge') {
    lines.push(
      brief.checkCommand
        ? `This Project's Check command is \`${brief.checkCommand}\`. Run it and see it pass before you open a pull request.`
        : "This Project has no Check command. Follow the repository's own instructions for what must pass before you open a pull request.",
    );
  }
  if (brief.intent === 'retro' && brief.retroCycle) {
    lines.push(
      `The Cycle to look back on is ${cycleReference(brief.retroCycle)}. Read its Tickets live with find_tickets and its cycleId; Done Tickets stay with the Cycle once it is archived. File each improvement Ticket by "Feedback as Tickets" in the repository's tracker doc.`,
    );
  }
  if (brief.intent === 'setup') {
    lines.push(...setupChecklist(brief));
  }
  return lines.join('\n');
}
