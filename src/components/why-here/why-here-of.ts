import type {
  AutopilotExplanation,
  AutopilotPauseReason,
  AutoTriagePauseReason,
  NotEligibleReason,
  NotTriageEligibleReason,
  TicketExplanation,
} from '../../autopilot/explanation';
import type { LanePlacement } from '../../tickets/ticket-lanes';

/** A piece of the sentence: plain text, or text linking somewhere. */
export type WhySegment =
  | { text: string }
  | { text: string; ticket: number }
  | { text: string; conversation: number };

export type WhyHereInput = {
  /** Where the Ticket sits on its Board, by the Board's own derivation. */
  placement: LanePlacement;
  /** Whether a Conversation of its own is live: without one, In progress is Stalled. */
  hasLive: boolean;
  /** The Epic it is a child of, or null. */
  epicNumber: number | null;
  /** Autopilot's answer for its Project (ADR 0044). */
  autopilot: AutopilotExplanation['autopilot'];
  autoTriage: AutopilotExplanation['autoTriage'];
  /** Its own entry there; null for a Ticket that is not Todo. */
  entry: TicketExplanation | null;
};

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ??
        'th');
  return `${n}${suffix}`;
};

/** Pause reasons that only mean "wait for a free run slot". */
const slotReasons = new Set(['noFreeStartRunSlot', 'machineCapFull']);

function autopilotPhrase(reason: AutopilotPauseReason): string | null {
  switch (reason.type) {
    case 'projectArchived':
      return 'the Project is archived';
    case 'switchedOff':
      return 'Autopilot is off';
    case 'noActiveCycle':
      return 'there is no Active Cycle';
    case 'noSpendCeiling':
      return 'no Spend ceiling is set';
    case 'overSpendCeiling':
      return 'Autopilot is over the Spend ceiling';
    case 'noFreeStartRunSlot':
      return 'no Start run slot is free';
    case 'machineCapFull':
      return 'the machine cap is full';
    case 'overMachineCeiling':
      return 'Autopilot is over the machine ceiling';
    case 'noEligibleWork':
      return null;
  }
}

function autoTriagePhrase(reason: AutoTriagePauseReason): string | null {
  switch (reason.type) {
    case 'projectArchived':
      return 'the Project is archived';
    case 'switchedOff':
      return 'Auto-triage is off';
    case 'noTriageCeiling':
      return 'no Triage ceiling is set';
    case 'overTriageCeiling':
      return 'Auto-triage is over the Triage ceiling';
    case 'triageRunWorking':
      return 'a Triage run is working on another Ticket';
    case 'machineCapFull':
      return 'the machine cap is full';
    case 'overMachineCeiling':
      return 'Autopilot is over the machine ceiling';
    case 'noTriageEligibleWork':
      return null;
  }
}

/** `parts` joined by ", " into segments. */
function joined(parts: WhySegment[][]): WhySegment[] {
  return parts.flatMap((part, index) =>
    index === 0 ? part : [{ text: ', ' }, ...part],
  );
}

function buildReasonSegments(reason: NotEligibleReason): WhySegment[] {
  switch (reason.type) {
    case 'notReady':
      return [{ text: 'not ready-for-agent' }];
    case 'blocked':
      return [
        { text: 'blocked by ' },
        ...joined(
          reason.blockers.map((number) => [
            { text: `T${number}`, ticket: number },
          ]),
        ),
      ];
    case 'claimed':
      return [{ text: 'claimed by another run' }];
    case 'notInActiveCycle':
      return [{ text: 'not in the Active Cycle' }];
    case 'archived':
      return [{ text: 'archived' }];
    case 'epicWithoutChildren':
      return [{ text: 'an Epic without children' }];
    case 'epicChild':
      return [{ text: "an Epic's child" }];
    case 'heldByConversation':
      return [
        { text: 'held by ' },
        {
          text: 'an open Start Conversation',
          conversation: reason.conversationId,
        },
      ];
  }
}

function triageReasonSegments(reason: NotTriageEligibleReason): WhySegment[] {
  switch (reason.type) {
    case 'archived':
      return [{ text: 'it is archived' }];
    case 'triaged':
      return [{ text: `it is ${reason.label}, waiting for more information` }];
    case 'feedback':
      return [{ text: 'it is feedback, which Auto-triage leaves to you' }];
    case 'underTriageConversation':
      return [
        { text: 'a ' },
        {
          text: 'Triage Conversation',
          conversation: reason.conversationId,
        },
        { text: ' is open on it' },
      ];
    case 'proposed':
      return [{ text: 'its triage proposal waits for your decision' }];
  }
}

