import type { UsageByModel } from '../footprint/token-usage';
import type { Status } from '../tickets/status';
import type { RunEvent } from './agent-runner';
import { isStartRunIntent } from './capacity';
import type {
  ConversationIntent,
  ConversationStarter,
  ConversationState,
  TranscriptRole,
} from './conversation-state';
import { type RunResult, runResultOf } from './run-outcome';

/**
 * The run lifecycle (T1387): one pure step for every input that changes a
 * live run, a runner event, the User's stop, reply or close, or a move of its
 * Ticket. It returns the run's next state, a patch of its Conversation and
 * the effects to apply in order; the Conversations module does the I/O.
 */

/** Who sends a reply: the User, or Autopilot in their place. */
export type ConversationSender = Exclude<ConversationStarter, 'terminal'>;

/**
 * Where a live run is:
 * - `alive`: its process speaks for its Conversation, mid-turn or between
 *   turns. `releaseWorktree`: its Ticket reached Done mid-turn, so its
 *   worktree is released when the turn ends (T1232).
 * - `endingAfterTurn`: alive, but its Ticket went Back to Todo or Done
 *   mid-turn, so its process ends when the turn does (ADR 0049).
 * - `stopped`: the User stopped it. `lateCost`: its stopped Run outcome
 *   still waits for the cost the stopped turn reports (T587).
 * - `ended`: its process ended; what it still reports is ignored.
 */
export type RunPhase =
  | { name: 'alive'; releaseWorktree: boolean }
  | { name: 'endingAfterTurn'; releaseWorktree: boolean }
  | { name: 'stopped'; lateCost: { costAtStart: number } | null }
  | { name: 'ended' };

/** A run's start, recorded when its message goes in. */
export type PendingRun = {
  startedAt: Date;
  /** The Conversation's cost when the run began. */
  costAtStart: number;
  command: string | null;
  startedByAutopilot: boolean;
  transientResume: boolean;
  /**
   * The Stage this run is, when it is not the Conversation's intent: the
   * resume of Approve merge is a `merge` run in a Start Conversation (ADR 0038).
   */
  stage?: ConversationIntent;
};

/** A live run of a Conversation, and what the Conversation cost before it. */
export type LiveRun = {
  phase: RunPhase;
  costBefore: number;
  /** The Conversation's tokens per model when the run started (ADR 0050). */
  usageBefore: UsageByModel;
  /** The model the run reported in its init message. */
  model: string | null;
  /**
   * Its Ticket's Status as this run last saw it, to tell a move to Todo or
   * Done (ADR 0049). Null for a Conversation without a Ticket.
   */
  ticketStatus: Status | null;
  /**
   * The message the run is working on, until it ends (a turn, an exit or a
   * stop): what its Run outcome is recorded from. Null between runs.
   */
  pending: PendingRun | null;
};

/** What the step reads of the run's Conversation. */
export type RunConversation = {
  projectId: number;
  ticketNumber: number | null;
  intent: ConversationIntent;
  state: ConversationState;
  costUsd: number;
  worktreePath: string | null;
  worktreeRemoved: boolean;
};

/** What the step reads of the Conversation's Ticket. */
export type TicketFacts = {
  status: Status;
  /** The Ticket, or its Epic, has a PR reference. */
  hasPullRequest: boolean;
  inReview: boolean;
  claimed: boolean;
};

