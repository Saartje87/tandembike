import {
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
const workingStates = ['running', 'waiting'];
const liveStates = ['running', 'waiting', 'idle'];

/**
 * Autopilot (ADR 0030): while a Project's switch is on and it has an Active
 * Cycle, it starts a Start Conversation for each Eligible Ticket or Epic, in
 * the Cycle Board's Todo order, up to the Project's free Start run slots.
 * Evaluations run one at a time, so nothing is dispatched twice. It never
 * changes Status or labels, and never retries.
 */
export function createAutopilot({
  tickets,
  conversations,
  changes,
}: AutopilotDeps) {
  let queue: Promise<void> = Promise.resolve();
  const waiting = new Map<number, Promise<void>>();

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

    const running = new Set(
      conversations
        .list({ projectId })
        .filter(
          (conversation) =>
            conversation.intent === 'start' &&
            conversation.ticketNumber !== null &&
            liveStates.includes(conversation.state),
        )
        .map((conversation) => conversation.ticketNumber),
    );
    return todo.filter(
      (ticket) =>
        !ticket.archived &&
        ticket.epic === null &&
        !running.has(ticket.number) &&
        (ticket.type !== 'Epic' ||
          ticket.children.some((child) => !child.archived)),
    );
  };

  const dispatch = async (projectId: number) => {
    const project = tickets.getProject(projectId);
    const settings = tickets.getProjectAgentSettings(projectId);
    if (project.archived || !settings.autopilot) {
      return;
    }
    const cycle = tickets
      .listCycles(projectId)
      .find((candidate) => candidate.state === 'Active');
    if (!cycle) {
      return;
    }
    // At or over the Spend ceiling nothing new starts; the switch stays on and
    // running runs finish. Raising the ceiling or starting the next Cycle (whose
    // spend is zero) lets the next evaluation dispatch again.
    if (
      settings.spendCeilingUsd !== null &&
      conversations.autopilotSpend({ projectId, cycleId: cycle.id }) >=
        settings.spendCeilingUsd
    ) {
      return;
    }
    const working = conversations
      .list({ projectId })
      .filter(
        (conversation) =>
          conversation.intent === 'start' &&
          workingStates.includes(conversation.state),
      ).length;
    const slots = startRunLimit(settings) - working;
    if (slots <= 0) {
      return;
    }
    const commands = tickets.getProjectAgentCommands(projectId);
    for (const ticket of eligible(projectId, cycle.id).slice(0, slots)) {
      try {
        await conversations.start({
          startedBy: 'autopilot',
          ticketNumber: ticket.number,
          intent: 'start',
          prompt: agentCommandMessage('start', ticket, commands),
        });
      } catch {
        // No retries: a refusal, such as a missing repository path, leaves the
        // Ticket for the next change to try again.
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
    } catch {
      return null;
    }
  };

  const evaluate = (projectId: number): Promise<void> => {
    const pending = waiting.get(projectId);
    if (pending) {
      return pending;
    }
    const run = queue.then(async () => {
      waiting.delete(projectId);
      try {
        await dispatch(projectId);
      } catch {
        // A Project that vanished or is unreadable has nothing to dispatch.
      }
    });
    queue = run;
    waiting.set(projectId, run);
    return run;
  };

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
     * Re-evaluates the Project each change touches, and every Project with
     * Autopilot on once now. Returns a function that stops listening.
     */
    start(): () => void {
      const unsubscribe = changes.subscribe((change) => {
        const projectId = projectOf(change);
        if (projectId !== null) {
          void evaluate(projectId);
        }
      });
      for (const project of tickets.listProjects()) {
        void evaluate(project.id);
      }
      return unsubscribe;
    },
  };
}

export type Autopilot = ReturnType<typeof createAutopilot>;
