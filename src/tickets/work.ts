import type { Cycle, CycleLink } from './cycles';
import { NotAllowedError } from './errors';
import { isPullRequestReference } from './external-reference-display';
import type {
  AddCommentInput,
  Blockers,
  ClaimTicketInput,
  Comment,
  EpicChild,
  FindTicketsInput,
  ProjectAgentSettings,
  ProjectRef,
  Ticket,
  TicketPage,
  UpdateTicketInput,
} from './tickets';

/** Why `nextWork` found nothing. */
export type NoWorkReason =
  | 'no-active-cycle'
  | 'nothing-ready'
  | 'all-blocked-or-claimed';

export type NextWork =
  | { ticket: Ticket; reason?: undefined }
  | { ticket: null; reason: NoWorkReason };

/** Everything an Agent needs to begin a Ticket. */
export type WorkBundle = {
  ticket: Ticket;
  comments: Comment[];
  /** The Ticket's Blockers with their Statuses, resolved ones included. */
  blockers: Blockers['blockedBy'];
  /**
   * The Epic the Ticket is, or is a child of, with its children and the next
   * one to work; `null` for a normal Ticket outside an Epic.
   */
  epic: {
    number: number;
    title: string;
    status: Ticket['status'];
    children: EpicChild[];
    /** The first unfinished, unblocked child in order, or `null`. */
    nextChild: number | null;
  } | null;
  cycle: CycleLink | null;
  /** The Project's Check command, or `null` while unset. */
  checkCommand: string | null;
};

/** The Tickets module's public functions the work functions build on. */
export type WorkDeps = {
  getTicket: (number: number) => Ticket;
  resolveProjectId: (ref: ProjectRef) => number;
  listCycles: (projectId: number) => Cycle[];
  findTickets: (input: FindTicketsInput) => TicketPage;
  claimTicket: (number: number, input: ClaimTicketInput) => Ticket;
  releaseTicketClaim: (
    number: number,
    input: Pick<ClaimTicketInput, 'agentRunId'>,
  ) => Ticket;
  updateTicket: (number: number, input: UpdateTicketInput) => Ticket;
  backToTodo: (number: number) => Ticket;
  listBlockers: (number: number) => Blockers;
  listComments: (number: number) => Comment[];
  addComment: (number: number, input: AddCommentInput) => Comment;
  getProjectAgentSettings: (id: number) => ProjectAgentSettings;
};

const readyLabel = 'ready-for-agent';

/**
 * The workflow functions behind the work tools (T1194): they combine the
 * module's public functions, so they follow the same rules.
 */
export function createWork(deps: WorkDeps) {
  /** The Epic of `ticket` (itself, or its parent), with children read now. */
  function epicBundle(ticket: Ticket): WorkBundle['epic'] {
    const epic =
      ticket.type === 'Epic'
        ? ticket
        : ticket.epic === null
          ? null
          : deps.getTicket(ticket.epic.number);
    if (epic === null) {
      return null;
    }
    const nextChild =
      epic.children.find(
        (child) => !child.archived && !child.blocked && child.status !== 'Done',
      )?.number ?? null;
    return {
      number: epic.number,
      title: epic.title,
      status: epic.status,
      children: epic.children,
      nextChild,
    };
  }

  return {
    /**
     * The top item of Project `ref`'s Active Cycle to work next: Todo,
     * `ready-for-agent`, unblocked, unclaimed (an Epic's Claim covers its
     * children), not archived and not an Epic's child, an Epic only once it
     * has a child, first in Board order. With none, `ticket` is `null` and
     * `reason` says why. It cannot see Conversations (ADR 0004).
     */
    nextWork(ref: ProjectRef): NextWork {
      const projectId = deps.resolveProjectId(ref);
      const active = deps
        .listCycles(projectId)
        .find((cycle) => cycle.state === 'Active');
      if (!active) {
        return { ticket: null, reason: 'no-active-cycle' };
      }
      const ready: Ticket[] = [];
      let cursor: number | undefined;
      do {
        const page = deps.findTickets({
          projectId,
          cycleId: active.id,
          status: 'Todo',
          labels: [readyLabel],
          sort: 'position',
          detail: 'full',
          limit: 200,
          cursor,
        });
        ready.push(...(page.tickets as Ticket[]));
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);

      const candidates = ready.filter(
        (ticket) =>
          ticket.epic === null &&
          (ticket.type === 'Ticket' ||
            ticket.children.some((child) => !child.archived)),
      );
      if (candidates.length === 0) {
        return { ticket: null, reason: 'nothing-ready' };
      }
      const open = candidates.find(
        (ticket) => !ticket.blocked && ticket.claim === null,
      );
      return open
        ? { ticket: open }
        : { ticket: null, reason: 'all-blocked-or-claimed' };
    },

    /**
     * Claims Ticket `number` for `runId` and moves Todo to In progress,
     * except for an Epic, whose Status follows its children. An In progress
     * Ticket is only claimed. A child under its own run's Epic Claim is not
     * claimed again. Refused for a blocked Ticket, naming its unresolved
     * Blockers, and for a Claim another run holds. Returns the bundle.
     */
    startWork(number: number, runId: string): WorkBundle {
      const before = deps.getTicket(number);
      if (before.blocked) {
        const unresolved = deps
          .listBlockers(number)
          .blockedBy.filter(({ resolved }) => !resolved)
          .map(({ number: blocker, status }) => `T${blocker} (${status})`);
        throw new NotAllowedError(
          `Ticket T${number} is blocked by ${unresolved.join(', ')}. Finish ${unresolved.length === 1 ? 'it' : 'them'} first.`,
        );
      }
      const epicClaim =
        before.epic === null
          ? null
          : deps.getTicket(before.epic.number).claim?.agentRunId;
      if (epicClaim !== runId) {
        deps.claimTicket(number, { agentRunId: runId });
      }
      if (before.type === 'Ticket' && before.status === 'Todo') {
        deps.updateTicket(number, { status: 'In progress' });
      }
      const ticket = deps.getTicket(number);
      return {
        ticket,
        comments: deps.listComments(number),
        blockers: deps.listBlockers(number).blockedBy,
        epic: epicBundle(ticket),
        cycle: ticket.cycle,
        checkCommand: deps.getProjectAgentSettings(ticket.projectId)
          .checkCommand,
      };
    },

    /**
     * Gives up Ticket `number` for `runId`: releases its Claim (refused when
     * another run holds it), comments `reason`, and moves In progress back to
     * Todo unless the Ticket has a PR reference. Returns the Ticket.
     */
    abandonWork(number: number, runId: string, reason: string): Ticket {
      const ticket = deps.getTicket(number);
      if (ticket.claim && ticket.claim.agentRunId !== runId) {
        // Refused before anything is written.
        deps.releaseTicketClaim(number, { agentRunId: runId });
      }
      deps.addComment(number, { body: reason, author: 'agent' });
      deps.releaseTicketClaim(number, { agentRunId: runId });
      return ticket.status === 'In progress' &&
        !ticket.externalReferences.some(isPullRequestReference)
        ? deps.backToTodo(number)
        : deps.getTicket(number);
    },
  };
}