export type LifecycleInput =
  /**
   * What the run reports. `waitsOnUser`: a permission request or a Widget of
   * the run is unanswered. `ticket`: needed for a turn end and an exit.
   */
  | {
      type: 'event';
      event: RunEvent;
      waitsOnUser: boolean;
      ticket: TicketFacts | null;
    }
  /** A reply, the User's or Autopilot's, into the run's live process. */
  | {
      type: 'reply';
      text: string;
      sentBy: ConversationSender;
      /** Autopilot's automatic resume of a transient end (ADR 0034). */
      transientResume?: boolean;
      /** The Stage the run is, when not the Conversation's intent (ADR 0038). */
      stage?: ConversationIntent;
    }
  /**
   * The User's stop. `keepWorktree`: the run continues in a terminal, which
   * takes over its worktree (ADR 0039).
   */
  | { type: 'stop'; keepWorktree: boolean }
  /** The User's close: a stop that also takes it off the open Conversations. */
  | { type: 'close' }
  /** Its Ticket's Status now, after a change of the Ticket. */
  | { type: 'ticketMoved'; status: Status }
  /** Tandembike removed the Conversation's worktree (T1281). */
  | { type: 'worktreeRemoved' };

export type ConversationPatch = Partial<{
  state: ConversationState;
  sdkSessionId: string;
  costUsd: number;
  hidden: boolean;
}>;

/** A Run outcome to record, but for its Conversation's id. */
export type NewRunOutcome = {
  projectId: number;
  ticketNumber: number | null;
  stage: ConversationIntent;
  result: RunResult;
  startedAt: Date;
  endedAt: Date;
  costUsd: number;
  model: string | null;
  command: string | null;
  startedByAutopilot: boolean;
  transientResume: boolean;
};

/** What the Conversations module does for a step, in order. */
export type RunEffect =
  | {
      type: 'append';
      role: TranscriptRole;
      text: string;
      tool?: { name: string; input?: Record<string, unknown> };
    }
  | { type: 'writeUsage'; before: UsageByModel; run: UsageByModel }
  | { type: 'recordOutcome'; outcome: NewRunOutcome }
  /** Sets the cost of the run's stopped outcome (T587). */
  | { type: 'setStoppedOutcomeCost'; costUsd: number }
  /** Puts a message into the run's process. */
  | { type: 'send'; text: string }
  /** The run no longer speaks for its Conversation, and frees its slot. */
  | { type: 'detach' }
  /** Expires the permission requests and Widgets the run waits on. */
  | { type: 'expireWaits' }
  /** Ends the run's process, interrupting its turn first if asked. */
  | { type: 'endProcess'; interrupt: boolean }
  | { type: 'releaseWorktree' }
  | { type: 'announce' };

export type StepResult = {
  run: LiveRun | null;
  patch: ConversationPatch;
  effects: RunEffect[];
};

/** The `/command` a message starts with, such as `/implement`; null for none. */
export const commandOf = (message: string): string | null =>
  /^\/[\w:-]+/.exec(message.trim())?.[0] ?? null;

/** The pending run of a message sent at `now`. */
export const pendingRunOf = (
  message: string,
  input: {
    costAtStart: number;
    sentBy: ConversationSender;
    transientResume?: boolean;
    stage?: ConversationIntent;
  },
  now: Date,
): PendingRun => ({
  startedAt: now,
  costAtStart: input.costAtStart,
  command: commandOf(message),
  startedByAutopilot: input.sentBy === 'autopilot',
  transientResume: input.transientResume ?? false,
  stage: input.stage,
});

const unchanged = (run: LiveRun | null): StepResult => ({
  run,
  patch: {},
  effects: [],
});

/** Ends the process of a run between turns, freeing its slot (ADR 0049). */
const endingProcess: RunEffect[] = [
  { type: 'detach' },
  { type: 'expireWaits' },
  { type: 'endProcess', interrupt: false },
];

/**
 * Whether a Start or Merge has handed its Ticket off as its turn ends, so
 * nothing waits on its process (ADR 0049): the Ticket is Done, or in Review
 * with a pull request and no Claim.
 */
const handedOff = (
  conversation: RunConversation,
  ticket: TicketFacts | null,
): boolean =>
  isStartRunIntent(conversation.intent) &&
  ticket !== null &&
  (ticket.status === 'Done' || (ticket.inReview && !ticket.claimed));

