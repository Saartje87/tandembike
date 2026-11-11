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
 * What the placement of a Ticket is derived from. A child's `epic` carries
 * the run state it falls back to (T1143); without it, none. `number` finds
 * its live Conversation in the live map.
 */
export type PlacementInput = Pick<
  Ticket,
  | 'number'
  | 'status'
  | 'labels'
  | 'claim'
  | 'externalReferences'
  | 'type'
  | 'children'
> & { epic?: EpicLink | null };

/** Every Ticket's live Conversation by number, as `ConversationActivity.live` holds it. */
export type LiveMap = Readonly<Record<number, LiveConversation>>;

/**
 * What a section is derived from: a Claim and whether there is a PR
 * reference. An `EpicLink` is one, the Epic's (T1143).
 */
type RunState = Pick<EpicLink, 'claim' | 'hasPullRequest'>;

/** The sections of the In progress Lane (added with the run state, T1064). */
export type InProgressSection = 'Action needed' | 'Running' | 'Review';

/** What the Ticket drawer offers on a Ticket, beside its Status. */
export type PlacementOffers = {
  /** Spec: a Todo Ticket in Intake, or a Todo Epic without children (T1222). */
  spec: boolean;
  /** Merged: in Review by its own PR reference, never its Epic's. */
  merged: boolean;
  /** Done: ready-for-human, nothing working on it, not in Review (T1268). */
  done: boolean;
  /** Back to Todo: In progress with no live Conversation of its own. */
  backToTodo: boolean;
};

/**
 * Where a Ticket sits and what the drawer offers on it: the one answer the
 * Board, the drawer, Why is this here?, notices and Conversations read.
 */
export type Placement = {
  lane: BoardLane;
  /** Its section in In progress; `null` in every other Lane. */
  section: InProgressSection | null;
  /**
   * Whether its Epic's run places it: an In progress child with no Claim, PR
   * reference or live Conversation of its own (ADR 0028).
   */
  placedByEpic: boolean;
  /** The live Conversation that placed it, its own or its Epic's, or none. */
  placedBy: LiveConversation | undefined;
  /**
   * Whether it is Stalled: in Action needed with no live Conversation of its
   * own, so no Claim and no PR reference either; a child placed by its Epic
   * only when its Epic is.
   */
  stalled: boolean;
  offers: PlacementOffers;
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

const ownRunState = (ticket: PlacementInput): RunState => ({
  claim: ticket.claim,
  hasPullRequest: ticket.externalReferences.some(isPullRequestReference),
});

/**
 * Whether an In progress child takes its section from its Epic: it has no
 * Claim, PR reference or live Conversation of its own, as the Epic workflow
 * keeps all three on the Epic (ADR 0028, T1143).
 */
function inheritsSection(
  ticket: PlacementInput,
  own: LiveConversation | undefined,
): boolean {
  const run = ownRunState(ticket);
  return (
    ticket.status === 'In progress' &&
    Boolean(ticket.epic) &&
    own === undefined &&
    run.claim === null &&
    !run.hasPullRequest
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
 * The Lane of a Todo or Done Ticket, derived from its Status and triage
 * state label: a Todo Ticket is in Intake (needs-triage, needs-info, or no
 * state label), Queued (ready-for-agent) or Your work (ready-for-human). A
 * ready-for-agent Epic without children is in Intake, not Queued: it must be
 * split first (ADR 0027).
 */
function idleLaneOf(ticket: PlacementInput): BoardLane {
  if (ticket.status === 'Done') {
    return 'Done';
  }
  if (ticket.labels.includes(readyForAgent)) {
    return isEmptyEpic(ticket) ? 'Intake' : 'Queued';
  }
  if (ticket.labels.includes(readyForHuman)) {
    return 'Your work';
  }
  return 'Intake';
}

/**
 * Whether the Spec button shows: a Todo Ticket in Intake, or a Todo Epic
 * without children, which Spec fills in itself (T1222). The Epic is tested
 * directly, since an empty Epic labelled ready-for-human sits in Your work.
 */
function offersSpec(ticket: PlacementInput, lane: BoardLane): boolean {
  if (ticket.status !== 'Todo') {
    return false;
  }
  return ticket.type === 'Epic' ? isEmptyEpic(ticket) : lane === 'Intake';
}

/**
 * Whether a Ticket sits in the Review section by its own PR reference and
 * its own live Conversation: Merged is offered there. A child in Review by
 * its Epic's PR is not, as Merged is the Epic's.
 */
function inOwnReview(
  ticket: PlacementInput,
  own: LiveConversation | undefined,
): boolean {
  return (
    ticket.status === 'In progress' &&
    sectionOf(ownRunState(ticket), own) === 'Review'
  );
}

/**
 * Whether the drawer offers Done: labelled ready-for-human, Todo or In
 * progress, with no Conversation of its own running or waiting on it, and
 * not In progress with a PR reference, where Merged finishes it (T1268). An
 * idle, interrupted or failed Conversation does not hide it: the User's own
 * work often has one. Done applies the completion rule, as Merged does;
 * nothing finishes such a Ticket by itself.
 */
function offersDone(
  ticket: PlacementInput,
  own: LiveConversation | undefined,
): boolean {
  return (
    ticket.status !== 'Done' &&
    ticket.labels.includes(readyForHuman) &&
    own?.state !== 'running' &&
    own?.state !== 'waiting' &&
    !inOwnReview(ticket, undefined)
  );
}

/**
 * Where `ticket` sits on the Board and what the drawer offers on it, with
 * `live`, every Ticket's live Conversation by number. It looks up the
 * Ticket's own live Conversation and its Epic's itself: choosing which one
 * applies is the rule.
 *
 * The Lane comes from its Status and triage state label; In progress, its
 * section from its run state: its live Conversation, Claim and PR reference.
 * An In progress child with none of the three of its own is placed by its
 * Epic's: the Epic's Claim, PR reference and live Conversation (ADR 0028).
 * Merged, Done and Back to Todo read only the Ticket's own run.
 *
 * Back to Todo is offered on any In progress Ticket or Epic without a live
 * Conversation of its own, whatever its section, so a Claim left behind or a
 * PR closed without merge has a way out.
 */
export function placementOf(ticket: PlacementInput, live: LiveMap): Placement {
  const own: LiveConversation | undefined = live[ticket.number];
  const epicLive: LiveConversation | undefined = ticket.epic
    ? live[ticket.epic.number]
    : undefined;
  const placedByEpic = inheritsSection(ticket, own);
  const placedBy = placedByEpic ? epicLive : own;
  const inProgress = ticket.status === 'In progress';
  const section = !inProgress
    ? null
    : placedByEpic && ticket.epic
      ? sectionOf(ticket.epic, epicLive)
      : sectionOf(ownRunState(ticket), own);
  const lane = inProgress ? 'In progress' : idleLaneOf(ticket);
  return {
    lane,
    section,
    placedByEpic,
    placedBy,
    stalled: own === undefined && section === 'Action needed',
    offers: {
      spec: offersSpec(ticket, lane),
      merged: inOwnReview(ticket, own),
      done: offersDone(ticket, own),
      backToTodo: inProgress && own === undefined,
    },
  };
}
