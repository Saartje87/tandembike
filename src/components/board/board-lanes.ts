import type { LiveConversation } from '../../conversations/conversation-activity';
import { isPullRequestReference } from '../../tickets/external-reference-display';
import type { Status } from '../../tickets/status';
import type { Ticket } from '../../tickets/tickets';
import { readyForAgent, readyForHuman } from '../../tickets/triage-labels';

/** The Board's Lanes, in the fixed order they are shown. */
export const boardLanes = [
  'Intake',
  'Todo',
  'In progress',
  'For human',
  'Done',
] as const;

export type BoardLane = (typeof boardLanes)[number];

/** Whether `value` is one of the Board's Lanes. */
export function isBoardLane(value: unknown): value is BoardLane {
  return (boardLanes as readonly unknown[]).includes(value);
}

/** What the Lane of a Ticket is derived from. */
export type LaneInput = Pick<
  Ticket,
  'status' | 'labels' | 'claim' | 'externalReferences'
>;

/** The sections of the In progress Lane (added with the run state, T1064). */
export type InProgressSection = 'Action needed' | 'Running' | 'Review';

/** Where a Ticket sits: its Lane and, in In progress, its section. */
export type LanePlacement = {
  lane: BoardLane;
  section: InProgressSection | null;
};

/** The sections in the order the In progress Lane shows them. */
export const inProgressSections: readonly InProgressSection[] = [
  'Action needed',
  'Running',
  'Review',
];

/**
 * The section of an In progress Ticket. A live Conversation decides first:
 * running is Running; idle, its Agent having ended its turn, is Review once
 * the Ticket has a PR reference and no Claim; anything else needs the User.
 * Without one, Review with a PR reference, Running with a Claim, else it is
 * stalled and needs action.
 */
function sectionOf(
  ticket: Pick<Ticket, 'claim' | 'externalReferences'>,
  live: LiveConversation | undefined,
): InProgressSection {
  const hasPullRequest = ticket.externalReferences.some(isPullRequestReference);
  if (live?.state === 'running') {
    return 'Running';
  }
  if (live?.state === 'idle' && hasPullRequest && !ticket.claim) {
    return 'Review';
  }
  if (live) {
    return 'Action needed';
  }
  if (hasPullRequest) {
    return 'Review';
  }
  return ticket.claim ? 'Running' : 'Action needed';
}

/**
 * The Lane a Ticket sits in, derived from its Status and triage state label:
 * a Todo Ticket is in Intake (needs-triage, needs-info, or no state label),
 * Todo (ready-for-agent) or For human (ready-for-human).
 */
export function laneOf(
  ticket: LaneInput,
  live?: LiveConversation,
): LanePlacement {
  if (ticket.status === 'In progress') {
    return { lane: 'In progress', section: sectionOf(ticket, live) };
  }
  if (ticket.status === 'Done') {
    return { lane: 'Done', section: null };
  }
  if (ticket.labels.includes(readyForAgent)) {
    return { lane: 'Todo', section: null };
  }
  if (ticket.labels.includes(readyForHuman)) {
    return { lane: 'For human', section: null };
  }
  return { lane: 'Intake', section: null };
}

/**
 * Whether a Ticket is stalled: it needs action with no live Conversation, so
 * it has no Claim and no PR reference either. Only a stalled card offers
 * Back to Todo.
 */
export function isStalled(ticket: LaneInput, live?: LiveConversation): boolean {
  return live === undefined && laneOf(ticket).section === 'Action needed';
}

/**
 * Whether a Ticket sits in the Review section: In progress with a PR
 * reference and no live Conversation. Only a Review card offers Merged.
 */
export function isInReview(
  ticket: LaneInput,
  live?: LiveConversation,
): boolean {
  return laneOf(ticket, live).section === 'Review';
}

/** The Status a drop into `lane` gives. */
export function laneStatus(lane: BoardLane): Status {
  switch (lane) {
    case 'In progress':
      return 'In progress';
    case 'Done':
      return 'Done';
    default:
      return 'Todo';
  }
}

/** Whether `lane` shows Todo Tickets, told apart by their triage label. */
export function isTriageLane(lane: BoardLane): boolean {
  return laneStatus(lane) === 'Todo';
}
