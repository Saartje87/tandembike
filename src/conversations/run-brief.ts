import { formatCost } from '../app/lib/format-cost';
import type { AgentKind } from '../tickets/agent-kind';
import type { CostUnit } from '../tickets/cost-unit';
import type { TicketType } from '../tickets/ticket-type';
import {
  type ConversationIntent,
  isJudgmentIntent,
} from './conversation-state';
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
  /**
   * The worktree Tandembike made for this Conversation and what it starts
   * from: on the Ticket's own branch for a Start on a Ticket (ADR 0032),
   * else detached there.
   */
  worktree?: { path: string; base: string; onTicketBranch?: boolean } | null;
  /** The Project's Check command: what a Start run must see pass before a PR. */
  checkCommand?: string | null;
  /**
   * Setup only: the Project's stored Agent commands, each with the
   * Playbook's command for its Stage, which the override replaces.
   */
  agentCommandOverrides?: {
    label: string;
    command: string;
    playbook: string;
  }[];
  /** Setup only: the default branch Tandembike found in the repository. */
  defaultBranch?: string | null;
  /** Setup only: the Check commands Tandembike detected in the repository, best first. */
  checkCommandSuggestions?: string[];
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
  overlap_planning:
    'Autopilot started this Conversation for Overlap planning (ADR 0054): find which of the Active Cycle Tickets its first message lists would touch the same code if they ran at the same time, and add a Blocker between each such pair with add_overlap_blocker, the Ticket higher on the Board first. Its first message lists the Tickets in Board order.',
  auto_reply:
    "Autopilot started this Conversation to Auto-reply (ADR 0054): answer one Widget question that a Start run asked the User, by the defaults and the Project's Reply rules in its first message, with reply_to_question.",
  spar: "The User started this Conversation to think an idea through with you on a Spar page (Spar). Their first message gives the topic and the focus Ticket, if any. This run is read-only (ADR 0046): you may read and search the code and read Tickets, but not edit files or create or change Tickets; any command you run asks the User first. The Spar page shows a Canvas of Columns and Stickies beside the chat: read it with get_canvas and change it with edit_canvas. Below it, keep the Write-up (Decisions, Open questions, Next steps) current with update_write_up. When you agree, propose the Hand-off with propose_hand_off; only the User files it. The User's edits of it send you nothing; each of their messages ends with what they changed since your last turn. Prefer Widgets to questions in text.",
};

/**
 * The lines of the brief that name one agent's own tools and files (ADR
 * 0051), the one place they live: every other line is shared by all kinds.
 */
type AgentBriefLines = {
  /** Ends the UI note's Widget sentence: another way the agent can ask. */
  askAlso: string;
  /** Setup's first check: the agent loads the repository's instructions. */
  instructionsCheck: string;
  /** The instructions file Setup offers as a skeleton: the one the agent loads. */
  instructionsFile: string;
  /** Setup's check that the agent's own allowlist covers the Tandembike tools, if it has one. */
  allowlistCheck: string | null;
};

const agentBriefLines: Record<AgentKind, AgentBriefLines> = {
  'claude-code': {
    askAlso: '; AskUserQuestion also works and shows as choice cards',
    instructionsCheck:
      "A CLAUDE.md exists and loads the repository's instructions (it includes AGENTS.md when the instructions live there).",
    instructionsFile: 'CLAUDE.md',
    allowlistCheck: 'The permission allowlist covers the Tandembike MCP tools.',
  },
  // Copilot has no worktree tool and no AskUserQuestion; it loads AGENTS.md
  // or .github/copilot-instructions.md, and has no repository allowlist.
  copilot: {
    askAlso: '',
    instructionsCheck:
      "An AGENTS.md or a .github/copilot-instructions.md exists and holds the repository's instructions.",
    instructionsFile: 'AGENTS.md',
    allowlistCheck: null,
  },
};

/**
 * The conventions a repository may still state from before the runner owned
 * the branch and the Playbook owned the Stages (ADR 0020, ADR 0033): fixed,
 * like the checklist.
 */
const outdatedConventions = [
  'a branch-name pattern other than `ticket-<number>-<slug>`, such as `t<number>-<slug>`',
  'instructions for agents to create their own worktree or branch at the start of a run',
  "references to `/to-spec`, `/to-tickets` or a local `/triage` that the Playbook's Stages replace",
];

/** Setup's report of the Project's Agent commands: report only (ADR 0020). */
const agentCommandsItem = (
  overrides: { label: string; command: string; playbook: string }[],
): string =>
  overrides.length === 0
    ? 'Agent commands: No Stage has an Agent command: the Playbook runs every Stage. Report it.'
    : `Agent commands: ${overrides
        .map(
          ({ label, command, playbook }) =>
            `${label} \`${command}\` overrides the Playbook, which covers this Stage with \`${playbook}\`.`,
        )
        .join(
          ' ',
        )} Report each: when the Playbook covers its Stage, the User can clear it in the Project's Settings so the Playbook runs. Report only: do not change Agent commands.`;

