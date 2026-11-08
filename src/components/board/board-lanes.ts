import type { LiveConversation } from '../../conversations/conversation-activity';
import { isPullRequestReference } from '../../tickets/external-reference-display';
import type { Ticket } from '../../tickets/tickets';
import { readyForAgent, readyForHuman } from '../../tickets/triage-labels';

/** The Lanes a Ticket is derived into, in Board order. */
export type BoardLane =
  | 'Intake'
  | 'Queued'
  | 'In progress'
  | 'Your work'
  | 'Done';

/** What the Lane of a Ticket is derived from. */
export type LaneInput = Pick<
  Ticket,
  'status' | 'labels' | 'claim' | 'externalReferences' | 'type' | 'children'
>;

/** The sections of the In progress Lane (added with the run state, T1064). */
export type InProgressSection = 'Action needed' | 'Running' | 'Review';

/** Where a Ticket sits: its Lane and, in In progress, its section. */
export type LanePlacement = {
  lane: BoardLane;
  section: InProgressSection | null;
};

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
 * Whether `ticket` is an Epic without children: none unarchived, on any
 * Board. It cannot run until someone splits it (ADR 0027).
 */
function isEmptyEpic(ticket: Pick<Ticket, 'type' | 'children'>) {
  return (
    ticket.type === 'Epic' && ticket.children.every(({ archived }) => archived)
  );
}

/**
 * The Lane a Ticket sits in, derived from its Status and triage state label:
 * a Todo Ticket is in Intake (needs-triage, needs-info, or no state label),
 * Queued (ready-for-agent) or Your work (ready-for-human). A ready-for-agent
 * Epic without children is in Intake, not Queued: it must be split first
 * (ADR 0027).
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
    return { lane: isEmptyEpic(ticket) ? 'Intake' : 'Queued', section: null };
  }
  if (ticket.labels.includes(readyForHuman)) {
    return { lane: 'Your work', section: null };
  }
  return { lane: 'Intake', section: null };
}

/**
 * Whether a Ticket is stalled: it needs action with no live Conversation, so
 * it has no Claim and no PR reference either. It is the Glossary term for
 * the Action needed section; Back to Todo is offered more widely, see
 * `isParked`.
 */
export function isStalled(ticket: LaneInput, live?: LiveConversation): boolean {
  return live === undefined && laneOf(ticket).section === 'Action needed';
}

/**
 * Whether a Ticket sits in the Review section: In progress with a PR
 * reference and no live Conversation. The drawer offers Merged there.
 */
export function isInReview(
  ticket: LaneInput,
  live?: LiveConversation,
): boolean {
  return laneOf(ticket, live).section === 'Review';
}

/**
 * Whether a Ticket or Epic is parked: In progress with no live Conversation,
 * whatever its section (Action needed, Running or Review). Back to Todo shows
 * in the drawer exactly then, so a Claim left behind or a PR closed without
 * merge has a way out.
 */
export function isParked(ticket: LaneInput, live?: LiveConversation): boolean {
  return ticket.status === 'In progress' && live === undefined;
}
