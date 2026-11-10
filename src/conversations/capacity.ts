import {
  type ConversationIntent,
  type ConversationStarter,
  type ConversationState,
  isTerminal,
} from './conversation-state';

/**
 * Run capacity (GLOSSARY: Run capacity): whether another run may start now
 * and why not. A Project's Start run slots, the Machine slots, the live Agent
 * processes Autopilot's headroom counts, and Auto-triage's one working Triage
 * run, with who holds each. Pure functions over a snapshot of the live
 * Conversations, which the Conversations module builds: `capacityOf` gives
 * the numbers, `verdictOf` decides, and `refusalOf` words a refusal. Every
 * caller renders from the same verdict (ADR 0044).
 */

/** What capacity reads of a live Conversation. */
export type CapacityConversation = {
  id: number;
  projectId: number;
  ticketNumber: number | null;
  intent: ConversationIntent;
  state: ConversationState;
  startedBy: ConversationStarter;
};

export type CapacitySnapshot = {
  /**
   * Every live Conversation: each whose run is alive in this server, and
   * every open Terminal Conversation, each once.
   */
  conversations: CapacityConversation[];
  /** The Machine cap (ADR 0041). */
  machineCap: number;
  /** The asked Project's Parallel runs setting (ADR 0049). */
  parallelRuns: boolean;
};

/** A Conversation holding a slot, and whether it waits on the User (T1331). */
export type SlotHolder = {
  id: number;
  ticketNumber: number | null;
  waitingOnUser: boolean;
};

export type ProjectCapacity = {
  parallelRuns: boolean;
  /** How many Start run slots the Project allows at once (`startRunLimit`). */
  limit: number;
  slotsHeld: number;
  /** The Start run slot holders, oldest first. */
  holders: SlotHolder[];
  /** The newest Triage run of the Project that works, by its id, or null. */
  triageRunning: number | null;
};

export type Capacity<Project = ProjectCapacity | null> = {
  machine: {
    cap: number;
    /** The Machine slots held: what refusals count (ADR 0041, ADR 0049). */
    slotsHeld: number;
    /** The Machine slot holders, oldest first. */
    holders: SlotHolder[];
  };
  /**
   * Every live Agent process, what Autopilot's headroom counts (T1329). It is
   * wider than the Machine slots on purpose: it adds the User's own live
   * runs, idle ones included, and every open Terminal Conversation, which
   * hold no slot and are never refused, but load the machine all the same.
   * Split into those working and those waiting on the User (T1332).
   */
  liveProcesses: { working: number; waiting: number };
  /** How many live Agent processes there are, working and waiting. */
  liveProcessCount: number;
  project: Project;
};

/**
 * What wants to run: a Conversation intent starting or resuming a run,
 * `reply` for the User's reply, or `autoTriage` for a Triage Auto-triage
 * would start.
 */
export type CapacityIntent = ConversationIntent | 'reply' | 'autoTriage';

export type Verdict =
  | { ok: true }
  | { ok: false; by: 'projectSlot'; holders: SlotHolder[] }
  | { ok: false; by: 'machineCap'; cap: number; holders: SlotHolder[] }
  | { ok: false; by: 'triageRunning'; conversationId: number };

/** The states of a run whose process may be alive. */
const liveStates: ConversationState[] = ['running', 'waiting', 'idle'];

/** Its run is doing something, or waiting on an answer. */
const workingStates: ConversationState[] = ['running', 'waiting'];

/** A Start and a Merge are the intents that count as Start runs (T1221). */
export const isStartRunIntent = (intent: CapacityIntent) =>
  intent === 'start' || intent === 'merge';

/** Idle after its turn, or waiting on a permission or a Widget (T1332). */
const waitsOnUser = (conversation: { state: ConversationState }) =>
  conversation.state === 'idle' || conversation.state === 'waiting';

/**
 * Whether a Conversation holds one of its Project's Start run slots: a Start
 * or a Merge whose run is live, running, waiting on a permission or idle
 * waiting for the User's reply (ADR 0049). A Terminal Conversation has no run
 * in the server and holds none (ADR 0039). Only runs whose process is alive
 * are in a snapshot: an idle one whose process ended after a handoff holds
 * none, nor does an interrupted one.
 */
export const holdsStartRunSlot = (conversation: {
  intent: ConversationIntent;
  state: ConversationState;
  startedBy: ConversationStarter;
}): boolean =>
  !isTerminal(conversation) &&
  isStartRunIntent(conversation.intent) &&
  liveStates.includes(conversation.state);

/**
 * Whether a Conversation holds a machine slot (ADR 0041, ADR 0049): a live
 * Start or Merge, or a working Triage Autopilot started, not a Terminal one.
 * The User's own interactive Conversations hold none.
 */
export const holdsMachineSlot = (conversation: {
  intent: ConversationIntent;
  state: ConversationState;
  startedBy: ConversationStarter;
}): boolean =>
  holdsStartRunSlot(conversation) ||
  (!isTerminal(conversation) &&
    conversation.intent === 'triage' &&
    conversation.startedBy === 'autopilot' &&
    workingStates.includes(conversation.state));

/**
 * How many slot-holding Start runs a Project allows at once (ADR 0049): one
 * with Parallel runs off, else the Machine cap, the one number for load.
 */
export const startRunLimit = (
  settings: { parallelRuns: boolean },
  machineCap: number,
) => (settings.parallelRuns ? machineCap : 1);

