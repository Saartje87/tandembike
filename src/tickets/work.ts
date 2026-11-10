import type { Cycle, CycleLink } from './cycles';
import { NotAllowedError } from './errors';
import { isPullRequestReference } from './external-reference-display';
import { type MergeMode, mergeModeOf } from './merge-mode';
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
    /**
     * The first child in order not yet started (not archived, Done or In
     * progress) whose Blockers are resolved, counting In progress siblings as
     * resolved; or `null`.
     */
    nextChild: number | null;
  } | null;
  cycle: CycleLink | null;
  /** The Project's Check command, or `null` while unset. */
  checkCommand: string | null;
  /**
   * Whether to merge the PR yourself (`auto`) or hand off at the Merge gate
   * (`approve`): the Project's Auto-merge when the Claim was taken, the
   * Epic's Claim for a child under it (ADR 0043).
   */
  merge: MergeMode;
};

/** The Tickets module's public functions the work functions build on. */
export type WorkDeps = {
  getTicket: (number: number) => Ticket;
  resolveProjectId: (ref: ProjectRef) => number;
  activeCycle: (projectId: number) => Cycle | null;
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
  claimMergeMode: (number: number) => MergeMode | null;
  addExternalReferences: (number: number, references: string[]) => Ticket;
  /** Runs `run` all or nothing: a thrown refusal undoes every write in it. */
  transaction: <T>(run: () => T) => T;
};

const readyLabel = 'ready-for-agent';

/**
 * The workflow functions behind the work tools (T1194): they combine the
 * module's public functions, so they follow the same rules.
 */
export function createWork(deps: WorkDeps) {
  /**
   * Ticket `number`'s unresolved Blockers. With `epic`, a Blocker that is an
   * In progress child of it counts as resolved: worked on the Epic branch.
   */
  function unresolvedBlockers(number: number, epic: Ticket | null) {
    const siblings = new Set(epic?.children.map((child) => child.number));
    return deps
      .listBlockers(number)
      .blockedBy.filter(
        ({ number: blocker, resolved, status }) =>
          !resolved && !(siblings.has(blocker) && status === 'In progress'),
      );
  }

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
        (child) =>
          !child.archived &&
          child.status === 'Todo' &&
          unresolvedBlockers(child.number, epic).length === 0,
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
      const active = deps.activeCycle(projectId);
      if (!active) {
        return { ticket: null, reason: 'no-active-cycle' };
      }
      const listAll = (extra: Partial<FindTicketsInput>): Ticket[] => {
        const found: Ticket[] = [];
        let cursor: number | undefined;
        do {
          const page = deps.findTickets({
            projectId,
            sort: 'position',
            detail: 'full',
            limit: 200,
            cursor,
            ...extra,
          });
          found.push(...(page.tickets as Ticket[]));
          cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);
        return found;
      };
      const ready = listAll({
        cycleId: active.id,
        status: 'Todo',
        labels: [readyLabel],
      });
      // An Epic planned elsewhere joins this Board as the row holding its
      // children planned here (ADR 0025): it follows the Cycle's own rows.
      const here = new Set(ready.map(({ number }) => number));
      const elsewhere = new Set(
        listAll({ cycleId: active.id })
          .map(({ epic }) => epic?.number)
          .filter((n): n is number => n !== undefined && !here.has(n)),
      );
      for (const number of elsewhere) {
        const epic = deps.getTicket(number);
        if (
          !epic.archived &&
          epic.type === 'Epic' &&
          epic.status === 'Todo' &&
          epic.labels.includes(readyLabel)
        ) {
          ready.push(epic);
        }
      }

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
     * Blockers (under its run's Epic Claim, an In progress sibling is not
     * one), and for a Claim another run holds. Returns the bundle.
     */
    startWork(number: number, runId: string): WorkBundle {
      const before = deps.getTicket(number);
      const epic =
        before.epic === null ? null : deps.getTicket(before.epic.number);
      const epicClaim = epic?.claim?.agentRunId;
      // The Claim holder is named before the Blockers (stories 8, 9).
      if (
        epicClaim !== runId &&
        before.claim &&
        before.claim.agentRunId !== runId
      ) {
        deps.claimTicket(number, { agentRunId: runId });
      }
      // Under its own Epic Claim, a sibling In progress is worked on the
      // Epic branch, so it no longer holds the child back (T1278).
      const unresolved = unresolvedBlockers(
        number,
        epicClaim === runId ? epic : null,
      ).map(({ number: blocker, status }) => `T${blocker} (${status})`);
      if (unresolved.length > 0) {
        throw new NotAllowedError(
          `Ticket T${number} is blocked by ${unresolved.join(', ')}. Finish ${unresolved.length === 1 ? 'it' : 'them'} first.`,
        );
      }
      deps.transaction(() => {
        if (epicClaim !== runId) {
          deps.claimTicket(number, { agentRunId: runId });
        }
        if (before.type === 'Ticket' && before.status === 'Todo') {
          deps.updateTicket(number, { status: 'In progress' });
        }
      });
      const ticket = deps.getTicket(number);
      const settings = deps.getProjectAgentSettings(ticket.projectId);
      return {
        ticket,
        comments: deps.listComments(number),
        blockers: deps.listBlockers(number).blockedBy,
        epic: epicBundle(ticket),
        cycle: ticket.cycle,
        checkCommand: settings.checkCommand,
        merge:
          deps.claimMergeMode(
            epicClaim === runId && epic ? epic.number : number,
          ) ?? mergeModeOf(settings.autoMerge),
      };
    },

    /**
     * Gives up Ticket `number` for `runId`: releases its Claim (refused when
     * another run holds it), comments `reason`, and moves In progress back to
     * Todo unless the Ticket has a PR reference. Returns the Ticket.
     */
    abandonWork(number: number, runId: string, reason: string): Ticket {
      const ticket = deps.getTicket(number);
      if (ticket.claim?.agentRunId !== runId) {
        if (ticket.claim) {
          // Another run's Claim: the release refuses, naming the holder.
          deps.releaseTicketClaim(number, { agentRunId: runId });
        }
        const epic = ticket.epic && deps.getTicket(ticket.epic.number);
        if (epic && epic.claim?.agentRunId === runId) {
          throw new NotAllowedError(
            `Ticket T${number} is covered by your Claim on Epic T${epic.number}: abandon the Epic instead.`,
          );
        }
        throw new NotAllowedError(
          `Ticket T${number} has no Claim of Agent run ${runId} to abandon.`,
        );
      }
      return deps.transaction(() => {
        deps.addComment(number, { body: reason, author: 'agent' });
        deps.releaseTicketClaim(number, { agentRunId: runId });
        return ticket.status === 'In progress' &&
          !ticket.externalReferences.some(isPullRequestReference)
          ? deps.backToTodo(number)
          : deps.getTicket(number);
      });
    },

    /**
     * Adds `url` to Ticket `number`'s External references and, for a hand-off
     * by `runId`, releases that run's Claim in the same transaction, so a
     * refused release (another run holds it) leaves no reference behind.
     */
    linkPullRequest(number: number, url: string, runId?: string): Ticket {
      return deps.transaction(() => {
        const linked = deps.addExternalReferences(number, [url]);
        return runId === undefined
          ? linked
          : deps.releaseTicketClaim(number, { agentRunId: runId });
      });
    },
  };
}
