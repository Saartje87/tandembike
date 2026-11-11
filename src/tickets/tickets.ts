import { and, asc, eq, inArray } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import {
  ticketAcceptanceCriteria,
  ticketAttachments,
  ticketBlockers,
  ticketComments,
  ticketLabels,
  tickets,
  triageProposals,
} from '../db/schema';
import {
  type ActivityEntry,
  type Actor,
  type AutoMerge,
  activityOf,
  autoMergesSince,
  deleteActivity,
} from './activity';
import type { AgentKind } from './agent-kind';
import type { AgentRunMode } from './agent-run-mode';
import {
  type AddAttachmentInput,
  type Attachment,
  attachmentColumns,
  checkAttachmentCount,
  checkedAttachment,
  deleteAttachments,
  type StoredAttachment,
} from './attachments';
import { type ChangeChannel, createChangeChannel } from './changes';
import { createClaims } from './claims';
import { type CycleLink, createCycles, leaveAllCycles } from './cycles';
import type { EpicLink } from './epic-link';
import {
  checkChildrenArchived,
  checkEpicNotArchived,
  createEpics,
} from './epics';
import {
  type BatchFailure,
  NotAllowedError,
  NotFoundError,
  UncheckedCriteriaError,
  type UncheckedCriterion,
} from './errors';
import { isPullRequestReference } from './external-reference-display';
import { deleteExternalReferences } from './external-references';
import type { LaneScope } from './lanes';
import { createMachineSettings } from './machine-settings';
import type { OriginLink, SplitOffTicket } from './origins';
import type { PaletteColor } from './palette';
import type { ProjectIcon } from './project-icons';
import { createProjects } from './projects';
import {
  createReferenceTemplates,
  type ReferenceTemplateInput,
} from './reference-templates';
import {
  checkBatchNumbers,
  maxCommentLength,
  maxOverrideLength,
  throwFieldErrors,
} from './rules';
import { createStats } from './stats';
import type { Status } from './status';
import { createTicketChanges } from './ticket-changes';
import { createTicketCreation } from './ticket-creation';
import { createTicketOrder } from './ticket-order';
import { createTicketReads } from './ticket-reads';
import { createTicketRowContext } from './ticket-row-context';
import { checkTicketChanges } from './ticket-rules';
import type { TicketType } from './ticket-type';
import { triageStateLabels } from './triage-labels';
import { createTriageProposals } from './triage-proposals';
import { createWork } from './work';

export {
  maxAcceptanceCriteria,
  maxAcceptanceCriterionLength,
  maxCommentLength,
  maxDescriptionLength,
  maxLabelLength,
  maxOverrideLength,
} from './rules';
// The limits are the rules file's; callers keep reading them from the facade.
export {
  defaultPageSize,
  maxPageSize,
  parseTimestamp,
  ticketSummary,
} from './ticket-reads';

export type Project = {
  id: number;
  name: string;
  /** A colour from the palette, set by the User, or `null` for none. */
  color: PaletteColor | null;
  /** One of the Project icons, set by the User, or `null` for the default. */
  icon: ProjectIcon | null;
  /** Hidden from the normal views, and read-only with its Tickets. */
  archived: boolean;
  createdAt: Date;
};

export type CreateProjectInput = {
  name: string;
  /** Saved with the Project, by the rules of the agent settings. */
  repositoryPath?: string;
  checkCommand?: string | null;
  /** A Reference template added with the Project. */
  referenceTemplate?: ReferenceTemplateInput;
};

export type RenameProjectInput = { name: string };

/** A new colour and/or icon for a Project; `null` clears one. */
export type StyleProjectInput = {
  color?: PaletteColor | null;
  icon?: ProjectIcon | null;
};

/**
 * A Project's settings for Agent runs. Only the User sets them, so they are
 * not part of `Project`, which the MCP tools show (ADR 0019).
 */
export type ProjectAgentSettings = {
  /** An absolute directory where runs start, or `null` while unset. */
  repositoryPath: string | null;
  /** The command that defines green for the repository, or `null` while unset. */
  checkCommand: string | null;
  /** The command run in each new worktree before its run starts, or `null` while unset. */
  prepareCommand: string | null;
  /**
   * Whether Start runs may overlap, each in a worktree of its own: off allows
   * one at a time, on up to the Machine cap (ADR 0049).
   */
  parallelRuns: boolean;
  /** Whether the title fields create through a Conversation. */
  agentMode: boolean;
  /** The permission mode of every run the Project starts (ADR 0029). */
  runMode: AgentRunMode;
  /** The run and triage models of each Agent kind (ADR 0051). */
  models: AgentModels;
  /** Whether Autopilot starts the Active Cycle's Eligible work (ADR 0030). */
  autopilot: boolean;
  /** What Autopilot may spend on one Cycle, in dollars; `null` while unset. */
  spendCeilingUsd: number | null;
  /** The same in GitHub AI credits, for Copilot runs (ADR 0051); `null` while unset. */
  spendCeilingAiCredits: number | null;
  /** Whether Autopilot starts Triage runs on Triage-eligible Tickets (ADR 0040). */
  autoTriage: boolean;
  /** What Auto-triage may spend per local calendar day, in dollars; `null` while unset. */
  triageCeilingUsd: number | null;
  /** The same in GitHub AI credits, for Copilot runs (ADR 0051); `null` while unset. */
  triageCeilingAiCredits: number | null;
  /** Whether the run that opened a PR merges it itself (ADR 0043). */
  autoMerge: boolean;
  /** The Agent kind new Conversations start on (ADR 0051). */
  defaultAgentKind: AgentKind;
};

/** One Agent kind's models; a blank is that agent's own default. */
export type AgentModel = {
  /** The model its runs start on, or `null` for the agent's own default. */
  runModel: string | null;
  /** The model Triage runs start on, or `null` for the run model. */
  triageModel: string | null;
};

export type AgentModels = Record<AgentKind, AgentModel>;

export type SetProjectAgentSettingsInput = Partial<
  Omit<ProjectAgentSettings, 'models'>
