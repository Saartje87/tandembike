import type { ConversationState } from '../conversations/conversation-state';
import {
  type Conversation,
  type Conversations,
  startRunLimit,
} from '../conversations/conversations';
import { agentCommandMessage } from '../tickets/agent-commands';
import type { ChangeChannel } from '../tickets/changes';
import { isFeedback } from '../tickets/feedback';
import type { Ticket, Tickets } from '../tickets/tickets';
import { triageStateLabels } from '../tickets/triage-labels';
import type {
  AutopilotExplanation,
  AutopilotPauseReason,
  AutoTriagePauseReason,
  Eligibility,
  EngineState,
  NotEligibleReason,
  NotTriageEligibleReason,
} from './explanation';

export type AutopilotDeps = {
  /** Where Projects, Cycles and Tickets are read; Autopilot never writes them. */
  tickets: Tickets;
  /** Where the Start Conversations are started, only through its public interface. */
  conversations: Conversations;
  changes: ChangeChannel;
  /** The clock the triage day is read from; the system clock when left out. */
  now?: () => Date;
};

const readyLabel = 'ready-for-agent';
/** How long a transient end waits before its one automatic resume. */
const transientBackoffMs = 60_000;
const transientResumeText =
  'The last run ended on a transient error. Continue where you left off.';
/** Its run is doing something, or waiting on an answer: it holds its Ticket. */
const workingStates: ConversationState[] = ['running', 'waiting'];

/** Running without a reason, else paused with every one of them. */
function stateOf<Reason>(reasons: Reason[]): EngineState<Reason> {
  return reasons.length === 0
    ? { state: 'running' }
    : { state: 'paused', reasons };
}

/**
 * Autopilot (ADR 0030, ADR 0041): while a Project's switch is on and it has
 * an Active Cycle, it starts a Start Conversation for each Eligible Ticket or
 * Epic, in the Cycle Board's Todo order, up to the Project's free Start run
 * slots and the machine's free slots. One pass covers every Project, and
 * passes run one at a time, so nothing is dispatched twice. It never changes
 * Status or labels, and retries only a transient end, once (ADR 0034): any
 * other Ticket with a Start Conversation that is not closed waits for the
 * User.
 */
