import type { ConversationState } from '../conversations/conversation-state';
import {
  type Conversation,
  type Conversations,
  startRunLimit,
} from '../conversations/conversations';
import { agentCommandMessage } from '../tickets/agent-commands';
import type { Change, ChangeChannel } from '../tickets/changes';
import type { Ticket, Tickets } from '../tickets/tickets';

export type AutopilotDeps = {
  /** Where Projects, Cycles and Tickets are read; Autopilot never writes them. */
  tickets: Tickets;
  /** Where the Start Conversations are started, only through its public interface. */
  conversations: Conversations;
  changes: ChangeChannel;
};

const readyLabel = 'ready-for-agent';
/** Its run is doing something, or waiting on an answer, and holds a slot. */
const workingStates: ConversationState[] = ['running', 'waiting'];

/**
 * Autopilot (ADR 0030): while a Project's switch is on and it has an Active
 * Cycle, it starts a Start Conversation for each Eligible Ticket or Epic, in
 * the Cycle Board's Todo order, up to the Project's free Start run slots.
 * Evaluations run one at a time, so nothing is dispatched twice. It never
 * changes Status or labels, and never retries: a Ticket with a Start
 * Conversation that is not closed waits for the User.
 */
export function createAutopilot({
  tickets,
  conversations,
  changes,
}: AutopilotDeps) {
  let queue: Promise<void> = Promise.resolve();
  const pendingEvaluations = new Map<number, Promise<void>>();

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

  /** The Active Cycle's Eligible work in Todo order (GLOSSARY: Eligible). */
  const eligible = (projectId: number, cycleId: number): Ticket[] => {
    const todo: Ticket[] = [];
    let cursor: number | undefined;
    do {
      const page = tickets.findTickets({
        projectId,
        cycleId,
        status: 'Todo',
        labels: [readyLabel],
        blocked: false,
        claimed: false,
        sort: 'position',
        detail: 'full',
        limit: 200,
        ...(cursor === undefined ? {} : { cursor }),
      });
      todo.push(...(page.tickets as Ticket[]));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    const held = new Set(
      startConversations(projectId)
        .filter(holdsTicket)
        .map((conversation) => conversation.ticketNumber),
    );
    return todo.filter(
      (ticket) =>
        !ticket.archived &&
        ticket.epic === null &&
        !held.has(ticket.number) &&
        (ticket.type !== 'Epic' ||
          ticket.children.some((child) => !child.archived)),
    );
  };

  /**
   * The Active Cycle and free Start run slots Autopilot may use for the
   * Project now, or null with the switch off, no Active Cycle, the Spend
   * ceiling reached or no free slot. At or over the ceiling nothing new
   * starts; the switch stays on and running runs finish. Raising the ceiling
   * or starting the next Cycle (whose spend is zero) lets the next evaluation
   * go on.
   */
  const room = (
    projectId: number,
  ): { cycleId: number; slots: number } | null => {
    const project = tickets.getProject(projectId);
    const settings = tickets.getProjectAgentSettings(projectId);
    if (project.archived || !settings.autopilot) {
      return null;
    }
    const cycle = tickets
      .listCycles(projectId)
      .find((candidate) => candidate.state === 'Active');
    if (!cycle) {
      return null;
    }
    if (
      settings.spendCeilingUsd !== null &&
      conversations.autopilotSpend({ projectId, cycleId: cycle.id }) >=
        settings.spendCeilingUsd
    ) {
      return null;
    }
    const working = startConversations(projectId, workingStates).length;
    const slots = startRunLimit(settings) - working;
    return slots > 0 ? { cycleId: cycle.id, slots } : null;
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

  const dispatch = async (projectId: number) => {
    const open = room(projectId);
    if (!open) {
      return;
    }
    const { cycleId, slots } = open;
    const commands = tickets.getProjectAgentCommands(projectId);
    for (const ticket of eligible(projectId, cycleId).slice(0, slots)) {
      try {
        await conversations.start({
          startedBy: 'autopilot',
          ticketNumber: ticket.number,
          intent: 'start',
          cycleId,
          prompt: agentCommandMessage('start', ticket, commands),
        });
      } catch (error) {
        // A refusal, such as a missing repository path, ends this dispatch;
        // the Ticket has no Conversation, so the next change tries it again.
        console.error(`Autopilot could not start T${ticket.number}`, error);
        return;
      }
    }
  };

  const projectOf = (change: Change): number | null => {
    try {
      switch (change.type) {
        case 'project':
          return change.id;
        case 'cycle':
          return tickets.getCycle(change.id).projectId;
        case 'ticket':
          return tickets.getTicket(change.number).projectId;
        case 'tickets':
          return change.numbers.length === 0
            ? null
            : tickets.getTicket(change.numbers[0]).projectId;
        case 'conversation':
          return conversations.get(change.id).projectId;
      }
    } catch (error) {
      console.error('Autopilot could not place a change in a Project', error);
      return null;
    }
  };

  const evaluate = (projectId: number): Promise<void> => {
    const pending = pendingEvaluations.get(projectId);
    if (pending) {
      return pending;
    }
    const run = enqueue(async () => {
      pendingEvaluations.delete(projectId);
      await dispatch(projectId);
    });
    pendingEvaluations.set(projectId, run);
    return run;
  };

  /** Resumes first, then dispatches, as one queued step. */
  const startup = (projectId: number): Promise<void> =>
    enqueue(async () => {
      await resume(projectId);
      await dispatch(projectId);
    });

  return {
    /**
     * Dispatches the Project's Eligible work now. Evaluations are queued, one
     * finishing before the next begins; one already waiting is shared.
     */
    evaluate,

    /** Resolves once every queued evaluation has finished. */
    async idle(): Promise<void> {
      let seen: Promise<void>;
      do {
        seen = queue;
        await seen;
      } while (seen !== queue);
    },

    /**
     * Re-evaluates the Project each change touches, and for every Project
     * resumes Autopilot's interrupted Conversations, then dispatches, once
     * now. Returns a function that stops listening.
     */
    start(): () => void {
      const unsubscribe = changes.subscribe((change) => {
        const projectId = projectOf(change);
        if (projectId !== null) {
          void evaluate(projectId);
        }
      });
      for (const project of tickets.listProjects()) {
        void startup(project.id);
      }
      return unsubscribe;
    },
  };
}

export type Autopilot = ReturnType<typeof createAutopilot>;