> & {
  /** Models to change, by Agent kind; a field left out stays as it is. */
  models?: { [Kind in AgentKind]?: Partial<AgentModel> };
};

/**
 * A Project by its id, its name (ignoring case and surrounding spaces) or
 * both, when they name the same Project.
 */
export type ProjectRef = {
  projectId?: number;
  projectName?: string;
  /**
   * A folder, such as an Agent's working directory: it names the Project whose
   * repository contains it, when neither a name nor an id is given.
   */
  cwd?: string;
};

export type Tickets = ReturnType<typeof createTickets>;

export type Ticket = {
  number: number;
  title: string;
  /** Markdown; empty when the Ticket has none. */
  description: string;
  status: Status;
  /** Fixed at creation: a normal Ticket, or an Epic grouping children. */
  type: TicketType;
  /** An Epic's colour from the palette; always `null` for a normal Ticket. */
  color: PaletteColor | null;
  /** The Epic this Ticket is a child of, or `null` when it has none. */
  epic: EpicLink | null;
  /**
   * An Epic's children, archived ones included, by Ticket number; always
   * empty for a normal Ticket.
   */
  children: EpicChild[];
  /** The Ticket this one was split from (ADR 0015), or `null`. */
  origin: OriginLink | null;
  /** The Tickets split from this one, archived ones included, by number. */
  splitOff: SplitOffTicket[];
  /**
   * The Cycle whose Board it shows on (ADR 0013): the Prepared or Active one
   * it is planned into, else for a Done Ticket the most recently archived
   * one that kept it, else `null` for the Backlog.
   */
  cycle: CycleLink | null;
  projectId: number;
  /** The Agent-run ID that filed it through `file_tickets`, or `null`. */
  filedByRun?: string | null;
  position: number;
  archived: boolean;
  /** Trimmed, lower-cased and sorted; empty when the Ticket has none. */
  labels: string[];
  /**
   * URLs or keys pointing to the same work elsewhere, trimmed, in the order
   * they were added; empty when the Ticket has none.
   */
  externalReferences: string[];
  /** Files added to the Ticket (ADR 0018), in the order added, without content. */
  attachments: Attachment[];
  /** The numbers of the Ticket's Blockers, sorted, resolved ones included. */
  blockedBy: number[];
  /**
   * Whether any Blocker is unresolved by the Blocker rule: neither Done,
   * archived, nor an In progress sibling under its Epic's Claim (T828).
   */
  blocked: boolean;
  /** The Agent run holding this Ticket's claim, or `null` when unclaimed. */
  claim: TicketClaim | null;
  /** In order; empty when the Ticket has none (ADR 0007). */
  acceptanceCriteria: AcceptanceCriterion[];
  createdAt: Date;
  updatedAt: Date;
};

/** A child Ticket as its Epic lists it. */
export type EpicChild = Pick<
  Ticket,
  'number' | 'title' | 'status' | 'archived' | 'blockedBy' | 'blocked'
> & {
  /**
   * How many of its acceptance criteria are not checked, so a run can see
   * what is left before finishing the Epic without reading each child (T1226).
   */
  uncheckedCriteria: number;
};

export type AcceptanceCriterion = {
  id: number;
  /** One line, trimmed and never empty. */
  text: string;
  checked: boolean;
};

export type TicketClaim = {
  agentRunId: string;
  agentName: string | null;
};

export type ClaimTicketInput = {
  agentRunId: string;
  agentName?: string;
};

export type CreateTicketInput = {
  projectId: number;
  title: string;
  description?: string;
  /** Defaults to Todo. */
  status?: Status;
  /** Defaults to none. */
  labels?: string[];
  /** In order; defaults to none. */
  externalReferences?: string[];
  /** In order; defaults to none. Each starts unchecked unless `checked`. */
  acceptanceCriteria?: NewAcceptanceCriterion[];
  /** A Cycle of the same Project to plan it into; defaults to none. */
  cycleId?: number;
  /** Fixed once created. Defaults to a normal Ticket. */
  type?: TicketType;
  /**
   * An Epic's colour. Defaults to the colour fewest live Epics in the
   * Project use; a normal Ticket has none.
   */
  color?: PaletteColor;
  /** An Epic of the same Project to create it under; defaults to none. */
  epicNumber?: number;
  /** The Ticket it was split from, in any Project; defaults to none. */
  originNumber?: number;
};

export type NewAcceptanceCriterion = Pick<AcceptanceCriterion, 'text'> & {
  /** Defaults to false. */
  checked?: boolean;
};

/** Tickets, and Epics, to create in one Project, all or none. */
export type CreateTicketBatchInput = {
  projectId: number;
  /** An Epic of the same Project to create them all under. */
  epicNumber?: number;
  /** The Ticket they were all split from, in any Project. */
  originNumber?: number;
  /** A Cycle of the same Project to plan them all into. */
  cycleId?: number;
  /**
   * The Agent run filing the batch (`X-Tandembike-Run`). Recorded on every
   * Ticket, and it caps the feedback Tickets the run may file. Without it
   * nothing is capped.
   */
  filedByRun?: string;
  /** In order, from 1 to `maxBatchSize` of them. */
  tickets: BatchTicketInput[];
};

/** One Ticket of a batch: the fields of `CreateTicketInput` that apply. */
export type BatchTicketInput = Pick<
  CreateTicketInput,
  | 'title'
  | 'description'
  | 'status'
  | 'labels'
  | 'externalReferences'
  | 'acceptanceCriteria'
  | 'type'
  | 'color'
> & {
  /**
   * The positions, from 0, of the earlier Tickets in the batch that block
   * this one. Defaults to none.
   */
  blockedByPositions?: number[];
  /**
   * Existing Tickets, in any Project, that block this one, by the rules for
   * adding a Blocker. Defaults to none.
   */
  blockedByNumbers?: number[];
  /**
   * The position, from 0, of an earlier Epic in the batch to create this
   * Ticket under. Not with the batch's `epicNumber`, and not for an Epic.
   */
  epicPosition?: number;
  /**
   * The position, from 0, of an earlier Ticket in the batch this one was
   * split from. Not with the batch's `originNumber`.
   */
  originPosition?: number;
  /**
   * An existing Ticket, in any Project, this one was split from. Not with
   * `originPosition` or the batch's `originNumber`.
   */
  originNumber?: number;
};