/** The Run outcome of the run's pending message, ended now. */
const outcomeOf = (
  run: LiveRun,
  pending: PendingRun,
  conversation: RunConversation,
  end: {
    stopped?: boolean;
    error?: string;
    errorSubtype?: string;
    waitingOnUser?: boolean;
    ticket: TicketFacts | null;
    cost: number;
  },
  now: Date,
): NewRunOutcome => ({
  projectId: conversation.projectId,
  ticketNumber: conversation.ticketNumber,
  stage: pending.stage ?? conversation.intent,
  result: runResultOf({
    stopped: end.stopped ?? false,
    error: end.error,
    errorSubtype: end.errorSubtype,
    ticketStatus: end.ticket?.status ?? null,
    hasPullRequest: end.ticket?.hasPullRequest ?? false,
    waitingOnUser: end.waitingOnUser ?? false,
    intent: conversation.intent,
  }),
  startedAt: pending.startedAt,
  endedAt: now,
  costUsd: Math.max(0, end.cost - pending.costAtStart),
  model: run.model,
  command: pending.command,
  startedByAutopilot: pending.startedByAutopilot,
  transientResume: pending.transientResume,
});

/** An interrupted turn reports its cost after the stop (T587). */
const stoppedEvent = (
  run: LiveRun,
  phase: Extract<RunPhase, { name: 'stopped' }>,
  event: RunEvent,
): StepResult => {
  if (event.type !== 'turn') {
    return unchanged(run);
  }
  const cost = run.costBefore + event.costUsd;
  const effects: RunEffect[] = [];
  // The stopped outcome takes the first cost the stopped turn reports.
  if (phase.lateCost) {
    effects.push({
      type: 'setStoppedOutcomeCost',
      costUsd: Math.max(0, cost - phase.lateCost.costAtStart),
    });
  }
  if (event.usage) {
    effects.push({
      type: 'writeUsage',
      before: run.usageBefore,
      run: event.usage,
    });
  }
  effects.push({ type: 'announce' });
  return {
    run: { ...run, phase: { name: 'stopped', lateCost: null } },
    patch: { costUsd: cost },
    effects,
  };
};

