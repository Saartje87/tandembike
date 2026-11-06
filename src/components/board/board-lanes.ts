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

/** The sections of the In progress Lane (added with the run state, T1064). */
export type InProgressSection = 'Action needed' | 'Running' | 'Review';

/**
 * Live Conversation state of a Ticket, which a later Ticket (T1065) feeds to
 * `laneOf` to place an In progress Ticket in a section.
 */
export type LaneActivity = {
  running?: boolean;
  needsYou?: boolean;
};

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
 * The section of an In progress Ticket from its data alone: Review with a PR
 * reference, Running with a Claim, else it is stalled and needs action.
 */
function sectionOf(
  ticket: Pick<Ticket, 'claim' | 'externalReferences'>,
): InProgressSection {
  if (ticket.externalReferences.some(isPullRequestReference)) {
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
  ticket: Pick<Ticket, 'status' | 'labels' | 'claim' | 'externalReferences'>,
  _activity?: LaneActivity,
): LanePlacement {
  if (ticket.status === 'In progress') {
    return { lane: 'In progress', section: sectionOf(ticket) };
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
 * Whether a Ticket is stalled: In progress with no Claim, no PR reference
 * and, once the live state is given, nothing running or waiting. Only a
 * stalled card offers Back to Todo.
 */
export function isStalled(
  ticket: Pick<Ticket, 'status' | 'labels' | 'claim' | 'externalReferences'>,
  activity?: LaneActivity,
): boolean {
  return (
    laneOf(ticket, activity).section === 'Action needed' &&
    !ticket.claim &&
    !ticket.externalReferences.some(isPullRequestReference)
  );
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