/** How `completeTicket` treats unchecked acceptance criteria (ADR 0043). */
export type CompleteTicketOptions = {
  /**
   * Why to finish anyway: completes despite unchecked criteria and posts the
   * reason, naming them, as a comment by the actor.
   */
  override?: string;
};

/** Any subset of a Ticket's editable fields; missing ones stay as they are. */
export type UpdateTicketInput = {
  title?: string;
  description?: string;
  status?: Status;
  projectId?: number;
  /** An Epic's new colour; a normal Ticket has none. */
  color?: PaletteColor;
  /** The Ticket it was split from, in any Project, or `null` for none. */
  originNumber?: number | null;
  /** Labels to add, after `removeLabels` are removed. */
  addLabels?: string[];
  /** Labels to remove, ignoring case and ones the Ticket does not have. */
  removeLabels?: string[];
  /** External references to add, after `removeExternalReferences`. */
  addExternalReferences?: string[];
  /** External references to remove; ones the Ticket does not have are ignored. */
  removeExternalReferences?: string[];
  /**
   * The Ticket's whole list of acceptance criteria, in order. Ones left out
   * are removed.
   */
  acceptanceCriteria?: AcceptanceCriterionInput[];
};

/**
 * A Ticket's whole change: its fields, then the steps `updateTicket` applies
 * after them. Missing ones stay as they are.
 */
export type TicketChange = UpdateTicketInput & {
  /** The Epic to make it a child of, or `null` to take it out of its Epic. */
  epicNumber?: number | null;
  /** Tickets that must be resolved before it can start. */
  addBlockers?: number[];
  /** Tickets to stop blocking it; ones that do not are ignored. */
  removeBlockers?: number[];
  /** The Cycle to plan or move it into, or `null` for the Backlog. */
  cycleId?: number | null;
  /** With `cycleId`, take an Epic's unarchived children along. */
  withChildren?: boolean;
  /** `true` archives it last; `false` restores it first. */
  archived?: boolean;
  /** Move it on the Board directly before this Ticket. */
  before?: number;
  /** Move it on the Board directly after this Ticket. */
  after?: number;
};

/**
 * A Ticket after `updateTicket`, and with `withChildren` the children whose
 * Cycle changed with it.
 */
export type UpdatedTicket = Ticket & { childrenMoved?: number[] };

/**
 * A criterion in a replacement list: one of the Ticket's by `id`, or a new
 * one without. A kept criterion keeps its checked state when `checked` is
 * left out, unless its text changes, which unchecks it.
 */
export type AcceptanceCriterionInput = NewAcceptanceCriterion & {
  id?: number;
};

/** A new checked state for one of a Ticket's acceptance criteria. */
export type AcceptanceCriterionCheckedInput = Pick<
  AcceptanceCriterion,
  'id' | 'checked'
>;

/** The same Status and label change for each of `ticketNumbers`. */
export type UpdateTicketsInput = Pick<
  UpdateTicketInput,
  'status' | 'color' | 'addLabels' | 'removeLabels'
> & {
  /** Explicit Ticket numbers, each once, at most `maxBatchSize`. */
  ticketNumbers: number[];
};

/** How `archiveTicket` and `archiveTickets` treat an Epic's children. */
export type ArchiveTicketOptions = {
  /**
   * Archive an Epic's children that are not archived along with it,
   * instead of refusing the Epic while they are; restoring the Epic brings
   * them back. Defaults to false. Only the User does this: no MCP tool
   * passes it.
   */
  withChildren?: boolean;
};

/** How `deleteTicket` treats an Epic's children. */
export type DeleteTicketOptions = {
  /** Delete the children too, instead of detaching them. Defaults to false. */
  withChildren?: boolean;
};

/** Which Tickets a batch update changed and which it did not, and why. */
export type UpdateTicketsResult = {
  /** The changed Tickets, in the order given. */
  updated: Ticket[];
  /** The Tickets left unchanged, in the order given. */
  failed: BatchFailure[];
};

export type ReorderTicketsInput = LaneScope & {
  /** Every Ticket in the scope, each once, in their new order. */
  ticketNumbers: number[];
};

/**
 * Where `reorderTicket` puts a Ticket: directly before or directly after
 * another Ticket of its lane.
 */
export type ReorderAnchor = { before: number } | { after: number };

export type SortLaneInput = LaneScope & {
  /**
   * The Tickets to put on top of the scope, each once, at most
   * `maxBatchSize`, in the order given.
   */
  ticketNumbers: number[];
};

export type MoveTicketsInput = {
  projectId: number;
  /** The Tickets to move, each once, at most `maxBatchSize`, in the order they land in. */
  ticketNumbers: number[];
  status: Status;
  /**
   * The Ticket in the `status` lane they land just before, or `null` for the
   * end of the lane.
   */
  before: number | null;
};

export type ListTicketsFilter = {
  projectId?: number;
  /** Only Tickets in this Status, or in any of these Statuses. */
  status?: Status | readonly Status[];
  /** Only Tickets that have every one of these labels, ignoring case. */
  labels?: string[];
  /**
   * Also list archived Tickets, and Tickets of archived Projects, which are
   * left out by default unless `projectId` names their Project.
   */
  includeArchived?: boolean;
  /**
   * Only Tickets with an unresolved Blocker when true, or only Tickets with
   * none when false: ready to start, by their Blockers.
   */
  blocked?: boolean;
  /** Only Tickets that are claimed when true, or unclaimed when false. */
  claimed?: boolean;
  /**
   * Only the Tickets planned into this Cycle, or with `null`, only those in
   * no Prepared or Active Cycle: the Backlog, Done ones included.
   */
  cycleId?: number | null;
  /** Only the Tickets split from this Ticket: whose Origin it is. */
  originNumber?: number;
  /** Only normal Tickets, or only Epics. */
  type?: TicketType;
  /** Only the children of this Epic. */
  epicNumber?: number;
};