const liveEvent = (
  run: LiveRun,
  phase: Extract<RunPhase, { name: 'alive' | 'endingAfterTurn' }>,
  conversation: RunConversation,
  input: Extract<LifecycleInput, { type: 'event' }>,
  now: Date,
): StepResult => {
  const { event } = input;
  const patch: ConversationPatch = {};
  const effects: RunEffect[] = [];
  let next = run;
  // The Agent acts again after its turn ended, as when a background task
  // it started reports and wakes it: it works, not waits (T1261).
  if (
    (event.type === 'agent' ||
      event.type === 'tool' ||
      event.type === 'created') &&
    conversation.state === 'idle'
  ) {
    patch.state = 'running';
  }
  const waitingOnUser = input.waitsOnUser || conversation.state === 'waiting';
  const release: RunEffect[] = phase.releaseWorktree
    ? [{ type: 'releaseWorktree' }]
    : [];
  switch (event.type) {
    case 'session':
      next = { ...run, model: event.model ?? run.model };
      patch.sdkSessionId = event.sessionId;
      break;
    case 'agent':
      effects.push({ type: 'append', role: 'agent', text: event.text });
      break;
    case 'tool':
      effects.push({
        type: 'append',
        role: 'tool',
        text: event.text,
        ...(event.name === undefined
          ? {}
          : { tool: { name: event.name, input: event.input } }),
      });
      break;
    case 'created':
      effects.push({
        type: 'append',
        role: 'created',
        text: `Created ${event.numbers.map((number) => `T${number}`).join(', ')}`,
      });
      break;
    case 'waiting':
      patch.state = event.waiting ? 'waiting' : 'running';
      break;
    case 'turn': {
      const cost = run.costBefore + event.costUsd;
      if (event.error) {
        effects.push({ type: 'append', role: 'error', text: event.error });
      }
      patch.state = 'idle';
      patch.costUsd = cost;
      if (event.usage) {
        effects.push({
          type: 'writeUsage',
          before: run.usageBefore,
          run: event.usage,
        });
      }
      if (run.pending) {
        effects.push({
          type: 'recordOutcome',
          outcome: outcomeOf(
            run,
            run.pending,
            conversation,
            {
              error: event.error,
              errorSubtype: event.errorSubtype,
              waitingOnUser,
              ticket: input.ticket,
              cost,
            },
            now,
          ),
        });
      }
      next = {
        ...run,
        pending: null,
        ticketStatus: input.ticket?.status ?? null,
        // The run stays alive for replies, but no longer works in the
        // worktree of a Ticket that reached Done during the turn (T1232).
        phase: { name: 'alive', releaseWorktree: false },
      };
      // A run that handed off, or whose Ticket went Back to Todo, waits on
      // nobody: its process ends and frees its slot (ADR 0049).
      if (
        phase.name === 'endingAfterTurn' ||
        handedOff(conversation, input.ticket)
      ) {
        next = { ...next, phase: { name: 'ended' } };
        effects.push(...endingProcess);
      }
      effects.push({ type: 'announce' }, ...release);
      return { run: next, patch, effects };
    }
    case 'exit': {
      // A run that ends is interrupted, even between turns: a reply
      // resumes it, but nothing waits on the User (T587).
      effects.push({ type: 'detach' }, { type: 'expireWaits' });
      if (event.error) {
        effects.push({ type: 'append', role: 'error', text: event.error });
      }
      patch.state = 'interrupted';
      if (run.pending) {
        effects.push({
          type: 'recordOutcome',
          outcome: outcomeOf(
            run,
            run.pending,
            conversation,
            {
              error: event.error,
              waitingOnUser,
              ticket: input.ticket,
              cost: conversation.costUsd,
            },
            now,
          ),
        });
      }
      effects.push({ type: 'announce' }, ...release);
      return {
        run: { ...run, pending: null, phase: { name: 'ended' } },
        patch,
        effects,
      };
    }
  }
  effects.push({ type: 'announce' });
  return { run: next, patch, effects };
};

const reply = (
  run: LiveRun,
  conversation: RunConversation,
  input: Extract<LifecycleInput, { type: 'reply' }>,
  now: Date,
): StepResult => ({
  run: {
    ...run,
    pending:
      run.pending ??
      pendingRunOf(
        input.text,
        { ...input, costAtStart: conversation.costUsd },
        now,
      ),
  },
  patch: { state: 'running' },
  effects: [
    { type: 'append', role: input.sentBy, text: input.text },
    { type: 'send', text: input.text },
    { type: 'announce' },
  ],
});

/**
 * Interrupts the run, ends it and marks the Conversation stopped. Its
 * stopped outcome waits for the cost its last turn reports (T587).
 */
const stop = (
  run: LiveRun | null,
  conversation: RunConversation,
  keepWorktree: boolean,
  now: Date,
): StepResult => {
  if (conversation.state === 'stopped') {
    return unchanged(run);
  }
  if (run === null) {
    return {
      run,
      patch: { state: 'stopped' },
      effects: [{ type: 'announce' }],
    };
  }
  const { pending, phase } = run;
  const effects: RunEffect[] = [{ type: 'detach' }];
  if (pending) {
    effects.push({
      type: 'recordOutcome',
      outcome: outcomeOf(
        run,
        pending,
        conversation,
        { stopped: true, ticket: null, cost: conversation.costUsd },
        now,
      ),
    });
  }
  effects.push(
    { type: 'expireWaits' },
    { type: 'announce' },
    { type: 'endProcess', interrupt: true },
  );
  if (
    !keepWorktree &&
    (phase.name === 'alive' || phase.name === 'endingAfterTurn') &&
    phase.releaseWorktree
  ) {
    effects.push({ type: 'releaseWorktree' });
  }
  return {
    run: {
      ...run,
      pending: null,
      phase: {
        name: 'stopped',
        lateCost: pending ? { costAtStart: pending.costAtStart } : null,
      },
    },
    patch: { state: 'stopped' },
    effects,
  };
};