const holdersOf = (conversations: CapacityConversation[]): SlotHolder[] =>
  [...conversations]
    .sort((a, b) => a.id - b.id)
    .map((conversation) => ({
      id: conversation.id,
      ticketNumber: conversation.ticketNumber,
      waitingOnUser: waitsOnUser(conversation),
    }));

/**
 * The live Agent processes (T1329): the Machine slot holders, the User's own
 * live runs (Spec, Plan, Ask, Spar, Setup, Retro, New Ticket, Triage, Batch
 * triage), idle ones included, and every open Terminal Conversation, which
 * works in the User's terminal and counts as working. A Triage Autopilot
 * started counts only while it works, as its slot does.
 */
const liveProcessesOf = (conversations: CapacityConversation[]) => {
  let working = 0;
  let waiting = 0;
  for (const conversation of conversations) {
    if (
      conversation.startedBy === 'autopilot' &&
      !holdsMachineSlot(conversation)
    ) {
      continue;
    }
    if (isTerminal(conversation)) {
      working += 1;
    } else if (waitsOnUser(conversation)) {
      waiting += 1;
    } else {
      working += 1;
    }
  }
  return { working, waiting };
};

/** The Run capacity of the machine and, given `projectId`, of that Project. */
export function capacityOf(
  snapshot: CapacitySnapshot,
  projectId: number,
): Capacity<ProjectCapacity>;
export function capacityOf(snapshot: CapacitySnapshot): Capacity<null>;
export function capacityOf(
  snapshot: CapacitySnapshot,
  projectId?: number,
): Capacity {
  const machineHolders = holdersOf(
    snapshot.conversations.filter(holdsMachineSlot),
  );
  const machine = {
    cap: snapshot.machineCap,
    slotsHeld: machineHolders.length,
    holders: machineHolders,
  };
  const liveProcesses = liveProcessesOf(snapshot.conversations);
  const liveProcessCount = liveProcesses.working + liveProcesses.waiting;
  if (projectId === undefined) {
    return { machine, liveProcesses, liveProcessCount, project: null };
  }
  const own = snapshot.conversations.filter(
    (conversation) => conversation.projectId === projectId,
  );
  const holders = holdersOf(own.filter(holdsStartRunSlot));
  const triage = own
    .filter(
      (conversation) =>
        conversation.intent === 'triage' &&
        workingStates.includes(conversation.state),
    )
    .sort((a, b) => b.id - a.id)[0];
  return {
    machine,
    liveProcesses,
    liveProcessCount,
    project: {
      parallelRuns: snapshot.parallelRuns,
      limit: startRunLimit(snapshot, snapshot.machineCap),
      slotsHeld: holders.length,
      holders,
      triageRunning: triage?.id ?? null,
    },
  };
}

/**
 * Whether `intent` may run now in the Project `capacity` was taken for. A
 * Start or a Merge is refused beyond the Project's Start run limit or at the
 * Machine cap, not queued (ADR 0019, ADR 0041); with Parallel runs on, the
 * Machine cap is the Project's only limit. The User's reply is never refused
 * (ADR 0031), and the interactive intents are never limited. Auto-triage
 * waits while a Triage run of the Project works (ADR 0040). `exceptId` is
 * the Conversation about to work, not counted against itself.
 */
export const verdictOf = (
  capacity: Capacity<ProjectCapacity>,
  intent: CapacityIntent,
  exceptId?: number,
): Verdict => {
  if (intent === 'autoTriage') {
    const conversationId = capacity.project.triageRunning;
    return conversationId === null
      ? { ok: true }
      : { ok: false, by: 'triageRunning', conversationId };
  }
  if (!isStartRunIntent(intent)) {
    return { ok: true };
  }
  const others = (holders: SlotHolder[]) =>
    holders.filter((holder) => holder.id !== exceptId);
  const project = others(capacity.project.holders);
  if (!capacity.project.parallelRuns && project.length >= 1) {
    return { ok: false, by: 'projectSlot', holders: project };
  }
  const machine = others(capacity.machine.holders);
  if (machine.length >= capacity.machine.cap) {
    return {
      ok: false,
      by: 'machineCap',
      cap: capacity.machine.cap,
      holders: machine,
    };
  }
  return { ok: true };
};

/**
 * The holders, each named by its Ticket (`T12`) or, without one, as
 * `Conversation 7`, marked when it waits on the User (T1331).
 */
const namesOf = (holders: SlotHolder[]): string => {
  const names = holders.map((holder) => {
    const name =
      holder.ticketNumber === null
        ? `Conversation ${holder.id}`
        : `T${holder.ticketNumber}`;
    return holder.waitingOnUser ? `${name} (waiting on you)` : name;
  });
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

/**
 * What a refused run tells the User: the limit and the Conversations holding
 * its slots, marking those waiting on the User. Null when nothing blocks.
 */
export const refusalOf = (verdict: Verdict): string | null => {
  if (verdict.ok) {
    return null;
  }
  switch (verdict.by) {
    case 'projectSlot':
      return `This Project already has a Start run working: ${namesOf(verdict.holders)}. Answer, stop or close it first, or turn on Parallel runs in the Project settings to allow more.`;
    case 'machineCap':
      return `The machine runs its cap of ${verdict.cap} ${verdict.cap === 1 ? 'run' : 'runs'}, held by ${namesOf(verdict.holders)}. Wait for one to finish, answer or close one, or raise the cap in Settings.`;
    case 'triageRunning':
      return `A Triage run is already working in this Project: Conversation ${verdict.conversationId}.`;
  }
};