/** `projectName` names the Project in place of, or as well as, `projectId`. */
export type FindTicketsInput = ListTicketsFilter &
  ProjectRef & {
    /**
     * Only Tickets whose title or description contains this, trimmed and
     * ignoring (ASCII) case.
     */
    query?: string;
    /**
     * Only Tickets with at least one of these External references, each
     * trimmed and matched exactly.
     */
    externalReferences?: string[];
    /** At most this many Tickets, from 1 to `maxPageSize`; `defaultPageSize` if left out. */
    limit?: number;
    /** List the Tickets after this Ticket number: a previous page's `nextCursor`. */
    cursor?: number;
    /** How much of each Ticket to list; defaults to `summary`. */
    detail?: TicketDetail;
    /** The order to list them in; defaults to `created`. */
    sort?: TicketSort;
    /**
     * Only Tickets created or changed at or after this ISO 8601 timestamp,
     * which needs a time zone. An Epic also counts as changed when one of its
     * children was created, attached, detached or changed since.
     */
    changedSince?: string;
  };

/**
 * The orders `findTickets` lists Tickets in: oldest-created first, or Board
 * order, lane by lane in Status order. Board order needs one Project.
 */
export const ticketSorts = ['created', 'position'] as const;

export type TicketSort = (typeof ticketSorts)[number];

/**
 * How much of each Ticket `findTickets` lists: a short `TicketSummary`, or
 * the whole Ticket.
 */
export const ticketDetails = ['summary', 'full'] as const;

export type TicketDetail = (typeof ticketDetails)[number];

/**
 * A Ticket as `findTickets` lists it by default: its number, title, Status,
 * labels and whether it is blocked, plus its Project unless the search was
 * for one Project.
 */
export type TicketSummary = Pick<
  Ticket,
  'number' | 'title' | 'status' | 'labels' | 'blocked'
> &
  Partial<Pick<Ticket, 'projectId'>>;

/**
 * A `TicketSummary` as `find_tickets` lists it: always with its type and
 * updated time, and with `epicNumber`, the Epic it is a child of, or `null`.
 */
export type ListedTicketSummary = TicketSummary &
  Pick<Ticket, 'type' | 'updatedAt'> & { epicNumber: number | null };

/** One page of `findTickets`. */
export type TicketPage = {
  /** Whole Tickets when `detail` is `full`. */
  tickets: ListedTicketSummary[] | Ticket[];
  /** The `cursor` for the next page, or `null` on the last page. */
  nextCursor: number | null;
  /** How many Tickets match the filters, over all pages. */
  total: number;
};

/** Who wrote a Comment: the UI writes `user`, MCP writes `agent`. */
export type CommentAuthor = Actor;

export type Comment = {
  id: number;
  ticketNumber: number;
  author: CommentAuthor;
  /** Markdown, trimmed and never empty. */
  body: string;
  createdAt: Date;
  /** When the comment was last edited, or `null` if it never was. */
  editedAt: Date | null;
};

/** A blocking relationship: `blocker` must be resolved before `blocked` is ready. */
export type BlockerInput = { blocker: number; blocked: number };

/** A Ticket on the other side of a blocking relationship. */
export type RelatedTicket = Pick<
  Ticket,
  'number' | 'title' | 'status' | 'projectId' | 'archived'
> & {
  /**
   * For a Blocker, whether the Blocker rule resolves it (Done, archived, or
   * an In progress sibling under its Epic's Claim, T828); for a Ticket it
   * blocks, whether that Ticket is Done or archived.
   */
  resolved: boolean;
};

/** A Ticket's blocking relationships, each list by Ticket number. */
export type Blockers = {
  /** The Ticket's Blockers. */
  blockedBy: RelatedTicket[];
  /** The Tickets it is a Blocker of. */
  blocks: RelatedTicket[];
};

export type AddCommentInput = { body: string; author: CommentAuthor };

export type EditCommentInput = {
  body: string;
  /** Who is editing; an Agent may only edit an Agent's comment. */
  by: CommentAuthor;
};

export type RemoveCommentInput = Pick<EditCommentInput, 'by'>;

export type RemoveAttachmentInput = {
  /** Who is removing; an Agent may only remove an Agent's Attachment. */
  by: Actor;
};

/** A comment body trimmed, or a `ValidationError` if it is empty or too long. */
function checkedCommentBody(rawBody: string): string {
  const body = rawBody.trim();
  throwFieldErrors({
    body:
      body === ''
        ? 'Enter a comment.'
        : body.length > maxCommentLength
          ? `Keep the comment to ${maxCommentLength.toLocaleString('en-US')} characters or fewer.`
          : undefined,
  });
  return body;
}

/** An override reason trimmed, or a `ValidationError` if blank or too long. */
function checkedOverride(rawOverride: string): string {
  const override = rawOverride.trim();
  throwFieldErrors({
    override:
      override === ''
        ? 'Give a reason for finishing with unchecked acceptance criteria.'
        : override.length > maxOverrideLength
          ? `Keep the override reason to ${maxOverrideLength.toLocaleString('en-US')} characters or fewer.`
          : undefined,
  });
  return override;
}

/** The comment an override posts: the reason and the criteria it skipped. */
function overrideComment(
  override: string,
  unchecked: UncheckedCriterion[],
): string {
  return [
    'Finished with unchecked acceptance criteria:',
    '',
    ...unchecked.map(({ number, text }) => `- T${number}: ${text}`),
    '',
    `Reason: ${override}`,
  ].join('\n');
}

const commentColumns = {
  id: ticketComments.id,
  ticketNumber: ticketComments.ticketNumber,
  author: ticketComments.author,
  body: ticketComments.body,
  createdAt: ticketComments.createdAt,
  editedAt: ticketComments.editedAt,
};