type AlivePhase = Extract<RunPhase, { name: 'alive' | 'endingAfterTurn' }>;

const isAlive = (phase: RunPhase): phase is AlivePhase =>
  phase.name === 'alive' || phase.name === 'endingAfterTurn';

/**
 * A move of the Conversation's Ticket. A Start or Merge whose Ticket just
 * moved Back to Todo or to Done waits on nobody, so its process ends and
 * frees its slot, or ends with its turn when mid-turn (ADR 0049). A Ticket
 * reaching Done frees the Conversation's worktree, or when the run is
 * mid-turn in it, as its turn ends (T1232).
 */
const ticketMoved = (
  run: LiveRun | null,
  conversation: RunConversation,
  status: Status,
): StepResult => {
  let next = run;
  const effects: RunEffect[] = [];
  if (
    next !== null &&
    isAlive(next.phase) &&
    isStartRunIntent(conversation.intent)
  ) {
    const { phase } = next;
    const moved =
      next.ticketStatus !== status && (status === 'Todo' || status === 'Done');
    next = { ...next, ticketStatus: status };
    if (moved && next.pending) {
      next = {
        ...next,
        phase: {
          name: 'endingAfterTurn',
          releaseWorktree: phase.releaseWorktree,
        },
      };
    } else if (moved) {
      next = { ...next, phase: { name: 'ended' } };
      effects.push(...endingProcess, { type: 'announce' });
    }
  }
  if (
    status === 'Done' &&
    conversation.worktreePath !== null &&
    !conversation.worktreeRemoved
  ) {
    if (next?.pending && isAlive(next.phase)) {
      next = { ...next, phase: { ...next.phase, releaseWorktree: true } };
    } else {
      effects.push({ type: 'releaseWorktree' });
    }
  }
  return { run: next, patch: {}, effects };
};

/** An idle run would work in a folder that is gone: it ends with its worktree (T1281). */
const worktreeRemoved = (run: LiveRun | null): StepResult =>
  run === null || run.pending !== null || !isAlive(run.phase)
    ? unchanged(run)
    : {
        run: { ...run, phase: { name: 'ended' } },
        patch: {},
        effects: [...endingProcess],
      };

/**
 * The next state of `run` after `input`, the patch of its Conversation and
 * the effects to apply, in order, at `now`. It does no I/O. `run` is null
 * for a Conversation without a live run.
 */
export function step(
  run: LiveRun | null,
  conversation: RunConversation,
  input: LifecycleInput,
  now: Date,
): StepResult {
  switch (input.type) {
    case 'event': {
      if (run === null) {
        return unchanged(run);
      }
      const { phase } = run;
      switch (phase.name) {
        case 'alive':
        case 'endingAfterTurn':
          return liveEvent(run, phase, conversation, input, now);
        case 'stopped':
          return stoppedEvent(run, phase, input.event);
        case 'ended':
          return unchanged(run);
      }
      break;
    }
    case 'reply':
      return run === null
        ? unchanged(run)
        : reply(run, conversation, input, now);
    case 'stop':
      return stop(run, conversation, input.keepWorktree, now);
    case 'close': {
      // Closed before it stops, so the stop's change already reads as the
      // User's own and Notices raise nothing for it.
      const stopped = stop(run, conversation, false, now);
      return {
        run: stopped.run,
        patch: { hidden: true, ...stopped.patch },
        effects: [
          ...stopped.effects,
          { type: 'announce' },
          { type: 'releaseWorktree' },
        ],
      };
    }
    case 'ticketMoved':
      return ticketMoved(run, conversation, input.status);
    case 'worktreeRemoved':
      return worktreeRemoved(run);
  }
}