/** What Setup checks (ADR 0020): fixed, and only what Tandembike relies on. */
const setupChecklist = (brief: RunBrief): string[] => {
  const own = agentBriefLines[brief.agentKind];
  const suggestions = brief.checkCommandSuggestions ?? [];
  const items = [
    `${own.instructionsCheck} It says how to test, lint and run the app. When it is missing, offer a skeleton \`${own.instructionsFile}\` that says how to test, lint and run the app, from what you found in the repository. When the file exists, suggest only its missing sections as an edit, never the skeleton over it.`,
    ...(own.allowlistCheck === null ? [] : [own.allowlistCheck]),
    `The Check command: what a Start run must see pass before it opens a pull request. ${
      suggestions.length === 0
        ? 'Tandembike detected no candidate.'
        : `Tandembike detected these candidates, best first: ${suggestions.map((command) => `\`${command}\``).join(', ')}.`
    } ${
      brief.checkCommand
        ? `The Project's Check command is \`${brief.checkCommand}\`.`
        : 'The Project has no Check command yet.'
    } Read the repository's scripts and find the best one. When the Project has none, propose it, and save it with set_check_command only after the User says yes. When it matches your best suggestion, report it as kept and ask nothing. When it differs, ask once, naming both and why yours may be better. Never clear or replace it without the User's yes. When you find none, say so: runs then look for the repository's test and lint scripts themselves.`,
    '`gh` is installed and logged in (`gh auth status`). Report only: runs need it to open pull requests.',
    'The repository has a CI workflow, such as one in `.github/workflows/`. Report only. Without CI, Auto-merge hands every pull request to the User for Approve merge, since no checks prove it.',
    `The default branch: Tandembike found ${brief.defaultBranch ? `\`${brief.defaultBranch}\`` : 'none'}. Report it, so the User can spot one they did not expect.`,
    'A git guardrail: a hook in the repository that blocks destructive git commands (force pushes, pushes to the default branch, git reset --hard, git clean, commits on the default branch or a detached HEAD). When there is none, offer to install one as advice, not a requirement: it also keeps terminal sessions and people off the default branch. When one exists, report it as already present and offer nothing.',
    `The Project's Agent run mode is ${brief.runMode}. Report it; do not suggest changing it.`,
    "Commits: when the repository has no commits yet, offer to make the first commit of what it holds, since worktrees and Start runs need one; make it only after the User's Allow.",
    agentCommandsItem(brief.agentCommandOverrides ?? []),
    `Outdated conventions: search the repository's instructions and agent docs for rules that contradict how Tandembike runs agents now: ${outdatedConventions.join('; ')}. Report each match with its file and offer an edit, which waits for the User's Allow like any other.`,
  ];
  return [
    'Check the repository against this checklist, and nothing else; the rest of its process is its own. The Project may have been set up before: compare each item with what is there before you offer anything.',
    ...items.map((item, index) => `${index + 1}. ${item}`),
    brief.terminal
      ? "First inspect the repository for every item, without asking anything. Then go through the items one item at a time: say what you found, and when the item needs the User's answer, ask about it alone, with your recommended answer; ask in the chat, so the User can accept it with a yes."
      : "First inspect the repository for every item, without asking anything. Then go through the items one item at a time: say what you found, and when the item needs the User's answer, ask about it alone, with your recommended answer, as a Widget: ask_choice, with your recommendation in `recommended`, so the User can accept it with a click.",
    'Setup is advisory, and the User may decline any suggestion. Every edit goes through their Allow or Deny. Work in the main checkout. Never commit, push or open a pull request, except that first commit of a repository with none: the User reviews the diff and commits it their own way.',
    'An item that already matches gets no question, only "already in place" in the summary.',
    'End with a summary that marks each checklist item by number as exactly one of: already in place, added (uncommitted), saved, committed, reported, skipped by the User, or missing.',
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
    isJudgmentIntent(brief.intent)
      ? 'Nobody answers in this Conversation: never ask the User anything, and do not use a Widget. Read the Tickets with get_ticket and the code with Read, Grep and Glob, not shell commands. Edit no files. Your only write is your own tool; end your turn when you have used it, or when there is nothing to do.'
      : brief.terminal
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
  } else if (
    brief.worktree?.onTicketBranch &&
    brief.intent === 'start' &&
    brief.ticketNumber !== null
  ) {
    const ticket = `T${brief.ticketNumber}`;
    lines.push(
      `You are in a git worktree Tandembike made for this Conversation at ${brief.worktree.path}. It is already on ${ticket}'s own branch (\`git branch --show-current\` names it): new from ${brief.worktree.base}, or the branch ${ticket} already had. Commit on that branch and check it before each commit; do not create another branch or worktree. Tandembike removes the worktree when the Conversation closes or the Ticket is Done; the branch stays.`,
    );
  } else if (brief.worktree && brief.intent === 'start') {
    lines.push(
      `You are in a git worktree Tandembike made for this Conversation at ${brief.worktree.path}, detached at ${brief.worktree.base}. Create your branch here; do not create or enter another worktree; Tandembike removes it when the Conversation closes or the Ticket is Done.`,
    );
  } else if (brief.parallelRuns && brief.intent === 'start') {
    lines.push(
      'Other runs may work in this repository at the same time, and this Conversation has no worktree of its own: it began before Parallel runs was on. Change no files and switch no branches here; tell the User, who can close this Conversation and start the Ticket again to get a worktree on its branch.',
    );
  }
  if (brief.intent === 'start' && !brief.terminal) {
    lines.push(
      'Ask every question to the User as a Widget, never in plain text, so Auto-reply can answer it when the Project has it on.',
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