/**
 * The Tickets module: the only code that reads or writes Projects and
 * Tickets (ADR 0004). It validates input, persists to `db`, and announces
 * every change on `changes`. Errors it throws on purpose are `TicketsError`s
 * whose messages can be shown to the User or an Agent as-is.
 *
 * Without a `changes` channel it gets a private one; the app passes
 * `appChangeChannel()` so every caller shares the same announcements.
 *
 * Every change it makes to a Ticket is recorded as Activity by `actor`:
 * Server Actions pass `user` and the MCP route `agent` (ADR 0009).
 */
export function createTickets(
  db: DatabaseConnection,
  actor: Actor,
  changes: ChangeChannel = createChangeChannel(),
) {
  const ctx = createTicketRowContext(db, actor, changes);
  const {
    transaction,
    getTicket,
    publishWith,
    applyTicketChanges,
    recordActivity,
    touchTicket,
    syncEpicStatus,
    checkTicketWritable,
    checkTicketProjectWritable,
  } = ctx;
  const cycles = createCycles(ctx);
  const referenceTemplates = createReferenceTemplates(ctx);
  const projectsArea = createProjects(ctx, {
    addReferenceTemplate: referenceTemplates.addReferenceTemplate,
  });
  const epics = createEpics(ctx);
  const order = createTicketOrder(ctx);
  const rest = {
    /**
     * Back to Todo, the User's action on a parked Ticket (ADR 0024): Status
     * becomes Todo at the end of the Todo order and any Claim is released,
     * with its labels kept, as one Activity entry. An archived Ticket or one
     * in an archived Project is refused. It checks nothing outside the module,
     * such as GitHub or Conversations. For an Epic, its Claim is released
     * first and every unarchived In progress child becomes Todo the same way,
     * all or nothing; Done and archived children stay, and the Epic's Status
     * follows. The Epic and its changed children are announced once.
     */
    backToTodo(number: number): Ticket {
      const todo = checkTicketChanges({ status: 'Todo' });
      const { type, children } = getTicket(number);
      checkTicketWritable(number);
      if (type === 'Epic') {
        return changeEpicChildren(
          number,
          children.filter(
            (child) => !child.archived && child.status === 'In progress',
          ),
          todo,
        );
      }

      const { changedEpic } = applyTicketChanges(number, todo, {
        releaseClaim: true,
      });
      publishWith(number, changedEpic);
      return getTicket(number);
    },

    /**
     * The completion rule (docs/agents/issue-tracker.md), the one place that
     * applies it: Ticket `number` becomes Done, loses its triage state label
     * (never `wontfix` or a category label), and its Claim is released, with
     * one Activity entry. For an Epic, every unarchived child is completed
     * the same way, all or nothing, and the Epic loses its own state label;
     * its Status follows its children.
     */
    completeTicket(
      number: number,
      options: CompleteTicketOptions = {},
    ): Ticket {
      const override =
        options.override === undefined
          ? undefined
          : checkedOverride(options.override);
      const stateLabels = { removeLabels: [...triageStateLabels] };
      const done = checkTicketChanges({ status: 'Done', ...stateLabels });
      const { type, children } = getTicket(number);
      checkTicketWritable(number);
      const unchecked = uncheckedCriteriaOf(number);
      if (unchecked.length > 0 && override === undefined) {
        throw new UncheckedCriteriaError(unchecked);
      }
      const pullRequest = autoMergedPullRequest(number);
      const recordOverride = () => {
        if (unchecked.length > 0 && override !== undefined) {
          insertComment(number, overrideComment(override, unchecked));
        }
        if (pullRequest !== null) {
          recordActivity(number, [{ type: 'autoMerged', pullRequest }]);
        }
      };

      if (type === 'Epic') {
        return changeEpicChildren(
          number,
          children.filter((child) => !child.archived),
          done,
          checkTicketChanges(stateLabels),
          recordOverride,
        );
      }
      const { changedEpic } = db.transaction(() => {
        recordOverride();
        return applyTicketChanges(number, done);
      });
      publishWith(number, changedEpic);
      return getTicket(number);
    },

    /**
     * The auto-merges recorded at or after `since`, oldest first, for the
     * Notices module's `auto_merged` kind (ADR 0043).
     */
    autoMergesSince(since: Date): AutoMerge[] {
      return autoMergesSince(db, since);
    },

    /**
     * The acceptance criteria the completion rule would refuse Ticket
     * `number` for: its own unchecked ones and, for an Epic, those of every
     * unarchived child, each with its Ticket. Empty when it may complete.
     */
    uncheckedCriteria(number: number): UncheckedCriterion[] {
      getTicket(number);
      return uncheckedCriteriaOf(number);
    },

    /** The comments on Ticket `number`, oldest first. */
    listComments(number: number): Comment[] {
      getTicket(number);
      return db
        .select(commentColumns)
        .from(ticketComments)
        .where(eq(ticketComments.ticketNumber, number))
        .orderBy(asc(ticketComments.id))
        .all();
    },

    /**
     * Ticket `number`'s Activity, oldest first, whether or not it is
     * archived.
     */
    listActivity(number: number): ActivityEntry[] {
      getTicket(number);
      return activityOf(db, number);
    },

    /** Adds a Markdown comment by `author` to Ticket `number`. */
    addComment(number: number, input: AddCommentInput): Comment {
      const body = checkedCommentBody(input.body);
      getTicket(number);
      checkTicketProjectWritable(number);
      const comment = db
        .insert(ticketComments)
        .values({
          ticketNumber: number,
          author: input.author,
          body,
          createdAt: new Date(),
        })
        .returning(commentColumns)
        .get();
      changes.publish({ type: 'ticket', number });
      return comment;
    },

    /**
     * Replaces comment `id`'s body by the rules for adding one and sets its
     * edited time; the author and created time stay.
     */
    editComment(id: number, input: EditCommentInput): Comment {
      const body = checkedCommentBody(input.body);
      const { ticketNumber } = editableComment(id, input.by);
      checkTicketProjectWritable(ticketNumber);
      const comment = db
        .update(ticketComments)
        .set({ body, editedAt: new Date() })
        .where(eq(ticketComments.id, id))
        .returning(commentColumns)
        .get();
      changes.publish({ type: 'ticket', number: ticketNumber });
      return comment;
    },

    /**
     * Deletes comment `id` for good (ADR 0006), by the same rule for who
     * may as editing it.
     */
    removeComment(id: number, { by }: RemoveCommentInput): void {
      const { ticketNumber } = editableComment(id, by);
      checkTicketProjectWritable(ticketNumber);
      db.delete(ticketComments).where(eq(ticketComments.id, id)).run();
      changes.publish({ type: 'ticket', number: ticketNumber });
    },

    /**
     * Adds a file to Ticket `number` (ADR 0018) and returns its metadata. The
     * name is trimmed; the media type comes from the input, else the name's
     * extension. Recorded as Activity in the same transaction.
     */
    addAttachment(number: number, input: AddAttachmentInput): Attachment {
      const { name, mediaType } = checkedAttachment(input);
      const attachment = db.transaction(() => {
        checkTicketProjectWritable(number);
        touchTicket(number);
        checkAttachmentCount(db, number);
        const added = db
          .insert(ticketAttachments)
          .values({
            ticketNumber: number,
            name,
            mediaType,
            size: input.content.byteLength,
            author: input.author,
            content: Buffer.from(input.content),
            createdAt: new Date(),
          })
          .returning(attachmentColumns)
          .get();
        recordActivity(number, [{ type: 'attachmentAdded', name }]);
        return added;
      });
      changes.publish({ type: 'ticket', number });
      return attachment;
    },

    /** Attachment `id` with its metadata and content. */
    getAttachment(id: number): StoredAttachment {
      const attachment = db
        .select({ ...attachmentColumns, content: ticketAttachments.content })
        .from(ticketAttachments)
        .where(eq(ticketAttachments.id, id))
        .get();
      if (!attachment) {
        throw new NotFoundError(`There is no Attachment ${id}.`);
      }
      return attachment;
    },

    /**
     * Deletes Attachment `id` for good (ADR 0018), by the Comment rule: the
     * User may remove any, an Agent only one an Agent added. Recorded as
     * Activity naming the file, in the same transaction.
     */
    removeAttachment(id: number, { by }: RemoveAttachmentInput): void {
      const attachment = db
        .select({
          ticketNumber: ticketAttachments.ticketNumber,
          name: ticketAttachments.name,
          author: ticketAttachments.author,
        })
        .from(ticketAttachments)
        .where(eq(ticketAttachments.id, id))
        .get();
      if (!attachment) {
        throw new NotFoundError(`There is no Attachment ${id}.`);
      }
      if (by === 'agent' && attachment.author !== 'agent') {
        throw new NotAllowedError(
          `Attachment ${id} was added by the User. Agents can only remove Attachments added by an Agent.`,
        );
      }
      db.transaction(() => {
        checkTicketProjectWritable(attachment.ticketNumber);
        touchTicket(attachment.ticketNumber);
        db.delete(ticketAttachments).where(eq(ticketAttachments.id, id)).run();
        recordActivity(attachment.ticketNumber, [
          { type: 'attachmentRemoved', name: attachment.name },
        ]);
      });
      changes.publish({ type: 'ticket', number: attachment.ticketNumber });
    },

    /**
     * Archives Ticket `number`: it leaves the normal views but keeps
     * everything, so restoring brings it back (ADR 0003). An Epic is refused
     * while any child is not archived, unless `withChildren` archives those
     * children with it, whatever their Status or Claims, all or nothing.
     */
    archiveTicket(number: number, options: ArchiveTicketOptions = {}): Ticket {
      const affected = db.transaction(() => archiveStep([number], options));
      publishWith(number, ...affected);
      return getTicket(number);
    },

    /**
     * `archiveTicket` for each of `ticketNumbers`, all or nothing: if any
     * cannot be archived, none is. An Epic is archived after its children
     * in the list, whatever their order. The change is announced once, with
     * the children archived with an Epic and the Epics whose Status changed.
     */
    archiveTickets(
      ticketNumbers: number[],
      options: ArchiveTicketOptions = {},
    ): void {
      throwFieldErrors({ ticketNumbers: checkBatchNumbers(ticketNumbers) });

      const affected = db.transaction(() =>
        archiveStep(ticketNumbers, options),
      );
      changes.publish({ type: 'tickets', numbers: affected });
    },

    /**
     * Brings archived Ticket `number` back exactly as it was. An Epic brings
     * back the children archived with it, but not ones archived before it
     * or detached since.
     */
    restoreTicket(number: number): Ticket {
      const affected = db.transaction(() => {
        const changedEpic = setArchivedStep(number, false);
        const children = db
          .select({ number: tickets.number })
          .from(tickets)
          .where(
            and(
              eq(tickets.epicNumber, number),
              eq(tickets.archived, true),
              eq(tickets.archivedWithEpic, true),
            ),
          )
          .orderBy(asc(tickets.number))
          .all()
          .map((child) => child.number);
        const changedEpics = children.map((child) =>
          setArchivedStep(child, false),
        );
        return [...children, changedEpic, ...changedEpics];
      });
      publishWith(number, ...affected);
      return getTicket(number);
    },

    /**
     * Destroys Ticket `number` for good (ADR 0012), whatever its Status,
     * archived or claimed; its number is never used again. Its labels,
     * External references, Activity, Comments, acceptance criteria and Blockers on both sides go
     * with it, and it leaves every Cycle, Archived ones included. The Tickets it
     * blocked and its Epic are bumped, and the Epic's Status is derived
     * again. The Tickets split from it lose their Origin and stay. An Epic's
     * children, archived ones included, are detached and
     * kept, or with `withChildren` deleted by the same rules, all in one
     * transaction. Only the User deletes: no MCP tool calls this.
     */
    deleteTicket(
      number: number,
      { withChildren = false }: DeleteTicketOptions = {},
    ): void {
      const { children, unblocked, epic, leftCycles, unlinked } =
        db.transaction(() => {
          checkTicketProjectWritable(number);
          const { epic, children } = getTicket(number);
          const childNumbers = children.map((child) => child.number);
          if (!withChildren) {
            db.update(tickets)
              .set({
                epicNumber: null,
                archivedWithEpic: false,
                updatedAt: new Date(),
              })
              .where(eq(tickets.epicNumber, number))
              .run();
          }
          const deleted = withChildren ? [...childNumbers, number] : [number];
          const removals = deleted.map((doomed) => removeTicket(db, doomed));
          const unblocked = [
            ...new Set(removals.flatMap((removal) => removal.unblocked)),
          ].filter((blocked) => !deleted.includes(blocked));
          for (const blocked of unblocked) {
            touchTicket(blocked);
          }
          for (const { origin } of removals) {
            if (origin != null && !deleted.includes(origin)) {
              touchTicket(origin);
            }
          }
          if (epic !== null) {
            touchTicket(epic.number);
            syncEpicStatus(epic.number);
          }
          return {
            children: childNumbers,
            unblocked,
            epic,
            leftCycles: [
              ...new Set(removals.flatMap((removal) => removal.leftCycles)),
            ],
            // Split-off Tickets that stay, and Origins that lose one.
            unlinked: removals
              .flatMap(({ unlinked, origin }) => [
                ...unlinked,
                ...(origin == null ? [] : [origin]),
              ])
              .filter((other) => !deleted.includes(other)),
          };
        });
      changes.publish({
        type: 'tickets',
        numbers: [
          ...new Set([
            number,
            ...children,
            ...unblocked,
            ...(epic === null ? [] : [epic.number]),
            ...unlinked,
          ]),
        ],
      });
      for (const id of leftCycles) {
        changes.publish({ type: 'cycle', id });
      }
    },
  };
  const ticketChanges = createTicketChanges(ctx, {
    restoreTicket: rest.restoreTicket,
    archiveTicket: rest.archiveTicket,
    moveToEpic: epics.moveToEpic,
    detachFromEpic: epics.detachFromEpic,
    moveTicketsToCycle: cycles.moveTicketsToCycle,
    reorderTicket: order.reorderTicket,
  });
  const core = {
    transaction,
    ...cycles,
    ...referenceTemplates,
    ...createStats(ctx),
    ...projectsArea,

    /** Calls `listener` after every change; returns an unsubscribe. */
    subscribe: changes.subscribe,
    ...createTicketReads(ctx),
    ...createClaims(ctx),
    ...createTicketCreation(ctx),
    ...epics,
    ...ticketChanges,
    ...order,
    ...rest,
  };
  return {
    ...core,
    ...createTriageProposals(ctx, {
      updateTicket: core.updateTicket,
      addComment: core.addComment,
      createTicketBatch: core.createTicketBatch,
      archiveTicket: core.archiveTicket,
    }),
    ...createMachineSettings(ctx),
    ...createWork(ctx, {
      resolveProjectId: core.resolveProjectId,
      activeCycle: core.activeCycle,
      findTickets: core.findTickets,
      claimTicket: core.claimTicket,
      releaseTicketClaim: core.releaseTicketClaim,
      updateTicket: core.updateTicket,
      backToTodo: core.backToTodo,
      listBlockers: core.listBlockers,
      listComments: core.listComments,
      addComment: core.addComment,
      getProjectAgentSettings: core.getProjectAgentSettings,
      claimMergeMode: core.claimMergeMode,
      addExternalReferences: core.addExternalReferences,
    }),
  };

  /**
   * The Epic sequence Merged and Back to Todo share: the Epic's Claim is
   * released first, recorded on the Epic with `epicChange` (no change by
   * default), before the children's changes would clear it silently; then
   * `change` is applied to each of `selected`, all in one transaction. The
   * Epic and the changed children are announced once. `before` runs first in
   * the same transaction.
   */
  function changeEpicChildren(
    epic: number,
    selected: { number: number }[],
    change: ReturnType<typeof checkTicketChanges>,
    epicChange = checkTicketChanges({}),
    before: () => void = () => {},
  ): Ticket {
    db.transaction(() => {
      before();
      applyTicketChanges(epic, epicChange, { releaseClaim: true });
      for (const child of selected) {
        applyTicketChanges(child.number, change);
      }
    });
    changes.publish({
      type: 'tickets',
      numbers: [epic, ...selected.map((child) => child.number)],
    });
    return getTicket(epic);
  }

  /**
   * The PR an Agent completing Ticket `number` now merged by Auto-merge
   * (ADR 0043): its latest PR reference, when the actor is an Agent and its
   * Claim was taken with `auto`; otherwise `null`. Approve merge finishes a
   * handed-off Ticket, which has no Claim, and Merged is the User's.
   */
  function autoMergedPullRequest(number: number): string | null {
    if (actor !== 'agent') {
      return null;
    }
    const row = db
      .select({
        claimAgentRunId: tickets.claimAgentRunId,
        claimMerge: tickets.claimMerge,
      })
      .from(tickets)
      .where(eq(tickets.number, number))
      .get();
    if (row?.claimAgentRunId == null || row.claimMerge !== 'auto') {
      return null;
    }
    return (
      getTicket(number).externalReferences.findLast(isPullRequestReference) ??
      null
    );
  }

  /**
   * Ticket `number`'s unchecked criteria and its unarchived children's. A
   * Ticket already Done is past the rule, so finishing it again is a no-op
   * check, as `finish_work` is idempotent.
   */
  function uncheckedCriteriaOf(number: number): UncheckedCriterion[] {
    const { acceptanceCriteria, children, status } = getTicket(number);
    const own =
      status === 'Done'
        ? []
        : acceptanceCriteria
            .filter(({ checked }) => !checked)
            .map(({ text }) => ({ number, text }));
    return [
      ...own,
      ...children
        .filter((child) => !child.archived && child.status !== 'Done')
        .flatMap((child) =>
          getTicket(child.number)
            .acceptanceCriteria.filter(({ checked }) => !checked)
            .map(({ text }) => ({ number: child.number, text })),
        ),
    ];
  }

  /** Adds a comment by the module's actor; run it in a transaction. */
  function insertComment(number: number, body: string) {
    db.insert(ticketComments)
      .values({
        ticketNumber: number,
        author: actor,
        body,
        createdAt: new Date(),
      })
      .run();
  }

  /**
   * Comment `id`, if `by` may edit or remove it: the User may change any
   * comment, an Agent only an Agent's.
   */
  function editableComment(id: number, by: CommentAuthor) {
    const comment = db
      .select({
        ticketNumber: ticketComments.ticketNumber,
        author: ticketComments.author,
      })
      .from(ticketComments)
      .where(eq(ticketComments.id, id))
      .get();
    if (!comment) {
      throw new NotFoundError(`There is no comment ${id}.`);
    }
    if (by === 'agent' && comment.author !== 'agent') {
      throw new NotAllowedError(
        `Comment ${id} was written by the User. Agents can only edit or remove comments written by an Agent.`,
      );
    }
    return comment;
  }

  /**
   * The change of `archiveTickets`, without its transaction or
   * announcement: archives `numbers`, their Epics last, and with
   * `withChildren` the Epics' other children that are not archived. Children
   * archived in the same step as their Epic are marked so that restoring it
   * brings them back. Returns every Ticket archived and the Epics whose
   * Status changed, without repeats.
   */
  function archiveStep(
    numbers: number[],
    { withChildren = false }: ArchiveTicketOptions,
  ): number[] {
    const epicNumbers = new Set(
      db
        .select({ number: tickets.number })
        .from(tickets)
        .where(and(inArray(tickets.number, numbers), eq(tickets.type, 'Epic')))
        .all()
        .map((epic) => epic.number),
    );
    // Every child of these Epics archived now is archived with its Epic.
    const archivedWithEpic = new Set(
      epicNumbers.size === 0
        ? []
        : db
            .select({ number: tickets.number })
            .from(tickets)
            .where(
              and(
                inArray(tickets.epicNumber, [...epicNumbers]),
                eq(tickets.archived, false),
              ),
            )
            .orderBy(asc(tickets.number))
            .all()
            .map((child) => child.number),
    );
    const unlistedChildren = withChildren
      ? [...archivedWithEpic].filter((child) => !numbers.includes(child))
      : [];
    const childrenFirst = [
      ...numbers.filter((number) => !epicNumbers.has(number)),
      ...unlistedChildren,
      ...numbers.filter((number) => epicNumbers.has(number)),
    ];
    const changedEpics = childrenFirst.flatMap((number) => {
      const changedEpic = setArchivedStep(
        number,
        true,
        archivedWithEpic.has(number),
      );
      return changedEpic === null ? [] : [changedEpic];
    });
    return [...new Set([...numbers, ...unlistedChildren, ...changedEpics])];
  }

  /**
   * Sets only Ticket `number`'s archived flag (and updated time), marking it
   * as archived with its Epic when `withEpic`, and records the Activity:
   * run it in the transaction that makes the change. A child's Epic leaves
   * out archived children, so its Status may change: returns that Epic if
   * it did.
   */
  function setArchivedStep(
    number: number,
    archived: boolean,
    withEpic = false,
  ): number | null {
    checkTicketProjectWritable(number);
    if (archived) {
      checkChildrenArchived(db, number);
    } else {
      checkEpicNotArchived(db, number);
    }
    const before = db
      .select({ archived: tickets.archived })
      .from(tickets)
      .where(eq(tickets.number, number))
      .get();
    const ticket = db
      .update(tickets)
      .set({
        archived,
        updatedAt: new Date(),
        ...(before?.archived === archived
          ? {}
          : { archivedWithEpic: archived && withEpic }),
      })
      .where(eq(tickets.number, number))
      .returning({ epicNumber: tickets.epicNumber })
      .get();
    if (!ticket) {
      throw new NotFoundError(`There is no Ticket T${number}.`);
    }
    if (before?.archived !== archived) {
      recordActivity(number, [{ type: archived ? 'archived' : 'restored' }]);
    }
    return syncEpicStatus(ticket.epicNumber) ? ticket.epicNumber : null;
  }
}