const capitalised = (segments: WhySegment[]): WhySegment[] => {
  const [first, ...rest] = segments;
  return first
    ? [
        { ...first, text: first.text[0].toUpperCase() + first.text.slice(1) },
        ...rest,
      ]
    : segments;
};

function pausePhrases<R>(
  state: { state: 'running' } | { state: 'paused'; reasons: R[] },
  phrase: (reason: R) => string | null,
  keep: (reason: R) => boolean = () => true,
): string[] {
  return state.state === 'running'
    ? []
    : state.reasons
        .filter(keep)
        .map(phrase)
        .filter((text): text is string => text !== null);
}

function inProgress(input: WhyHereInput): WhySegment[] {
  switch (input.placement.section) {
    case 'Running':
      return [{ text: 'Running: an Agent run is working on it.' }];
    case 'Review':
      return [
        {
          text: 'In Review: its pull request waits for your review and Approve merge.',
        },
      ];
    default:
      return input.hasLive
        ? [
            {
              text: 'Action needed: its run waits for you, or ended without finishing.',
            },
          ]
        : [
            {
              text: 'Stalled: no run is working on it and it has no pull request. Start it again or send it Back to Todo.',
            },
          ];
  }
}

function intake(input: WhyHereInput): WhySegment[] {
  const lead: WhySegment = { text: 'In Intake: needs triage. ' };
  const triage = input.entry?.triage;
  if (!triage) {
    return [lead];
  }
  if (!triage.eligible) {
    return [
      lead,
      { text: 'Auto-triage leaves it: ' },
      ...joined(triage.reasons.map(triageReasonSegments)),
      { text: '.' },
    ];
  }
  const paused = pausePhrases(input.autoTriage, autoTriagePhrase);
  if (paused.length > 0) {
    return [lead, ...capitalised([{ text: `${paused.join(', ')}.` }])];
  }
  return [
    lead,
    {
      text:
        triage.place === 1
          ? 'Auto-triage picks it up next.'
          : `Auto-triage picks it up in turn: ${ordinal(triage.place)} in line.`,
    },
  ];
}

function queued(input: WhyHereInput): WhySegment[] {
  const build = input.entry?.build;
  const blocking = pausePhrases(
    input.autopilot,
    autopilotPhrase,
    (reason) => !slotReasons.has(reason.type),
  );
  const slotsFull =
    input.autopilot.state === 'paused' &&
    input.autopilot.reasons.some((reason) => slotReasons.has(reason.type));
  if (build && !build.eligible) {
    const parts = [
      ...build.reasons.map(buildReasonSegments),
      ...blocking.map((text) => [{ text }]),
    ];
    return [{ text: 'Queued, but waiting: ' }, ...joined(parts), { text: '.' }];
  }
  if (blocking.length > 0) {
    return [{ text: `Queued, but ${blocking.join(', ')}.` }];
  }
  const place = build?.eligible ? build.place : 1;
  const line =
    place === 1
      ? 'Queued: Autopilot starts this next'
      : `Queued: ${ordinal(place)} in line`;
  return [{ text: slotsFull ? `${line}, once a run slot frees.` : `${line}.` }];
}

/**
 * Why a Ticket that is not Done is where it is, and what it waits for, in one
 * sentence (ADR 0044): from its Board placement and Autopilot's own answer,
 * so it cannot disagree with what Autopilot does. Null for a Done Ticket.
 */
export function whyHereOf(input: WhyHereInput): WhySegment[] | null {
  const { lane } = input.placement;
  if (lane === 'Done') {
    return null;
  }
  if (lane === 'In progress') {
    return inProgress(input);
  }
  if (input.epicNumber !== null) {
    return [
      { text: 'Runs with its Epic ' },
      { text: `T${input.epicNumber}`, ticket: input.epicNumber },
      {
        text: ': Autopilot starts the Epic, and its children run in that one run.',
      },
    ];
  }
  const build = input.entry?.build;
  if (
    build &&
    !build.eligible &&
    build.reasons.some((reason) => reason.type === 'epicWithoutChildren')
  ) {
    return [
      {
        text: 'Waits for triage to split it: an Epic is queued once it has children.',
      },
    ];
  }
  if (lane === 'Your work') {
    return [{ text: 'Your work: Autopilot leaves it to you.' }];
  }
  if (lane === 'Intake') {
    return intake(input);
  }
  return queued(input);
}
