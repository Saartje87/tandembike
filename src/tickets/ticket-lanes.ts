import type { LiveConversation } from '../conversations/conversation-activity';
import type { EpicLink } from './epic-link';
import { isPullRequestReference } from './external-reference-display';
import type { Ticket } from './tickets';
import { readyForAgent, readyForHuman } from './triage-labels';

/** The Lanes a Ticket is derived into, in Board order. */
export type BoardLane =
  | 'Intake'
  | 'Queued'
  | 'In progress'
  | 'Your work'
  | 'Done';

/**
 * What the Lane of a Ticket is derived from. A child's `epic` carries the
 * run state it falls back to (T1143); without it, none.
 */
export type LaneInput = Pick<
  Ticket,
  'status' | 'labels' | 'claim' | 'externalReferences' | 'type' | 'children'
> & { epic?: EpicLink | null };

/**
 * What a section is derived from: a Claim and whether there is a PR
 * reference. An `EpicLink` is one, the Epic's (T1143).
 */
type RunState = Pick<EpicLink, 'claim' | 'hasPullRequest'>;

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
  { claim, hasPullRequest }: RunState,
  live: LiveConversation | undefined,
): InProgressSection {
  if (live?.state === 'running') {
    return 'Running';
  }
  if (live?.state === 'idle' && hasPullRequest && !claim) {
    return 'Review';
  }
  if (live) {
    return 'Action needed';
  }
  if (hasPullRequest) {
    return 'Review';
  }
  return claim ? 'Running' : 'Action needed';
}

const ownRunState = (ticket: LaneInput): RunState => ({
  claim: ticket.claim,
  hasPullRequest: ticket.externalReferences.some(isPullRequestReference),
});

/**
 * Whether an In progress child takes its section from its Epic: it has no
 * Claim, PR reference or live Conversation of its own, as the Epic workflow
 * keeps all three on the Epic (T1143).
 */
export function inheritsSection(
  ticket: LaneInput,
  live?: LiveConversation,
): boolean {
  const own = ownRunState(ticket);
  return (
    ticket.status === 'In progress' &&
    Boolean(ticket.epic) &&
    live === undefined &&
    own.claim === null &&
    !own.hasPullRequest
  );
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
 * Whether the Spec button shows on `ticket`: a Todo Ticket in Intake, or a
 * Todo Epic without children, which Spec fills in itself (T1222). The Epic
 * is tested directly, since an empty Epic labelled ready-for-human sits in
 * Your work.
 */
export function canSpec(ticket: LaneInput): boolean {
  if (ticket.status !== 'Todo') {
    return false;
  }
  if (ticket.type === 'Epic') {
    return isEmptyEpic(ticket);
  }
  return laneOf(ticket).lane === 'Intake';
}

/**
 * The Lane a Ticket sits in, derived from its Status and triage state label:
 * a Todo Ticket is in Intake (needs-triage, needs-info, or no state label),
 * Queued (ready-for-agent) or Your work (ready-for-human). A ready-for-agent
 * Epic without children is in Intake, not Queued: it must be split first
 * (ADR 0027).
 *
 * An In progress child with no run state of its own is placed by its Epic's:
 * the Epic's Claim, PR reference and `epicLive`, its live Conversation
 * (T1143).
 */
export function laneOf(
  ticket: LaneInput,
  live?: LiveConversation,
  epicLive?: LiveConversation,
): LanePlacement {
  if (ticket.status === 'In progress') {
    const section =
      ticket.epic && inheritsSection(ticket, live)
        ? sectionOf(ticket.epic, epicLive)
        : sectionOf(ownRunState(ticket), live);
    return { lane: 'In progress', section };
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
 * `isParked`. A child with no run state of its own is stalled only when its
 * Epic, with `epicLive`, is.
 */
export function isStalled(
  ticket: LaneInput,
  live?: LiveConversation,
  epicLive?: LiveConversation,
): boolean {
  return (
    live === undefined &&
    laneOf(ticket, undefined, epicLive).section === 'Action needed'
  );
}

/**
 * Whether a Ticket sits in the Review section by its own PR reference: In
 * progress with one and no live Conversation. The drawer offers Merged
 * there; a child in Review by its Epic's PR is not, as Merged is the Epic's.
 */
export function isInReview(
  ticket: LaneInput,
  live?: LiveConversation,
): boolean {
  return (
    ticket.status === 'In progress' &&
    sectionOf(ownRunState(ticket), live) === 'Review'
  );
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
