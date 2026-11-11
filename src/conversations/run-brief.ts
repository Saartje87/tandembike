import { formatCost } from '../app/lib/format-cost';
import type { AgentKind } from '../tickets/agent-kind';
import type { CostUnit } from '../tickets/cost-unit';
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
  /** The Agent kind the Conversation runs on: some lines are its own (ADR 0051). */
  agentKind: AgentKind;
  /** Retro only: the Cycle it looks back on. */
  retroCycle?: RetroCycle | null;
  parallelRuns: boolean;
  /** The worktree Tandembike made for this Conversation, and what it is detached at. */
  worktree?: { path: string; base: string } | null;
  /** The Project's Check command: what a Start run must see pass before a PR. */
  checkCommand?: string | null;
  /** The Project's Agent run mode, which Setup reports (ADR 0029). */
  runMode: 'default' | 'auto';
  /** Started by Terminal: an interactive session where the User answers (ADR 0039). */
  terminal?: boolean;
  /**
   * Plan only: the Project's cost of one Start on this Conversation's Agent
   * kind, in its unit, from its Run outcomes, or null when there are too few
   * to estimate (T1248, ADR 0051).
   */
  planEstimate?: { amount: number; unit: CostUnit } | null;
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
  plan: 'The User started this Conversation to plan a Cycle toward a goal (Plan). Their first message names the goal.',
  batch_triage:
    "The User started this Conversation to triage a Board's Intake in one go (Batch triage). Their first message names the Board and the Tickets.",
  spar: "The User started this Conversation to think an idea through with you on a Spar page (Spar). Their first message gives the topic and the focus Ticket, if any. This run is read-only (ADR 0046): you may read and search the code and read Tickets, but not edit files or create or change Tickets; any command you run asks the User first. The Spar page shows a Canvas of Columns and Stickies beside the chat: read it with get_canvas and change it with edit_canvas. Below it, keep the Write-up (Decisions, Open questions, Next steps) current with update_write_up. When you agree, propose the Hand-off with propose_hand_off; only the User files it. The User's edits of it send you nothing; each of their messages ends with what they changed since your last turn. Prefer Widgets to questions in text.",
};

/**
 * The lines of the brief that name one agent's own tools and files (ADR
 * 0051), the one place they live: every other line is shared by all kinds.
 */
type AgentBriefLines = {
  /** Ends the UI note's Widget sentence: another way the agent can ask. */
  askAlso: string;
  /** A Start with Parallel runs on and no Tandembike worktree. */
  ownWorktree: string;
  /** Setup's first check: the agent loads the repository's instructions. */
  instructionsCheck: string;
};

/** The shared wording, for a kind that has no lines of its own yet (T601). */
const anyAgent: AgentBriefLines = {
  askAlso: '',
  ownWorktree:
    "Other runs may work in this repository at the same time. Work in a git worktree of your own, and create it before you change any file: follow the repository's own conventions for worktrees, or if it has none, use `git worktree add`. Name your branch by the repository's rules. Remove your worktree before you finish, as your last step, after your work on the Ticket is merged or handed back (push your branch first). Tandembike gives no prompt to keep or remove it when this run ends, so remove it yourself and tell the User you did.",
  instructionsCheck:
    'The repository has instructions this agent loads, such as AGENTS.md.',
};

const agentBriefLines: Record<AgentKind, AgentBriefLines> = {
  'claude-code': {
    askAlso: '; AskUserQuestion also works and shows as choice cards',
    ownWorktree:
      "Other runs may work in this repository at the same time. Work in a git worktree of your own, and create it before you change any file: follow the repository's own conventions for worktrees, or if it has none, use the EnterWorktree tool. Name your branch by the repository's rules. Remove your worktree before you finish, as your last step, after your work on the Ticket is merged or handed back: by the repository's conventions, or with the ExitWorktree tool if you made it with EnterWorktree (push your branch first). Tandembike gives no prompt to keep or remove it when this run ends, so remove it yourself and tell the User you did.",
    instructionsCheck:
      "A CLAUDE.md exists and loads the repository's instructions (it includes AGENTS.md when the instructions live there).",
  },
  copilot: anyAgent,
};

/** What Setup checks (ADR 0020): fixed, and only what Tandembike relies on. */
const setupChecklist = (brief: RunBrief): string[] => {
  const items = [
    agentBriefLines[brief.agentKind].instructionsCheck,
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

/** An estimate in its unit: dollars to the cent, as the brief always read. */
const estimateText = ({
  amount,
  unit,
}: {
  amount: number;
  unit: CostUnit;
}): string =>
  unit === 'usd' ? `$${amount.toFixed(2)}` : formatCost(amount, unit);

/**
 * What Tandembike tells a run (ADR 0019): only its situation. How to do the
 * work stays with the repository's own instructions. It points to the Ticket
 * by number, title and type, and never copies what the Agent reads live and
 * may change meanwhile: its Status, labels, Epic, Cycle or description.
 */
export function runBrief(brief: RunBrief): string {
  const own = agentBriefLines[brief.agentKind];
  const lines = [
    `You were started by Tandembike, a ticket tracker, in a Conversation with the User about the Project "${brief.projectName}".`,
    brief.ticketNumber === null
      ? 'This Conversation is about the Project; it has no Ticket yet.'
      : `This Conversation is about Ticket T${brief.ticketNumber}, "${brief.ticketTitle}"${brief.ticketType === 'Epic' ? ', an Epic' : ''}.`,
    intentLines[brief.intent],
    brief.terminal
      ? 'You run in an interactive terminal session, and the User is at it: they answer permission prompts and questions there. Ask them directly when you need a decision.'
      : `A human answers in the Tandembike UI, not in a terminal, and prefers clicking to typing. When you need a decision, ask it with a Widget tool, which shows the User a Widget in the chat and waits for the answer: \`ask_choice\` for choice cards (put your recommendation in \`recommended\`), \`ask_rank\` for an order, \`ask_matrix\` to place items on a 2×2 you label, and \`ask_scale\` for how much. Use a Widget instead of asking in text whenever the answer is a pick, an order, a placement or an amount${own.askAlso}. Every Widget may come back as \`{ "other": text }\` or \`{ "skipped": true }\`. Ask open questions in your messages.`,
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
  if (brief.worktree && brief.intent === 'merge') {
    lines.push(
      `You are in a git worktree Tandembike made for this Conversation at ${brief.worktree.path}, detached at ${brief.worktree.base}. It is not on the pull request's branch: the merge skill checks that branch out here. Do not create or enter another worktree; Tandembike removes it when the Conversation closes or the Ticket is Done.`,
    );
  } else if (brief.worktree && brief.intent === 'start') {
    lines.push(
      `You are in a git worktree Tandembike made for this Conversation at ${brief.worktree.path}, detached at ${brief.worktree.base}. Create your branch here; do not create or enter another worktree; Tandembike removes it when the Conversation closes or the Ticket is Done.`,
    );
  } else if (brief.parallelRuns && brief.intent === 'start') {
    lines.push(own.ownWorktree);
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
  if (brief.intent === 'plan') {
    lines.push(
      brief.planEstimate == null
        ? 'There are not enough runs to estimate what a Ticket costs, so size the Cycle by the work, not by a budget.'
        : `A Start in this Project has cost about ${estimateText(brief.planEstimate)} per Ticket, the median of its recent runs. Multiply it by the number of Tickets to size the Cycle against a budget the User names. It is an estimate, not a limit.`,
    );
  }
  if (brief.intent === 'setup') {
    lines.push(...setupChecklist(brief));
  }
  return lines.join('\n');
}