/**
 * Deletes Ticket `number`'s row with everything attached to it: labels,
 * External references, Activity, Comments, acceptance criteria, Blockers on both sides and Cycle
 * membership. The Tickets split from it lose their Origin and are bumped.
 * Run it in the deleting transaction. Returns the Tickets it blocked, the
 * Cycles it left, the Tickets split from it and its own Origin: the caller
 * announces them all, and bumps the ones it blocked and its Origin.
 */
function removeTicket(db: DatabaseConnection, number: number) {
  db.delete(ticketLabels).where(eq(ticketLabels.ticketNumber, number)).run();
  deleteExternalReferences(db, number);
  deleteActivity(db, number);
  db.delete(ticketComments)
    .where(eq(ticketComments.ticketNumber, number))
    .run();
  db.delete(triageProposals)
    .where(eq(triageProposals.ticketNumber, number))
    .run();
  deleteAttachments(db, number);
  db.delete(ticketAcceptanceCriteria)
    .where(eq(ticketAcceptanceCriteria.ticketNumber, number))
    .run();
  db.delete(ticketBlockers)
    .where(eq(ticketBlockers.blockedNumber, number))
    .run();
  const unblocked = db
    .delete(ticketBlockers)
    .where(eq(ticketBlockers.blockerNumber, number))
    .returning({ number: ticketBlockers.blockedNumber })
    .all()
    .map(({ number: blocked }) => blocked);
  const leftCycles = leaveAllCycles(db, number);
  const unlinked = db
    .update(tickets)
    .set({ originNumber: null, updatedAt: new Date() })
    .where(eq(tickets.originNumber, number))
    .returning({ number: tickets.number })
    .all()
    .map((split) => split.number);
  const removed = db
    .delete(tickets)
    .where(eq(tickets.number, number))
    .returning({ originNumber: tickets.originNumber })
    .get();
  return { unblocked, leftCycles, unlinked, origin: removed?.originNumber };
}