export function createAutopilot({
  tickets,
  conversations,
  changes,
  now = () => new Date(),
}: AutopilotDeps) {
  let queue: Promise<void> = Promise.resolve();
  /** Backoff timers by Conversation; a restart drops them (startup resume covers it). */
  const backoffs = new Map<number, ReturnType<typeof setTimeout>>();
  /** The pass that is queued but has not begun; every request shares it. */
  let pendingPass: Promise<void> | null = null;

  /** Runs `step` after the queued ones, logging a failure instead of losing it. */
  const enqueue = (step: () => Promise<void>): Promise<void> => {
    const run = queue.then(async () => {
      try {
        await step();
      } catch (error) {
        console.error('Autopilot step failed', error);
      }
    });
    queue = run;
    return run;
  };

  /** The Project's Start Conversations on a Ticket, in `states` when given. */
  const startConversations = (
    projectId: number,
    states?: ConversationState[],
  ): Conversation[] =>
    conversations
      .list({ projectId })
      .filter(
        (conversation) =>
          conversation.intent === 'start' &&
          conversation.ticketNumber !== null &&
          (states === undefined || states.includes(conversation.state)),
      );

  /**
   * Whether a Start Conversation still holds its Ticket back: one that is not
   * closed does, whatever state its run is in, so a failed run waits for the
   * User. Back to Todo does not close it, so a stopped, interrupted or idle
   * one that predates the Ticket's latest move to Todo no longer counts; a
   * working one always does.
   */
  const holdsTicket = (conversation: Conversation): boolean => {
    if (conversation.hidden) {
      return false;
    }
    if (workingStates.includes(conversation.state)) {
      return true;
    }
    // An Epic's own Status follows its children, so its move shows on them.
    const number = conversation.ticketNumber as number;
    const numbers = [
      number,
      ...tickets.getTicket(number).children.map((child) => child.number),
    ];
    const sentBack = numbers
      .flatMap((n) => tickets.listActivity(n))
      .filter((entry) =>
        entry.changes.some(
          (change) => change.type === 'status' && change.to === 'Todo',
        ),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .at(-1);
    return !sentBack || sentBack.createdAt <= conversation.createdAt;
  };

  /** Every Todo Ticket and Epic of the Project, archived ones too, in Board order. */
  const todoTickets = (projectId: number): Ticket[] => {
    const todo: Ticket[] = [];
    let cursor: number | undefined;
    do {
      const page = tickets.findTickets({
        projectId,
        status: 'Todo',
        includeArchived: true,
        sort: 'position',
        detail: 'full',
        limit: 200,
        ...(cursor === undefined ? {} : { cursor }),
      });
      todo.push(...(page.tickets as Ticket[]));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return todo;
  };

  /** How many machine slots are free now (ADR 0041); never below 0. */
  const machineFree = (): number =>
    Math.max(
      0,
      tickets.getMachineSettings().maxConcurrentRuns -
        conversations.machineSlotsInUse(),
    );

  /** The machine's own Pause reasons (ADR 0041), shared by builds and triage. */
  const machineReasons = (): Extract<
    AutopilotPauseReason,
    { type: 'machineCapFull' | 'overMachineCeiling' }
  >[] => {
    const reasons: Extract<
      AutopilotPauseReason,
      { type: 'machineCapFull' | 'overMachineCeiling' }
    >[] = [];
    if (machineFree() === 0) {
      reasons.push({
        type: 'machineCapFull',
        cap: tickets.getMachineSettings().maxConcurrentRuns,
      });
    }
    const budget = machineBudget();
    if (budget?.paused) {
      reasons.push({
        type: 'overMachineCeiling',
        spendUsd: budget.spendUsd,
        ceilingUsd: budget.ceilingUsd,
      });
    }
    return reasons;
  };

  /**
   * The Project's own room for builds (ADR 0030): its Active Cycle, its free
   * Start run slots, and every Project-level Pause reason. At or over the
   * Spend ceiling nothing new starts; the switch stays on and running runs
   * finish. Raising the ceiling or starting the next Cycle (whose spend is
   * zero) lets the next evaluation go on.
   */
  const projectRoom = (
    projectId: number,
  ): {
    cycleId: number | null;
    slots: number;
    reasons: AutopilotPauseReason[];
  } => {
    const reasons: AutopilotPauseReason[] = [];
    const project = tickets.getProject(projectId);
    const settings = tickets.getProjectAgentSettings(projectId);
    if (project.archived) {
      reasons.push({ type: 'projectArchived' });
    }
    if (!settings.autopilot) {
      reasons.push({ type: 'switchedOff' });
    }
    const cycle = tickets.activeCycle(projectId);
    if (!cycle) {
      reasons.push({ type: 'noActiveCycle' });
    }
    if (settings.spendCeilingUsd === null) {
      reasons.push({ type: 'noSpendCeiling' });
    } else if (cycle) {
      const budget = conversations.spendBudget({
        projectId,
        cycleId: cycle.id,
      });
      if (budget?.paused) {
        reasons.push({
          type: 'overSpendCeiling',
          spendUsd: budget.spendUsd,
          ceilingUsd: budget.ceilingUsd,
        });
      }
    }
    // A Merge the User approved holds a run slot like a Start (T1221), and
    // an idle one waiting on the User keeps it (ADR 0049).
    const working = conversations.startRunSlotsInUse(projectId);
    const limit = startRunLimit(settings);
    const slots = Math.max(0, limit - working);
    if (slots === 0) {
      reasons.push({ type: 'noFreeStartRunSlot', limit });
    }
    return { cycleId: cycle?.id ?? null, slots, reasons };
  };

  /**
   * The Active Cycle and free Start run slots Autopilot may use for the
   * Project now, or null while any Project-level Pause reason holds. The
   * resumes use it; they need no Eligible work.
   */
  const room = (
    projectId: number,
  ): { cycleId: number; slots: number } | null => {
    const open = projectRoom(projectId);
    return open.reasons.length === 0 && open.cycleId !== null
      ? { cycleId: open.cycleId, slots: open.slots }
      : null;
  };

  /**
   * Why each of `todo` is or is not Eligible (GLOSSARY: Eligible), with the
   * Eligible ones numbered in Todo order. `free` is how many could start now.
   */
  const buildEligibility = (
    projectId: number,
    todo: Ticket[],
    cycleId: number | null,
    free: number,
  ): Map<number, Eligibility<NotEligibleReason>> => {
    const held = new Map<number, number>();
    for (const conversation of startConversations(projectId)) {
      if (
        !held.has(conversation.ticketNumber as number) &&
        holdsTicket(conversation)
      ) {
        held.set(conversation.ticketNumber as number, conversation.id);
      }
    }
    const result = new Map<number, Eligibility<NotEligibleReason>>();
    let place = 0;
    for (const ticket of todo) {
      const reasons: NotEligibleReason[] = [];
      if (!ticket.labels.includes(readyLabel)) {
        reasons.push({ type: 'notReady' });
      }
      if (ticket.blocked) {
        reasons.push({
          type: 'blocked',
          blockers: ticket.blockedBy.filter((number) => {
            const blocker = tickets.getTicket(number);
            return blocker.status !== 'Done' && !blocker.archived;
          }),
        });
      }
      if (ticket.claim !== null) {
        reasons.push({ type: 'claimed' });
      }
      if (cycleId === null || ticket.cycle?.id !== cycleId) {
        reasons.push({ type: 'notInActiveCycle' });
      }
      if (ticket.archived) {
        reasons.push({ type: 'archived' });
      }
      if (
        ticket.type === 'Epic' &&
        !ticket.children.some((child) => !child.archived)
      ) {
        reasons.push({ type: 'epicWithoutChildren' });
      }
      if (ticket.epic !== null) {
        reasons.push({ type: 'epicChild', epicNumber: ticket.epic.number });
      }
      const conversationId = held.get(ticket.number);
      if (conversationId !== undefined) {
        reasons.push({ type: 'heldByConversation', conversationId });
      }
      if (reasons.length > 0) {
        result.set(ticket.number, { eligible: false, reasons });
      } else {
        place += 1;
        result.set(ticket.number, {
          eligible: true,
          place,
          fitsFreeSlots: place <= free,
        });
      }
    }
    return result;
  };

  /**
   * Builds: every Pause reason, and why each Todo Ticket is or is not
   * Eligible. The one rule dispatch acts on (ADR 0044).
   */
  const explainBuilds = (projectId: number, todo = todoTickets(projectId)) => {
    const open = projectRoom(projectId);
    const reasons = [...open.reasons, ...machineReasons()];
    const free = reasons.length === 0 ? Math.min(open.slots, machineFree()) : 0;
    const eligibility = buildEligibility(projectId, todo, open.cycleId, free);
    const next = todo.find(
      (ticket) => eligibility.get(ticket.number)?.eligible,
    );
    // Nothing to start is a reason only when nothing else stops it.
    if (!next && reasons.length === 0) {
      reasons.push({ type: 'noEligibleWork' });
    }
    return {
      cycleId: open.cycleId,
      state: stateOf(reasons),
      eligibility,
      next: next ?? null,
    };
  };

  /**
   * Startup: replies to each of Autopilot's own interrupted Start
   * Conversations, oldest first, within the free slots, when its Ticket is in
   * the Active Cycle, not Done and not archived. The User's, and those whose
   * Ticket has moved on, stay interrupted until the User replies. A resumed
   * run is working at once, so the dispatch after it sees its slot taken.
   */
  const resume = async (projectId: number) => {
    const open = room(projectId);
    if (!open) {
      return;
    }
    const interrupted = startConversations(projectId, ['interrupted'])
      .reverse()
      .filter((conversation) => {
        if (conversation.startedBy !== 'autopilot' || conversation.hidden) {
          return false;
        }
        const ticket = tickets.getTicket(conversation.ticketNumber as number);
        return (
          ticket.cycle?.id === open.cycleId &&
          ticket.status !== 'Done' &&
          !ticket.archived
        );
      });
    for (const conversation of interrupted.slice(0, open.slots)) {
      // Read again for each: a resume takes a machine slot.
      if (machineFree() === 0) {
        return;
      }
      try {
        await conversations.reply(
          conversation.id,
          `The server restarted. Continue T${conversation.ticketNumber} from where you left off`,
          'autopilot',
        );
      } catch (error) {
        // Not retried: the Conversation stays interrupted for the User.
        console.error(
          `Autopilot could not resume T${conversation.ticketNumber}`,
          error,
        );
      }
    }
  };

  /**
   * ADR 0034: resumes each open Start Conversation of the Active Cycle whose
   * latest Run outcome is `failed_transient` and a minute old, unless that run
   * was itself an automatic resume (marked on its outcome; the startup resume
   * and the User's reply start the count again). One not yet old enough
   * gets a timer that queues a pass when it is.
   */
  const resumeTransient = async (projectId: number) => {
    const open = room(projectId);
    if (!open) {
      return;
    }
    for (const conversation of startConversations(projectId)) {
      if (conversation.hidden || workingStates.includes(conversation.state)) {
        continue;
      }
      const outcome = conversations.latestRunOutcome(conversation.id);
      if (outcome?.result !== 'failed_transient') {
        continue;
      }
      const resumed = outcome.transientResume;
      const ticket = tickets.getTicket(conversation.ticketNumber as number);
      if (
        resumed ||
        ticket.cycle?.id !== open.cycleId ||
        ticket.status === 'Done' ||
        ticket.archived
      ) {
        continue;
      }
      const wait = outcome.endedAt.getTime() + transientBackoffMs - Date.now();
      if (wait > 0) {
        if (!backoffs.has(conversation.id)) {
          backoffs.set(
            conversation.id,
            setTimeout(() => {
              backoffs.delete(conversation.id);
              void evaluate();
            }, wait),
          );
        }
        continue;
      }
      // Room is read again for each resume: the one before took a slot.
      if (!room(projectId) || machineFree() === 0) {
        break;
      }
      try {
        await conversations.reply(
          conversation.id,
          transientResumeText,
          'autopilot',
          { transientResume: true },
        );
      } catch (error) {
        console.error(
          `Autopilot could not resume T${conversation.ticketNumber}`,
          error,
        );
      }
    }
  };
  /**
   * One turn's build (ADR 0041): starts the Project's first Eligible Ticket
   * when no Pause reason holds, and says whether it did. A refusal, such as a
   * missing repository path, starts nothing; the Ticket has no Conversation,
   * so the next change tries it again.
   */
  const dispatchOne = async (projectId: number): Promise<boolean> => {
    // The Project-level reasons first, so a paused Project reads no Tickets.
    if (room(projectId) === null) {
      return false;
    }
    const builds = explainBuilds(projectId);
    const ticket = builds.next;
    if (builds.state.state !== 'running' || !ticket) {
      return false;
    }
    try {
      await conversations.start({
        startedBy: 'autopilot',
        ticketNumber: ticket.number,
        intent: 'start',
        cycleId: builds.cycleId as number,
        prompt: agentCommandMessage(
          'start',
          ticket,
          tickets.getProjectAgentCommands(projectId),
        ),
      });
      return true;
    } catch (error) {
      console.error(`Autopilot could not start T${ticket.number}`, error);
      return false;
    }
  };

  /**
   * Whether Ticket `number` was proposed on since its latest change into its
   * current state: a triage proposal after the last Activity entry that
   * created it, sent it Back to Todo or added or removed a state label.
   */
  const proposedSinceStateChange = (number: number): boolean => {
    let proposed = false;
    for (const entry of tickets.listActivity(number)) {
      for (const change of entry.changes) {
        if (change.type === 'triageProposed') {
          proposed = true;
        } else if (
          change.type === 'created' ||
          (change.type === 'status' && change.to === 'Todo') ||
          ((change.type === 'labelAdded' || change.type === 'labelRemoved') &&
            (triageStateLabels as readonly string[]).includes(change.label))
        ) {
          proposed = false;
        }
      }
    }
    return proposed;
  };

  /** Auto-triage's Pause reasons other than "no Triage-eligible work" (ADR 0040). */
  const triageRoomReasons = (projectId: number): AutoTriagePauseReason[] => {
    const reasons: AutoTriagePauseReason[] = [];
    const settings = tickets.getProjectAgentSettings(projectId);
    if (tickets.getProject(projectId).archived) {
      reasons.push({ type: 'projectArchived' });
    }
    if (!settings.autoTriage) {
      reasons.push({ type: 'switchedOff' });
    }
    if (settings.triageCeilingUsd === null) {
      reasons.push({ type: 'noTriageCeiling' });
    }
    const working = conversations
      .list({ projectId })
      .find(
        (conversation) =>
          conversation.intent === 'triage' &&
          workingStates.includes(conversation.state),
      );
    if (working) {
      reasons.push({ type: 'triageRunWorking', conversationId: working.id });
    }
    const budget = conversations.triageBudget(projectId, now());
    if (budget?.paused) {
      reasons.push({
        type: 'overTriageCeiling',
        spendUsd: budget.spendUsd,
        ceilingUsd: budget.ceilingUsd,
      });
    }
    reasons.push(...machineReasons());
    return reasons;
  };

  /**
   * Why each of `todo` is or is not Triage-eligible (GLOSSARY:
   * Triage-eligible), the Triage-eligible ones numbered oldest first.
   */
  const triageEligibility = (
    projectId: number,
    todo: Ticket[],
    free: boolean,
  ): Map<number, Eligibility<NotTriageEligibleReason>> => {
    // An open Batch triage holds each Ticket it lists as an open Triage
    // Conversation does its own (T1316).
    const open = new Map<number, number>();
    for (const conversation of conversations.list({ projectId })) {
      if (conversation.hidden) {
        continue;
      }
      const held =
        conversation.intent === 'triage' && conversation.ticketNumber !== null
          ? [conversation.ticketNumber]
          : conversation.intent === 'batch_triage'
            ? (conversation.batchTriageTickets ?? [])
            : [];
      for (const number of held) {
        if (!open.has(number)) {
          open.set(number, conversation.id);
        }
      }
    }
    const oldestFirst = [...todo].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() || a.number - b.number,
    );
    const result = new Map<number, Eligibility<NotTriageEligibleReason>>();
    let place = 0;
    for (const ticket of oldestFirst) {
      const reasons: NotTriageEligibleReason[] = [];
      if (ticket.archived) {
        reasons.push({ type: 'archived' });
      }
      const [state] = ticket.labels.filter((label) =>
        (triageStateLabels as readonly string[]).includes(label),
      );
      if (state !== undefined && state !== 'needs-triage') {
        reasons.push({ type: 'triaged', label: state });
      }
      if (isFeedback(ticket.labels)) {
        reasons.push({ type: 'feedback' });
      }
      const conversationId = open.get(ticket.number);
      if (conversationId !== undefined) {
        reasons.push({ type: 'underTriageConversation', conversationId });
      }
      if (reasons.length === 0 && proposedSinceStateChange(ticket.number)) {
        reasons.push({ type: 'proposed' });
      }
      if (reasons.length > 0) {
        result.set(ticket.number, { eligible: false, reasons });
      } else {
        place += 1;
        result.set(ticket.number, {
          eligible: true,
          place,
          fitsFreeSlots: free && place === 1,
        });
      }
    }
    return result;
  };

  /**
   * Auto-triage: every Pause reason, and why each Todo Ticket is or is not
   * Triage-eligible. The one rule triage acts on (ADR 0044).
   */
  const explainTriage = (projectId: number, todo = todoTickets(projectId)) => {
    const reasons = triageRoomReasons(projectId);
    const eligibility = triageEligibility(
      projectId,
      todo,
      reasons.length === 0,
    );
    const next =
      todo.find((ticket) => {
        const entry = eligibility.get(ticket.number);
        return entry?.eligible === true && entry.place === 1;
      }) ?? null;
    if (!next && reasons.length === 0) {
      reasons.push({ type: 'noTriageEligibleWork' });
    }
    return { state: stateOf(reasons), eligibility, next };
  };

  /**
   * A Board's Batch-triage Tickets (T1316): its Triage-eligible Tickets and
   * Epics, planned in Cycle `cycleId` or, with null, in the Backlog, oldest
   * first. Triage-eligible already leaves out `needs-info`, which waits on
   * the User. No Pause reason applies: the User starts a Batch triage.
   */
  const batchTriageTickets = (
    projectId: number,
    cycleId: number | null,
  ): number[] => {
    const onBoard = todoTickets(projectId).filter(
      (ticket) => (ticket.cycle?.id ?? null) === cycleId,
    );
    return [...triageEligibility(projectId, onBoard, false)]
      .flatMap(([number, entry]) =>
        entry.eligible ? [{ number, place: entry.place }] : [],
      )
      .sort((a, b) => a.place - b.place)
      .map(({ number }) => number);
  };

  /**
   * Auto-triage (ADR 0040): with the switch on, no Triage run working in the
   * Project and today's triage spend under the ceiling, starts one Triage
   * Conversation on the oldest Triage-eligible Ticket. It needs no Active
   * Cycle, records none and takes no Start run slot.
   */
  const triageOne = async (projectId: number): Promise<boolean> => {
    // The Project-level reasons first, so a paused Project reads no Tickets.
    if (triageRoomReasons(projectId).length > 0) {
      return false;
    }
    const triage = explainTriage(projectId);
    const ticket = triage.next;
    if (triage.state.state !== 'running' || !ticket) {
      return false;
    }
    try {
      await conversations.start({
        startedBy: 'autopilot',
        ticketNumber: ticket.number,
        intent: 'triage',
        prompt: agentCommandMessage(
          'triage',
          ticket,
          tickets.getProjectAgentCommands(projectId),
        ),
      });
      return true;
    } catch (error) {
      console.error(`Autopilot could not triage T${ticket.number}`, error);
      return false;
    }
  };

  /**
   * Why Autopilot and Auto-triage start nothing in Project `projectId` now,
   * or that they are running, and for each Todo Ticket or Epic why it is or
   * is not next (ADR 0044). Dispatch and triage act on this same rule.
   */
  const explain = (projectId: number): AutopilotExplanation => {
    const todo = todoTickets(projectId);
    const builds = explainBuilds(projectId, todo);
    const triage = explainTriage(projectId, todo);
    return {
      autopilot: builds.state,
      autoTriage: triage.state,
      tickets: todo.map((ticket) => ({
        number: ticket.number,
        build: builds.eligibility.get(
          ticket.number,
        ) as Eligibility<NotEligibleReason>,
        triage: triage.eligibility.get(
          ticket.number,
        ) as Eligibility<NotTriageEligibleReason>,
      })),
    };
  };

  /** The ids of the Projects a pass covers: the unarchived ones, lowest id first. */
  const projectIds = (): number[] =>
    tickets
      .listProjects()
      .filter((project) => !project.archived)
      .map((project) => project.id);

  /** Runs `step` for one Project, logging a failure so the others still go on. */
  const forProject = async (
    projectId: number,
    step: (projectId: number) => Promise<void>,
  ) => {
    try {
      await step(projectId);
    } catch (error) {
      console.error(`Autopilot step failed in Project ${projectId}`, error);
    }
  };

  /** The Project served last by any pass; in memory, so a restart begins at the lowest id. */
  let lastServed: number | null = null;

  /**
   * Round-robin (ADR 0041): offers each Project one run per turn, its next
   * Eligible build when it has room, else its next Triage-eligible Ticket,
   * starting after the Project served last. Turns go on until the machine's
   * slots run out or no Project took a run; a Project that took none leaves
   * the rest of the pass.
   */
  const roundRobin = async (ids: number[]) => {
    const after = ids.filter((id) => lastServed !== null && id > lastServed);
    let active = [...after, ...ids.filter((id) => !after.includes(id))];
    while (active.length > 0 && machineFree() > 0) {
      const next: number[] = [];
      for (const id of active) {
        if (machineFree() === 0) {
          return;
        }
        let started = false;
        try {
          started = (await dispatchOne(id)) || (await triageOne(id));
        } catch (error) {
          console.error(`Autopilot step failed in Project ${id}`, error);
        }
        if (started) {
          lastServed = id;
          next.push(id);
        }
      }
      active = next;
    }
  };

  /** The timer that queues a pass when the paused day ends. */
  let dayTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Today's Machine ceiling budget (ADR 0041), or null with no ceiling. While
   * it is paused the pass starts and resumes nothing anywhere; running runs
   * finish. Notices read the pause state here.
   */
  const machineBudget = () => conversations.machineBudget(now());

  /** Queues a pass at the next local midnight, once, when the day resets the spend. */
  const wakeNextDay = () => {
    if (dayTimer) {
      return;
    }
    const next = new Date(now());
    next.setHours(24, 0, 0, 0);
    dayTimer = setTimeout(
      () => {
        dayTimer = null;
        void evaluate();
      },
      Math.max(1, next.getTime() - now().getTime()),
    );
  };

  /**
   * One machine-wide pass (ADR 0041): the resumes of every Project first,
   * then the round-robin of builds and triages, all within the machine's free
   * slots and every Project's own limits. The world is read afresh at each
   * step, so a run another step started is counted.
   */
  const runPass = async (startupResume: boolean) => {
    if (machineBudget()?.paused) {
      wakeNextDay();
      return;
    }
    const ids = projectIds();
    if (startupResume) {
      for (const id of ids) {
        await forProject(id, resume);
      }
    }
    for (const id of ids) {
      await forProject(id, resumeTransient);
    }
    await roundRobin(ids);
  };

  const evaluate = (): Promise<void> => {
    if (pendingPass) {
      return pendingPass;
    }
    const run = enqueue(async () => {
      pendingPass = null;
      await runPass(false);
    });
    pendingPass = run;
    return run;
  };

  /** Resumes first, then dispatches, as one queued pass. */
  const startup = (): Promise<void> => enqueue(() => runPass(true));

  return {
    explain,
    batchTriageTickets,

    /**
     * Runs a pass over every Project now. Passes are queued, one finishing
     * before the next begins; one already waiting is shared.
     */
    evaluate,

    /**
     * The Machine ceiling's budget now, or null with no ceiling set; `paused`
     * is true at or over it. The one place that says so (ADR 0041).
     */
    machineBudget,

    /** Resolves once every queued pass has finished. */
    async idle(): Promise<void> {
      let seen: Promise<void>;
      do {
        seen = queue;
        await seen;
      } while (seen !== queue);
    },

    /**
     * Queues a pass on every change, and runs one now that first resumes
     * Autopilot's interrupted Conversations. Returns a function that stops
     * listening.
     */
    start(): () => void {
      const unsubscribe = changes.subscribe((change) => {
        // A Notice is raised from changes Autopilot already saw (ADR 0042).
        if (change.type !== 'notice') {
          void evaluate();
        }
      });
      void startup();
      return () => {
        unsubscribe();
        for (const timer of backoffs.values()) {
          clearTimeout(timer);
        }
        backoffs.clear();
        if (dayTimer) {
          clearTimeout(dayTimer);
          dayTimer = null;
        }
      };
    },
  };
}

export type Autopilot = ReturnType<typeof createAutopilot>;
