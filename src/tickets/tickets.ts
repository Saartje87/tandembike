import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import {
  projects,
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
import type { ActivityChange } from './activity-change';
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
import { claimOwner } from './claim-owner';
import {
  type CycleLink,
  createCycles,
  leaveAllCycles,
  planNewTicket,
} from './cycles';
import type { EpicLink } from './epic-link';
import {
  checkChildrenArchived,
  checkEpic,
  checkEpicChild,
  checkEpicClaimable,
  checkEpicNotArchived,
  checkNoBlockerBetween,
  type EpicChildInput,
  type EpicChildrenInput,
  epicStatusRule,
} from './epics';
import {
  type BatchFailure,
  NotAllowedError,
  NotFoundError,
  TicketsError,
  UncheckedCriteriaError,
  type UncheckedCriterion,
  ValidationError,
} from './errors';
import { isPullRequestReference } from './external-reference-display';
import {
  checkExternalReferenceCount,
  checkedExternalReferences,
  checkNewExternalReferences,
  deleteExternalReferences,
  externalReferenceChanges,
  externalReferencesOf,
  insertExternalReferences,
  normalizeExternalReferences,
} from './external-references';
import {
  duplicateSimilarity,
  feedbackLabels,
  isFeedback,
  jaccardSimilarity,
  maxFeedbackPerRun,
} from './feedback';
import {
  checkLaneCycle,
  type LaneScope,
  laneOf,
  throwOutOfScope,
  writeLaneOrder,
} from './lanes';
import { createMachineSettings } from './machine-settings';
import { type MergeMode, mergeModeOf } from './merge-mode';
import { checkOrigin, type OriginLink, type SplitOffTicket } from './origins';
import {
  isPaletteColor,
  type PaletteColor,
  paletteColors,
  paletteRule,
} from './palette';
import { nextPosition } from './positions';
import type { ProjectIcon } from './project-icons';
import { createProjects } from './projects';
import {
  createReferenceTemplates,
  type ReferenceTemplateInput,
} from './reference-templates';
import {
  checkBatchNumbers,
  checkTitle,
  eachOrNone,
  maxBatchSize,
  maxCommentLength,
  maxOverrideLength,
  throwFieldErrors,
} from './rules';
import { createStats } from './stats';
import { isStatus, type Status, statusRule } from './status';
import { createTicketReads } from './ticket-reads';
import {
  blockedTicket,
  claimChanges,
  createTicketRowContext,
  labelChanges,
  resolvedBlocker,
  resolvedTicket,
  type TicketRowContext,
} from './ticket-row-context';
import {
  checkAcceptanceCriteria,
  checkCriterionIds,
  checkDescription,
  checkLabels,
  checkStatus,
  checkTicketChanges,
  normalizeLabels,
  noSuchCriterion,
} from './ticket-rules';
import { isTicketType, type TicketType } from './ticket-type';
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

function checkedAgentRunId(rawAgentRunId: string): string {
  const agentRunId = rawAgentRunId.trim();
  throwFieldErrors({
    agentRunId:
      agentRunId === ''
        ? 'Enter an Agent run id to claim a Ticket.'
        : undefined,
  });
  return agentRunId;
}

/**
 * The cleaned-up fields of a new Ticket, or a `ValidationError` with a
 * reason for every field that breaks the rules.
 */
function checkNewTicket(input: Omit<CreateTicketInput, 'projectId'>) {
  const title = input.title.trim();
  const description = input.description ?? '';
  const status = input.status ?? 'Todo';
  const type = input.type ?? 'Ticket';
  const labels = normalizeLabels(input.labels ?? []);
  const externalReferences = normalizeExternalReferences(
    input.externalReferences ?? [],
  );
  const acceptanceCriteria = (input.acceptanceCriteria ?? []).map(
    ({ text, checked }) => ({ text: text.trim(), checked: checked ?? false }),
  );

  throwFieldErrors({
    title: checkTitle(title),
    description: checkDescription(description),
    status:
      checkStatus(status) ??
      (type === 'Epic' && status !== 'Todo'
        ? "An Epic's Status follows its child Tickets. Leave the Status out."
        : undefined),
    type: isTicketType(type) ? undefined : 'Choose a type: Ticket or Epic.',
    color:
      input.color === undefined
        ? undefined
        : !isPaletteColor(input.color)
          ? paletteRule
          : type === 'Epic'
            ? undefined
            : 'Only an Epic has a colour. Leave the colour out.',
    labels: checkLabels(labels),
    externalReferences: checkNewExternalReferences(externalReferences),
    acceptanceCriteria: checkAcceptanceCriteria(
      acceptanceCriteria.map(({ text }) => text),
    ),
  });
  return {
    values: { title, description, status, type, color: input.color },
    labels,
    externalReferences,
    acceptanceCriteria,
  };
}

type CheckedNewTicket = ReturnType<typeof checkNewTicket>;

/**
 * The checked fields and Blocker positions of the batch's Ticket at
 * `position`, or a `ValidationError` naming it by position: each field is
 * keyed `tickets[2].title`, and each reason starts with the position.
 */
function checkBatchTicket(
  batchTicket: BatchTicketInput,
  position: number,
  batchSize: number,
): {
  ticket: CheckedNewTicket;
  blockedByPositions: number[];
  blockedByNumbers: number[];
} {
  const reasons: Record<string, string | undefined> = {};
  const reasonAt = (field: string, reason: string | undefined) => {
    reasons[`tickets[${position}].${field}`] =
      reason === undefined
        ? undefined
        : `Ticket at position ${position}: ${reason}`;
  };
  const {
    blockedByPositions = [],
    blockedByNumbers = [],
    epicPosition: _epicPosition,
    originPosition: _originPosition,
    originNumber: _originNumber,
    ...input
  } = batchTicket;
  // Until the numbers exist, a placeholder stands in as a one-digit number, so
  // that a limit is checked against roughly the stored text; the text is
  // checked again with the real numbers.
  const standIn = fillPlaceholders(input, () => 'T0');
  reasonAt('title', outsidePositions(input.title, batchSize));
  reasonAt('description', outsidePositions(input.description, batchSize));
  reasonAt(
    'acceptanceCriteria',
    outsidePositions(
      (input.acceptanceCriteria ?? []).map(({ text }) => text).join('\n'),
      batchSize,
    ),
  );
  let ticket: CheckedNewTicket | undefined;
  try {
    ticket = checkNewTicket(standIn);
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    for (const [field, reason] of Object.entries(error.fieldErrors)) {
      reasonAt(field, reason);
    }
  }
  reasonAt(
    'blockedByPositions',
    checkBlockedByPositions(blockedByPositions, position),
  );
  reasonAt(
    'blockedByNumbers',
    new Set(blockedByNumbers).size === blockedByNumbers.length
      ? undefined
      : 'name each Ticket in blockedByNumbers once.',
  );
  throwFieldErrors(reasons);
  // Without a ValidationError, `checkNewTicket` returned.
  return {
    ticket: ticket as CheckedNewTicket,
    blockedByPositions,
    blockedByNumbers,
  };
}

/** Why `field` cannot name a position other than an earlier one. */
function earlierOnly(field: string, position: number): string {
  return position === 0
    ? `${field} can only name an earlier position, and it is first.`
    : `${field} can only name an earlier position, from 0 to ${position - 1}.`;
}

/**
 * Refuses the batch, naming each Ticket by position, when its `epicPosition`
 * `originPosition` or `originNumber` breaks the rules: only an earlier
 * position, an Epic of the batch as the Epic, no Epic with an Epic, no
 * position field next to the matching batch-level field, and a Ticket's own
 * `originNumber` with neither `originPosition` nor the batch `originNumber`.
 */
function checkBatchLinks(
  batch: CreateTicketBatchInput,
  types: readonly TicketType[],
) {
  const reasons: Record<string, string | undefined> = {};
  batch.tickets.forEach((ticket, position) => {
    const reasonAt = (field: string, reason: string | undefined) => {
      reasons[`tickets[${position}].${field}`] =
        reason === undefined
          ? undefined
          : `Ticket at position ${position}: ${reason}`;
    };
    const earlier = (at: number) =>
      Number.isInteger(at) && at >= 0 && at < position;
    const { epicPosition, originPosition, originNumber } = ticket;
    if (epicPosition !== undefined) {
      reasonAt(
        'epicPosition',
        batch.epicNumber !== undefined
          ? 'give epicPosition or the batch epicNumber, not both.'
          : types[position] === 'Epic'
            ? 'an Epic cannot be a child of another Epic. Leave epicPosition out.'
            : !earlier(epicPosition)
              ? earlierOnly('epicPosition', position)
              : types[epicPosition] !== 'Epic'
                ? `epicPosition names position ${epicPosition}, which is not created as an Epic. Give it type "Epic".`
                : undefined,
      );
    } else if (batch.epicNumber !== undefined && types[position] === 'Epic') {
      reasonAt(
        'epicNumber',
        'an Epic cannot be a child of another Epic, so the batch epicNumber cannot apply to it.',
      );
    }
    if (originPosition !== undefined) {
      reasonAt(
        'originPosition',
        batch.originNumber !== undefined
          ? 'give originPosition or the batch originNumber, not both.'
          : !earlier(originPosition)
            ? earlierOnly('originPosition', position)
            : undefined,
      );
    }
    if (originNumber !== undefined) {
      reasonAt(
        'originNumber',
        originPosition !== undefined
          ? 'give originNumber or originPosition, not both.'
          : batch.originNumber !== undefined
            ? "give the Ticket's originNumber or the batch originNumber, not both."
            : undefined,
      );
    }
  });
  throwFieldErrors(reasons);
}

/** A fresh global regex per use, so no `lastIndex` is shared. */
const placeholders = () => /\{\{T:(\d+)\}\}/g;

/** Why a `{{T:n}}` in `text` names a position outside the batch, if one does. */
function outsidePositions(
  text: string | undefined,
  batchSize: number,
): string | undefined {
  for (const [found, position] of text?.matchAll(placeholders()) ?? []) {
    if (Number(position) >= batchSize) {
      return `${found} names a position outside the batch; use positions 0 to ${batchSize - 1}.`;
    }
  }
  return undefined;
}

/**
 * `input` with every `{{T:n}}` in its title, description and criteria text
 * replaced by `replacement(n)`.
 */
function fillPlaceholders<
  T extends Pick<
    BatchTicketInput,
    'title' | 'description' | 'acceptanceCriteria'
  >,
>(input: T, replacement: (position: number) => string): T {
  const fill = (text: string) =>
    text.replace(placeholders(), (_, position) =>
      replacement(Number(position)),
    );
  return {
    ...input,
    title: fill(input.title),
    ...(input.description === undefined
      ? {}
      : { description: fill(input.description) }),
    ...(input.acceptanceCriteria === undefined
      ? {}
      : {
          acceptanceCriteria: input.acceptanceCriteria.map((criterion) => ({
            ...criterion,
            text: fill(criterion.text),
          })),
        }),
  };
}

/**
 * Runs `check` for the batch's Ticket at `position`, naming it in a refusal:
 * a `ValidationError` is keyed `tickets[2].<field>`, and every reason starts
 * with the position.
 */
function atPosition(position: number, field: string, check: () => void) {
  const at = (reason: string) => `Ticket at position ${position}: ${reason}`;
  try {
    check();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ValidationError({
        [`tickets[${position}].${field}`]: at(
          Object.values(error.fieldErrors).join(' '),
        ),
      });
    }
    if (error instanceof NotFoundError) {
      throw new NotFoundError(at(error.message));
    }
    throw error;
  }
}

/** Why a batch Ticket's Blocker positions break the rules, if they do. */
function checkBlockedByPositions(
  positions: readonly number[],
  position: number,
): string | undefined {
  if (positions.length === 0) {
    return undefined;
  }
  if (position === 0) {
    return 'blockedByPositions can only name earlier positions, and it is first.';
  }
  if (
    positions.some(
      (blocker) =>
        !Number.isInteger(blocker) || blocker < 0 || blocker >= position,
    )
  ) {
    return `blockedByPositions can only name earlier positions, from 0 to ${position - 1}.`;
  }
  if (new Set(positions).size !== positions.length) {
    return 'name each position in blockedByPositions once.';
  }
  return undefined;
}

/**
 * Inserts a checked new Ticket at the end of its Status lane, with its
 * labels and acceptance criteria and its `created` Activity entry by
 * `actor`, and returns its number. Run it in a transaction.
 */
/**
 * Refuses a batch whose feedback Tickets (T1250) would take `filedByRun`
 * past the cap, or whose titles nearly repeat a live feedback Ticket of the
 * Project. Tickets without a source label are never checked.
 */
function checkFeedback(
  db: DatabaseConnection,
  projectId: number,
  filedByRun: string | undefined,
  batch: readonly CheckedNewTicket[],
) {
  const feedback = batch.flatMap(({ values, labels }, position) =>
    isFeedback(labels) ? [{ position, title: values.title }] : [],
  );
  if (feedback.length === 0) {
    return;
  }
  if (filedByRun !== undefined) {
    const { filed } = db
      .select({ filed: countDistinct(tickets.number) })
      .from(tickets)
      .innerJoin(ticketLabels, eq(ticketLabels.ticketNumber, tickets.number))
      .where(
        and(
          eq(tickets.filedByRun, filedByRun),
          inArray(ticketLabels.label, [...feedbackLabels]),
        ),
      )
      .get() as { filed: number };
    if (filed + feedback.length > maxFeedbackPerRun) {
      throw new NotAllowedError(
        `This run has filed ${Math.min(filed, maxFeedbackPerRun)} feedback Tickets already; add a note to one of them with add_note instead.`,
      );
    }
  }
  const live = db
    .selectDistinct({ number: tickets.number, title: tickets.title })
    .from(tickets)
    .innerJoin(ticketLabels, eq(ticketLabels.ticketNumber, tickets.number))
    .where(
      and(
        eq(tickets.projectId, projectId),
        eq(tickets.archived, false),
        ne(tickets.status, 'Done'),
        inArray(ticketLabels.label, [...feedbackLabels]),
      ),
    )
    .all();
  const reasons: Record<string, string> = {};
  for (const [index, { position, title }] of feedback.entries()) {
    const match = live.find(
      (other) => jaccardSimilarity(title, other.title) >= duplicateSimilarity,
    );
    if (match) {
      reasons[`tickets[${position}].title`] =
        `Ticket at position ${position}: its title nearly repeats feedback Ticket T${match.number} ("${match.title}"). Add a note to T${match.number} with add_note instead.`;
      continue;
    }
    const earlier = feedback
      .slice(0, index)
      .find(
        (other) => jaccardSimilarity(title, other.title) >= duplicateSimilarity,
      );
    if (earlier) {
      reasons[`tickets[${position}].title`] =
        `Ticket at position ${position}: its title nearly repeats the feedback Ticket at position ${earlier.position} of this batch ("${earlier.title}"). File it once.`;
    }
  }
  throwFieldErrors(reasons);
}

function insertTicket(
  {
    db,
    insertLabels,
    insertAcceptanceCriteria,
    recordActivity,
  }: TicketRowContext,
  { values, labels, externalReferences, acceptanceCriteria }: CheckedNewTicket,
  row: {
    projectId: number;
    epicNumber: number | null;
    originNumber: number | null;
    createdAt: Date;
    filedByRun?: string;
  },
): number {
  const { number } = db
    .insert(tickets)
    .values({
      ...values,
      color:
        values.type === 'Epic'
          ? (values.color ?? leastUsedColor(db, row.projectId))
          : null,
      ...row,
      filedByRun: row.filedByRun ?? null,
      position: nextPosition(db, row.projectId, values.status),
      updatedAt: row.createdAt,
    })
    .returning({ number: tickets.number })
    .get();
  insertLabels(number, labels);
  insertExternalReferences(db, number, externalReferences);
  insertAcceptanceCriteria(number, acceptanceCriteria);
  recordActivity(number, [{ type: 'created' }]);
  return number;
}

/**
 * The palette colour fewest live Epics in Project `projectId` use, the
 * earliest in the palette on a tie, for a new Epic.
 */
function leastUsedColor(
  db: DatabaseConnection,
  projectId: number,
): PaletteColor {
  const uses = new Map(
    db
      .select({ color: tickets.color, uses: count() })
      .from(tickets)
      .where(
        and(
          eq(tickets.projectId, projectId),
          eq(tickets.type, 'Epic'),
          eq(tickets.archived, false),
          isNotNull(tickets.color),
        ),
      )
      .groupBy(tickets.color)
      .all()
      .map(({ color, uses }) => [color, uses]),
  );
  return paletteColors.reduce((least, color) =>
    (uses.get(color) ?? 0) < (uses.get(least) ?? 0) ? color : least,
  );
}

const relatedTicketColumns = {
  number: tickets.number,
  title: tickets.title,
  status: tickets.status,
  projectId: tickets.projectId,
  archived: tickets.archived,
};

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
    checkBlocker,
    recordActivity,
    touchTicket,
    syncEpicStatus,
    checkTicketWritable,
    checkTicketProjectWritable,
    checkProjectWritable,
    labelsOf,
    insertLabels,
    deleteLabels,
  } = ctx;
  const referenceTemplates = createReferenceTemplates(ctx);
  const core = {
    transaction,
    ...createCycles(ctx),
    ...referenceTemplates,
    ...createStats(ctx),
    ...createProjects(ctx, {
      addReferenceTemplate: referenceTemplates.addReferenceTemplate,
    }),

    /** Calls `listener` after every change; returns an unsubscribe. */
    subscribe: changes.subscribe,
    ...createTicketReads(ctx),

    /**
     * Claims Ticket `number` for one Agent run. Repeating a claim by that
     * run is idempotent; another run cannot replace the existing claim.
     */
    claimTicket(number: number, input: ClaimTicketInput): Ticket {
      const agentRunId = checkedAgentRunId(input.agentRunId);
      const agentName = input.agentName?.trim() || null;

      const changed = db.transaction(() => {
        checkTicketWritable(number);
        checkEpicClaimable(db, number, agentRunId);
        const claimed = db
          .update(tickets)
          .set({
            claimAgentRunId: agentRunId,
            claimAgentName: agentName,
            // The mode is fixed when the Claim is taken (ADR 0043).
            claimMerge: projectMergeMode(number),
            updatedAt: new Date(),
          })
          .where(
            and(eq(tickets.number, number), isNull(tickets.claimAgentRunId)),
          )
          .returning({ number: tickets.number })
          .get();
        if (claimed) {
          recordActivity(
            number,
            claimChanges('claimTaken', {
              claimAgentRunId: agentRunId,
              claimAgentName: agentName,
            }),
          );
          return true;
        }

        const existing = db
          .select({
            claimAgentRunId: tickets.claimAgentRunId,
            claimAgentName: tickets.claimAgentName,
          })
          .from(tickets)
          .where(eq(tickets.number, number))
          .get();
        if (!existing) {
          throw new NotFoundError(`There is no Ticket T${number}.`);
        }
        if (existing.claimAgentRunId === agentRunId) {
          return false;
        }

        const owner = claimOwner(
          existing.claimAgentRunId,
          existing.claimAgentName,
        );
        throw new NotAllowedError(
          `Ticket T${number} is already claimed by ${owner}.`,
        );
      });

      if (changed) {
        changes.publish({ type: 'ticket', number });
      }
      return getTicket(number);
    },

    /** Releases Ticket `number` when `agentRunId` is its current claimant. */
    releaseTicketClaim(
      number: number,
      input: Pick<ClaimTicketInput, 'agentRunId'>,
    ): Ticket {
      const agentRunId = checkedAgentRunId(input.agentRunId);
      const changed = db.transaction(() => {
        // An archived Ticket still lets its Claim go (T1312).
        checkTicketProjectWritable(number);
        const claim = db
          .select({
            claimAgentRunId: tickets.claimAgentRunId,
            claimAgentName: tickets.claimAgentName,
          })
          .from(tickets)
          .where(
            and(
              eq(tickets.number, number),
              eq(tickets.claimAgentRunId, agentRunId),
            ),
          )
          .get();
        const released = db
          .update(tickets)
          .set({
            claimAgentRunId: null,
            claimAgentName: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tickets.number, number),
              eq(tickets.claimAgentRunId, agentRunId),
            ),
          )
          .returning({ number: tickets.number })
          .get();
        if (released) {
          if (claim) {
            recordActivity(number, claimChanges('claimReleased', claim));
          }
          return true;
        }

        const existing = db
          .select({
            claimAgentRunId: tickets.claimAgentRunId,
            claimAgentName: tickets.claimAgentName,
          })
          .from(tickets)
          .where(eq(tickets.number, number))
          .get();
        if (!existing) {
          throw new NotFoundError(`There is no Ticket T${number}.`);
        }
        if (existing.claimAgentRunId === null) {
          return false;
        }

        const owner = claimOwner(
          existing.claimAgentRunId,
          existing.claimAgentName,
        );
        throw new NotAllowedError(
          `Ticket T${number} is claimed by ${owner}; only that Agent run can release it.`,
        );
      });

      if (changed) {
        changes.publish({ type: 'ticket', number });
      }
      return getTicket(number);
    },

    /** Clears any claim on Ticket `number` for the User. */
    clearTicketClaim(number: number): Ticket {
      // An archived Ticket still lets its Claim go (T1312).
      checkTicketProjectWritable(number);
      const cleared = db.transaction(() => {
        const claim = db
          .select({
            claimAgentRunId: tickets.claimAgentRunId,
            claimAgentName: tickets.claimAgentName,
          })
          .from(tickets)
          .where(eq(tickets.number, number))
          .get();
        if (!claim || claim.claimAgentRunId === null) {
          return false;
        }
        db.update(tickets)
          .set({
            claimAgentRunId: null,
            claimAgentName: null,
            updatedAt: new Date(),
          })
          .where(eq(tickets.number, number))
          .run();
        recordActivity(number, claimChanges('claimCleared', claim));
        return true;
      });
      if (cleared) {
        changes.publish({ type: 'ticket', number });
      }
      return getTicket(number);
    },

    createTicket(input: CreateTicketInput): Ticket {
      const checked = checkNewTicket(input);
      const { values } = checked;
      checkProjectWritable(input.projectId);
      const project = { id: input.projectId };

      // better-sqlite3 runs every statement on this one connection, so
      // statements on `db` inside the callback are part of the transaction.
      const number = db.transaction(() => {
        if (input.epicNumber !== undefined) {
          checkEpicChild(db, input.epicNumber, {
            type: values.type,
            projectId: project.id,
          });
        }
        if (input.originNumber !== undefined) {
          checkOrigin(db, input.originNumber);
        }
        const number = insertTicket(ctx, checked, {
          projectId: project.id,
          epicNumber: input.epicNumber ?? null,
          originNumber: input.originNumber ?? null,
          createdAt: new Date(),
        });
        if (input.cycleId !== undefined) {
          planNewTicket(db, { cycleId: input.cycleId, number }, project.id);
        }
        if (input.originNumber !== undefined) {
          touchTicket(input.originNumber);
        }
        syncEpicStatus(input.epicNumber ?? null);
        return number;
      });
      // A child changes its Epic's children, and maybe its Status; a split-off
      // Ticket changes its Origin's.
      publishWith(number, input.epicNumber ?? null, input.originNumber ?? null);
      return getTicket(number);
    },

    /**
     * Creates every Ticket in `input.tickets` in one Project, in order, by
     * the rules for creating one, with the Blockers each names by position
     * among the earlier ones and by number among existing Tickets (by the
     * rules for adding a Blocker), under an Epic when `epicNumber` is given, and
     * planned into a Cycle when `cycleId` is.
     * A `{{T:n}}` in a title, description or criterion text becomes
     * `T<number>` of the Ticket at position n of the batch, anywhere in the
     * text. All or nothing: a refusal names the offending Ticket by position
     * and creates none. The new Tickets are announced once.
     */
    createTicketBatch(input: CreateTicketBatchInput): Ticket[] {
      throwFieldErrors({
        tickets:
          input.tickets.length === 0
            ? 'Give at least one Ticket to create.'
            : input.tickets.length > maxBatchSize
              ? `Create at most ${maxBatchSize} Tickets at a time.`
              : undefined,
      });
      const batchSize = input.tickets.length;
      const checked = input.tickets.map((ticket, position) =>
        checkBatchTicket(ticket, position, batchSize),
      );
      checkBatchLinks(
        input,
        checked.map(({ ticket }) => ticket.values.type),
      );
      checkProjectWritable(input.projectId);
      const project = { id: input.projectId };
      const epicNumber = input.epicNumber ?? null;
      const originNumber = input.originNumber ?? null;

      const {
        created: numbers,
        origins,
        existingBlockers,
      } = db.transaction(() => {
        checkFeedback(
          db,
          project.id,
          input.filedByRun,
          checked.map(({ ticket }) => ticket),
        );
        if (epicNumber !== null) {
          checkEpicChild(db, epicNumber, {
            type: 'Ticket',
            projectId: project.id,
          });
        }
        if (originNumber !== null) {
          checkOrigin(db, originNumber);
        }
        input.tickets.forEach((ticket, position) => {
          const { originNumber } = ticket;
          if (originNumber !== undefined) {
            atPosition(position, 'originNumber', () =>
              checkOrigin(db, originNumber),
            );
          }
        });
        const createdAt = new Date();
        const created: number[] = [];
        const epics = new Set<number>();
        const origins = new Set<number>();
        const existingBlockers = new Set<number>();
        if (epicNumber !== null) {
          epics.add(epicNumber);
        }
        if (originNumber !== null) {
          origins.add(originNumber);
        }
        for (const [
          position,
          { ticket, blockedByPositions, blockedByNumbers },
        ] of checked.entries()) {
          const {
            epicPosition,
            originPosition,
            originNumber: ownOrigin,
          } = input.tickets[position];
          const ticketEpic =
            epicPosition === undefined ? epicNumber : created[epicPosition];
          const ticketOrigin =
            originPosition !== undefined
              ? created[originPosition]
              : (ownOrigin ?? originNumber);
          const number = insertTicket(ctx, ticket, {
            projectId: project.id,
            epicNumber: ticketEpic,
            originNumber: ticketOrigin,
            createdAt,
            filedByRun: input.filedByRun,
          });
          if (epicPosition !== undefined) {
            epics.add(ticketEpic as number);
          }
          if (ticketOrigin !== null) {
            origins.add(ticketOrigin);
          }
          if (blockedByPositions.length > 0) {
            db.insert(ticketBlockers)
              .values(
                blockedByPositions.map((position) => ({
                  blockerNumber: created[position],
                  blockedNumber: number,
                })),
              )
              .run();
          }
          for (const blocker of blockedByNumbers) {
            atPosition(position, 'blockedByNumbers', () =>
              checkBlocker({ blocker, blocked: number }),
            );
            db.insert(ticketBlockers)
              .values({ blockerNumber: blocker, blockedNumber: number })
              .run();
            recordActivity(blocker, [{ type: 'blocksAdded', number }]);
            existingBlockers.add(blocker);
          }
          if (input.cycleId !== undefined) {
            planNewTicket(db, { cycleId: input.cycleId, number }, project.id);
          }
          created.push(number);
        }
        // Only now are all the numbers known; a refusal rolls everything back.
        input.tickets.forEach((ticket, position) => {
          const filled = fillPlaceholders(ticket, (at) => `T${created[at]}`);
          if (
            filled.title === ticket.title &&
            filled.description === ticket.description &&
            filled.acceptanceCriteria?.every(
              ({ text }, i) => text === ticket.acceptanceCriteria?.[i].text,
            ) !== false
          ) {
            return;
          }
          const { values, acceptanceCriteria } = checkBatchTicket(
            filled,
            position,
            batchSize,
          ).ticket;
          const number = created[position];
          db.update(tickets)
            .set({ title: values.title, description: values.description })
            .where(eq(tickets.number, number))
            .run();
          acceptanceCriteria.forEach(({ text }, criterionPosition) => {
            db.update(ticketAcceptanceCriteria)
              .set({ text })
              .where(
                and(
                  eq(ticketAcceptanceCriteria.ticketNumber, number),
                  eq(ticketAcceptanceCriteria.position, criterionPosition),
                ),
              )
              .run();
          });
        });
        // An Origin made in this batch is new, not changed by it.
        for (const origin of origins) {
          if (!created.includes(origin)) {
            touchTicket(origin);
          }
        }
        for (const epic of epics) {
          syncEpicStatus(epic);
        }
        return { created, origins, existingBlockers };
      });
      changes.publish({
        type: 'tickets',
        numbers: [
          ...new Set([
            ...numbers,
            ...(epicNumber === null ? [] : [epicNumber]),
            ...origins,
            ...existingBlockers,
          ]),
        ],
      });
      return numbers.map(getTicket);
    },

    /**
     * Changes Ticket `number` fully, in one transaction: a restore first
     * (`archived: false`), so the rest applies to the restored Ticket, then
     * the core fields, Epic, Blockers, Cycle, Board position and archive
     * (`archived: true`), in that order. Each step is refused with the
     * message of the single-purpose function it applies, records Activity
     * and announces as that function does, and a refusal leaves the Ticket
     * unchanged. The core fields follow the rules for creating a Ticket and
     * bump its updated time even when nothing is given; any Status may follow
     * any other. With `withChildren`, `childrenMoved` names the children
     * whose Cycle changed with it.
     */
    updateTicket(number: number, change: TicketChange): UpdatedTicket {
      const {
        epicNumber,
        addBlockers = [],
        removeBlockers = [],
        cycleId,
        withChildren,
        archived,
        before,
        after,
        ...fields
      } = change;
      return db.transaction(() => {
        if (withChildren && cycleId === undefined) {
          throw new TicketsError(
            "withChildren takes an Epic's children along to a Cycle, so give cycleId with it.",
          );
        }
        if (before !== undefined && after !== undefined) {
          throw new TicketsError(
            'Give either before or after: a Ticket lands next to one Ticket.',
          );
        }
        const hasFields = Object.values(fields).some(
          (value) => value !== undefined,
        );
        const hasSteps =
          epicNumber !== undefined ||
          addBlockers.length > 0 ||
          removeBlockers.length > 0 ||
          cycleId !== undefined ||
          before !== undefined ||
          after !== undefined ||
          archived !== undefined;
        // An archived Ticket is read-only, so restore it before the rest.
        if (archived === false) {
          core.restoreTicket(number);
        }
        // With nothing to change, the fields step bumps the Ticket.
        if (hasFields || !hasSteps) {
          updateFields(number, fields);
        }
        if (epicNumber === null) {
          core.detachFromEpic(number);
        } else if (epicNumber !== undefined) {
          core.moveToEpic({ epic: epicNumber, child: number });
        }
        for (const blocker of addBlockers) {
          core.addBlocker({ blocker, blocked: number });
        }
        for (const blocker of removeBlockers) {
          core.removeBlocker({ blocker, blocked: number });
        }
        let childrenMoved: number[] | undefined;
        if (cycleId !== undefined) {
          const moved = core.moveTicketsToCycle({
            cycleId,
            ticketNumbers: [number],
            withChildren,
          });
          if (moved.failed.length > 0) {
            const [{ error, refusal }] = moved.failed;
            throw new TicketsError(error, refusal);
          }
          childrenMoved = moved.children;
        }
        if (before !== undefined) {
          core.reorderTicket(number, { before });
        } else if (after !== undefined) {
          core.reorderTicket(number, { after });
        }
        if (archived === true) {
          core.archiveTicket(number);
        }
        const ticket = getTicket(number);
        return childrenMoved ? { ...ticket, childrenMoved } : ticket;
      });
    },

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
     * The merge mode Ticket `number`'s Claim was taken with (ADR 0043), or
     * `null` while it has no Claim. A child under an Epic Claim has none of
     * its own: read the Epic's.
     */
    claimMergeMode(number: number): MergeMode | null {
      getTicket(number);
      const row = db
        .select({
          claimAgentRunId: tickets.claimAgentRunId,
          claimMerge: tickets.claimMerge,
        })
        .from(tickets)
        .where(eq(tickets.number, number))
        .get();
      return row?.claimAgentRunId == null
        ? null
        : (row.claimMerge ?? 'approve');
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

    /**
     * Applies the same Status and label change to each Ticket in
     * `ticketNumbers`, by the rules of `updateTicket`. Each Ticket's change is
     * atomic, but the batch is not: a Ticket that cannot be changed is
     * reported in `failed` and the others are still changed. An invalid batch
     * or change is refused as a whole. The changed Tickets are announced once.
     */
    updateTickets(input: UpdateTicketsInput): UpdateTicketsResult {
      const { ticketNumbers, status, color, addLabels, removeLabels } = input;
      const checked = checkTicketChanges({
        status,
        color,
        addLabels,
        removeLabels,
      });
      throwFieldErrors({
        ticketNumbers: checkBatchNumbers(ticketNumbers),
        change:
          checked.values.status === undefined &&
          checked.values.color === undefined &&
          checked.addLabels.length === 0 &&
          checked.removeLabels.length === 0
            ? 'Give a Status, color, addLabels or removeLabels to change.'
            : undefined,
      });

      const changed: number[] = [];
      const changedEpics = new Set<number>();
      const failed: BatchFailure[] = [];
      try {
        for (const number of ticketNumbers) {
          try {
            const { changedEpic } = applyTicketChanges(number, checked);
            changed.push(number);
            if (changedEpic !== null) {
              changedEpics.add(changedEpic);
            }
          } catch (error) {
            if (!(error instanceof TicketsError)) {
              throw error;
            }
            failed.push({ number, error: error.message });
          }
        }
      } finally {
        if (changed.length > 0) {
          changes.publish({
            type: 'tickets',
            numbers: [
              ...changed,
              ...[...changedEpics].filter((epic) => !changed.includes(epic)),
            ],
          });
        }
      }
      return { updated: changed.map(getTicket), failed };
    },

    /**
     * Adds `labels` to Ticket `number`, trimmed and lower-cased; ones it
     * already has are kept once. Bumps its updated time.
     */
    addLabels(number: number, labels: string[]): Ticket {
      const added = checkedLabels(labels);
      db.transaction(() => {
        checkTicketWritable(number);
        touchTicket(number);
        const before = labelsOf(number);
        insertLabels(number, added);
        recordActivity(number, labelChanges(before, { added }));
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Removes `labels` from Ticket `number`, ignoring case and ones it does
     * not have. Bumps its updated time.
     */
    removeLabels(number: number, labels: string[]): Ticket {
      const removed = checkedLabels(labels);
      db.transaction(() => {
        checkTicketWritable(number);
        touchTicket(number);
        const before = labelsOf(number);
        deleteLabels(number, removed);
        recordActivity(number, labelChanges(before, { removed }));
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Adds `references` to Ticket `number` after the ones it has, trimmed;
     * ones it already has are kept once, where they were. Refused past
     * `maxExternalReferences`. Bumps its updated time.
     */
    addExternalReferences(number: number, references: string[]): Ticket {
      const added = checkedExternalReferences(references);
      db.transaction(() => {
        checkTicketWritable(number);
        touchTicket(number);
        const before = externalReferencesOf(db, number);
        insertExternalReferences(db, number, added);
        checkExternalReferenceCount(db, number);
        recordActivity(number, externalReferenceChanges(before, { added }));
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Removes `references` from Ticket `number`, trimmed and matched
     * exactly; ones it does not have are ignored. Bumps its updated time.
     */
    removeExternalReferences(number: number, references: string[]): Ticket {
      const removed = checkedExternalReferences(references);
      db.transaction(() => {
        checkTicketWritable(number);
        touchTicket(number);
        const before = externalReferencesOf(db, number);
        deleteExternalReferences(db, number, removed);
        recordActivity(number, externalReferenceChanges(before, { removed }));
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Checks or unchecks each given acceptance criterion of Ticket `number`,
     * leaving its other criteria and their order alone, and bumps its updated
     * time. The Status does not change (ADR 0007).
     */
    setAcceptanceCriteriaChecked(
      number: number,
      criteria: AcceptanceCriterionCheckedInput[],
    ): Ticket {
      throwFieldErrors({
        acceptanceCriteria:
          criteria.length === 0
            ? 'Choose at least one acceptance criterion.'
            : checkCriterionIds(criteria),
      });
      db.transaction(() => {
        checkTicketWritable(number);
        touchTicket(number);
        const activity: ActivityChange[] = [];
        for (const { id, checked } of criteria) {
          const criterion = db
            .select({
              text: ticketAcceptanceCriteria.text,
              checked: ticketAcceptanceCriteria.checked,
            })
            .from(ticketAcceptanceCriteria)
            .where(
              and(
                eq(ticketAcceptanceCriteria.id, id),
                eq(ticketAcceptanceCriteria.ticketNumber, number),
              ),
            )
            .get();
          throwFieldErrors({
            acceptanceCriteria: criterion
              ? undefined
              : noSuchCriterion(number, id),
          });
          if (criterion?.checked === checked) {
            continue;
          }
          db.update(ticketAcceptanceCriteria)
            .set({ checked })
            .where(eq(ticketAcceptanceCriteria.id, id))
            .run();
          activity.push({
            type: checked ? 'criterionChecked' : 'criterionUnchecked',
            text: criterion?.text ?? '',
          });
        }
        recordActivity(number, activity);
      });
      changes.publish({ type: 'ticket', number });
      return getTicket(number);
    },

    /**
     * Makes Ticket `blocker` a Blocker of Ticket `blocked`, which bumps the
     * blocked Ticket's updated time. Adding one it already has changes
     * nothing else. Either Ticket may be in any Project. A Ticket blocking
     * itself, or a Blocker that would close a cycle, is refused. Returns the
     * blocked Ticket.
     */
    addBlocker({ blocker, blocked }: BlockerInput): Ticket {
      throwFieldErrors({
        blocker:
          blocker === blocked ? 'A Ticket cannot block itself.' : undefined,
      });
      db.transaction(() => {
        checkTicketWritable(blocked);
        checkBlocker({ blocker, blocked });
        touchTicket(blocked);
        const added = db
          .insert(ticketBlockers)
          .values({ blockerNumber: blocker, blockedNumber: blocked })
          .onConflictDoNothing()
          .returning({ blocked: ticketBlockers.blockedNumber })
          .get();
        if (added) {
          recordBlocker(ctx, { blocker, blocked }, 'Added');
        }
      });
      changes.publish({ type: 'tickets', numbers: [blocker, blocked] });
      return getTicket(blocked);
    },

    /**
     * Stops Ticket `blocker` blocking Ticket `blocked`, ignoring a Blocker it
     * does not have, and bumps the blocked Ticket's updated time. Both
     * Tickets must exist. Returns the blocked Ticket.
     */
    removeBlocker({ blocker, blocked }: BlockerInput): Ticket {
      db.transaction(() => {
        getTicket(blocker);
        checkTicketWritable(blocked);
        touchTicket(blocked);
        const removed = db
          .delete(ticketBlockers)
          .where(
            and(
              eq(ticketBlockers.blockerNumber, blocker),
              eq(ticketBlockers.blockedNumber, blocked),
            ),
          )
          .returning({ blocked: ticketBlockers.blockedNumber })
          .get();
        if (removed) {
          recordBlocker(ctx, { blocker, blocked }, 'Removed');
        }
      });
      changes.publish({ type: 'tickets', numbers: [blocker, blocked] });
      return getTicket(blocked);
    },

    attachTicketsToEpic,

    /**
     * Makes normal Ticket `child` a child of Epic `epic` in the same Project
     * (ADR 0011), by the rules of `attachTicketsToEpic`, but a Ticket in
     * another Epic leaves it for `epic`, and that Epic's Status follows too.
     * Returns the child.
     */
    moveToEpic(input: EpicChildInput): Ticket {
      return joinEpic(input, { move: true });
    },

    /**
     * `moveToEpic` for each of `children`, all or nothing: if any cannot
     * join `epic`, none does. Their Statuses and positions stay as they are.
     * The change is announced once, or not at all when every Ticket was in
     * `epic` already.
     */
    moveTicketsToEpic(input: EpicChildrenInput): void {
      const { epic, children } = input;
      throwFieldErrors({ children: checkBatchNumbers(children) });

      const joined = db.transaction(() =>
        children.flatMap((child) => {
          const changed = joinEpicStep({ epic, child }, { move: true });
          return changed ? [{ child, ...changed }] : [];
        }),
      );
      if (joined.length === 0) {
        return;
      }
      const left = joined.flatMap(({ previous }) =>
        previous === null ? [] : [previous],
      );
      changes.publish({
        type: 'tickets',
        numbers: [
          ...new Set([...left, epic, ...joined.map(({ child }) => child)]),
        ],
      });
    },

    /**
     * Takes Ticket `number` out of its Epic, if it has one, and bumps both
     * updated times. Returns the Ticket.
     */
    detachFromEpic(number: number): Ticket {
      return detachTicketsFromEpic([number])[0];
    },

    detachTicketsFromEpic,

    /**
     * The Tickets that block Ticket `number` and the Tickets it blocks, each
     * by number, archived ones included.
     */
    listBlockers(number: number): Blockers {
      getTicket(number);
      const related = (direction: keyof Blockers) => {
        const [side, other] =
          direction === 'blockedBy'
            ? [ticketBlockers.blockedNumber, ticketBlockers.blockerNumber]
            : [ticketBlockers.blockerNumber, ticketBlockers.blockedNumber];
        // A Blocker is resolved by the Blocker rule; a Ticket it blocks,
        // when it is Done or archived itself.
        return db
          .select({
            ...relatedTicketColumns,
            resolved: sql`${
              direction === 'blockedBy' ? resolvedBlocker : resolvedTicket
            }`.mapWith(Boolean),
          })
          .from(ticketBlockers)
          .innerJoin(tickets, eq(tickets.number, other))
          .innerJoin(
            blockedTicket,
            eq(blockedTicket.number, ticketBlockers.blockedNumber),
          )
          .where(eq(side, number))
          .orderBy(asc(tickets.number))
          .all();
      };
      return { blockedBy: related('blockedBy'), blocks: related('blocks') };
    },

    /**
     * Sets the order of the active Tickets in a Project's Status lane, or in
     * the part of it a Cycle or the Backlog shows. Archived Tickets, and
     * Tickets outside that part, keep their slots. The complete lane must be
     * supplied so stale Board data cannot silently lose a Ticket.
     */
    reorderTickets(input: ReorderTicketsInput): void {
      const { projectId, status, ticketNumbers } = input;
      if (!isStatus(status)) {
        throw new ValidationError({ status: statusRule });
      }
      if (
        ticketNumbers.some(
          (number) => !Number.isSafeInteger(number) || number < 1,
        ) ||
        new Set(ticketNumbers).size !== ticketNumbers.length
      ) {
        throw new ValidationError({
          ticketNumbers: 'Choose each Ticket in the lane exactly once.',
        });
      }

      checkProjectWritable(projectId);

      const lane = laneOf(db, input);
      if (
        lane.scopeOrder.length !== ticketNumbers.length ||
        lane.scopeOrder.some((number) => !ticketNumbers.includes(number))
      ) {
        throw new ValidationError({
          ticketNumbers: 'Refresh the Board and try reordering again.',
        });
      }
      writeLaneOrder(db, changes, lane, ticketNumbers);
    },

    /**
     * Moves active Ticket `number` directly before or after another active
     * Ticket of its Project and Status lane, by the same rule as a drag on
     * the Board: the other Tickets keep their order, archived ones their
     * slots. Records the move in Activity and announces it; a Ticket already
     * there changes nothing. Refused when the anchor is the Ticket itself,
     * missing, archived, or in another Project or Status.
     */
    reorderTicket(number: number, anchor: ReorderAnchor): void {
      const [field, other] =
        'before' in anchor
          ? (['before', anchor.before] as const)
          : (['after', anchor.after] as const);
      if (other === number) {
        throw new ValidationError({
          [field]: `Choose another Ticket than T${number} to move it next to.`,
        });
      }
      const laneTicket = (of: number) => {
        const row = db
          .select({
            projectId: tickets.projectId,
            status: tickets.status,
            archived: tickets.archived,
          })
          .from(tickets)
          .where(eq(tickets.number, of))
          .get();
        if (!row) {
          throw new NotFoundError(`There is no Ticket T${of}.`);
        }
        return row;
      };
      db.transaction(() => {
        const ticket = laneTicket(number);
        checkTicketWritable(number);
        const target = laneTicket(other);
        if (target.projectId !== ticket.projectId) {
          throw new NotAllowedError(
            `T${other} is in another Project. A Ticket moves only among the Tickets of its own Project.`,
          );
        }
        if (target.archived) {
          throw new NotAllowedError(
            `T${other} is archived and not on the Board. Move T${number} next to a Ticket on the Board.`,
          );
        }
        if (target.status !== ticket.status) {
          throw new NotAllowedError(
            `T${other} is ${target.status}, not ${ticket.status} like T${number}. A Ticket moves only within its own Status; change its Status with update_ticket status.`,
          );
        }
        const lane = laneOf(db, {
          projectId: ticket.projectId,
          status: ticket.status,
        });
        const order = lane.scopeOrder.filter((each) => each !== number);
        const slot = order.indexOf(other) + (field === 'after' ? 1 : 0);
        order.splice(slot, 0, number);
        if (order.every((each, index) => each === lane.scopeOrder[index])) {
          return;
        }
        writeLaneOrder(db, changes, lane, order);
        recordActivity(number, [
          field === 'before'
            ? { type: 'reordered', before: other }
            : { type: 'reordered', after: other },
        ]);
      });
    },

    /**
     * Sorts the active Tickets in a Project's Status lane, or in the part of
     * it a Cycle or the Backlog shows: the listed Tickets take the top slots
     * in the order given, and the others keep their order below them.
     * Archived Tickets, and Tickets outside that part, keep their slots. All
     * or nothing: a listed Ticket outside the part refuses the whole call.
     * Returns the part's resulting order.
     */
    sortLane(input: SortLaneInput): number[] {
      const { projectId, status, ticketNumbers, cycleId } = input;
      throwFieldErrors({
        ticketNumbers: checkBatchNumbers(ticketNumbers),
        status: isStatus(status) ? undefined : statusRule,
      });

      checkProjectWritable(projectId);
      const cycle =
        cycleId === undefined || cycleId === null
          ? undefined
          : checkLaneCycle(db, projectId, cycleId);

      const lane = laneOf(db, input);
      for (const number of ticketNumbers) {
        if (!lane.scopeOrder.includes(number)) {
          throwOutOfScope(db, input, number, cycle?.title);
        }
      }
      return writeLaneOrder(db, changes, lane, [
        ...ticketNumbers,
        ...lane.scopeOrder.filter((number) => !ticketNumbers.includes(number)),
      ]);
    },

    /**
     * Moves active normal Tickets of Project `projectId` into its `status`
     * lane, next to each other in the order given, just before Ticket
     * `before` or at the end of the lane. The other Tickets in the lane keep
     * their order. All or nothing: if any Ticket cannot move, none does.
     * Moving to Done releases a Claim, and a child's move updates its Epic's
     * Status, as `updateTicket` does. The change is announced once.
     */
    moveTickets(input: MoveTicketsInput): void {
      const { projectId, ticketNumbers, status, before } = input;
      throwFieldErrors({
        ticketNumbers: checkBatchNumbers(ticketNumbers),
        status: isStatus(status) ? undefined : statusRule,
      });

      const changedEpics = new Set<number>();
      db.transaction(() => {
        checkProjectWritable(projectId);
        const moving = ticketNumbers.map((number) => {
          const ticket = db
            .select({
              projectId: tickets.projectId,
              status: tickets.status,
              type: tickets.type,
              archived: tickets.archived,
              epicNumber: tickets.epicNumber,
              claimAgentRunId: tickets.claimAgentRunId,
              claimAgentName: tickets.claimAgentName,
            })
            .from(tickets)
            .where(eq(tickets.number, number))
            .get();
          if (!ticket) {
            throw new NotFoundError(`There is no Ticket T${number}.`);
          }
          if (ticket.projectId !== projectId) {
            throw new ValidationError({
              ticketNumbers: `Ticket T${number} is not in this Project.`,
            });
          }
          if (ticket.archived) {
            throw new ValidationError({
              ticketNumbers: `Ticket T${number} is archived. Restore it before moving it.`,
            });
          }
          if (ticket.type === 'Epic') {
            throw new ValidationError({
              ticketNumbers: epicStatusRule(number),
            });
          }
          return { number, ...ticket };
        });

        const rest = db
          .select({ number: tickets.number })
          .from(tickets)
          .where(
            and(eq(tickets.projectId, projectId), eq(tickets.status, status)),
          )
          .orderBy(
            asc(tickets.position),
            asc(tickets.createdAt),
            asc(tickets.number),
          )
          .all()
          .map(({ number }) => number)
          .filter((number) => !ticketNumbers.includes(number));
        const insertAt = before === null ? rest.length : rest.indexOf(before);
        if (insertAt < 0) {
          throw new ValidationError({
            before: 'Refresh the Board and try moving the Tickets again.',
          });
        }
        rest.splice(insertAt, 0, ...ticketNumbers);

        const now = new Date();
        rest.forEach((number, position) => {
          const moved = moving.find((ticket) => ticket.number === number);
          db.update(tickets)
            .set({
              position,
              ...(moved && moved.status !== status
                ? {
                    status,
                    updatedAt: now,
                    ...(status === 'Done'
                      ? { claimAgentRunId: null, claimAgentName: null }
                      : {}),
                  }
                : {}),
            })
            .where(eq(tickets.number, number))
            .run();
        });
        for (const ticket of moving) {
          if (ticket.status !== status) {
            recordActivity(ticket.number, [
              { type: 'status', from: ticket.status, to: status },
              ...(status === 'Done'
                ? claimChanges('claimReleased', ticket)
                : []),
            ]);
          }
          if (
            ticket.status !== status &&
            syncEpicStatus(ticket.epicNumber) &&
            ticket.epicNumber !== null
          ) {
            changedEpics.add(ticket.epicNumber);
          }
        }
      });
      changes.publish({
        type: 'tickets',
        numbers: [
          ...ticketNumbers,
          ...[...changedEpics].filter((epic) => !ticketNumbers.includes(epic)),
        ],
      });
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

  /** The merge mode Ticket `number`'s Project gives a Claim taken now. */
  function projectMergeMode(number: number): MergeMode {
    const row = db
      .select({ autoMerge: projects.autoMerge })
      .from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(eq(tickets.number, number))
      .get();
    return mergeModeOf(row?.autoMerge ?? false);
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

  /**
   * The core-fields step of `updateTicket`: changes the given fields of
   * Ticket `number` by the rules for creating one, and bumps its updated
   * time even when no fields are given.
   */
  function updateFields(number: number, input: UpdateTicketInput) {
    const checked = checkTicketChanges(input);
    checkTicketWritable(number);
    if (checked.values.projectId !== undefined) {
      checkProjectWritable(checked.values.projectId);
    }

    const { leftCycles, changedEpic, changedOrigins } = applyTicketChanges(
      number,
      checked,
    );
    publishWith(number, changedEpic, ...changedOrigins);
    for (const id of leftCycles) {
      changes.publish({ type: 'cycle', id });
    }
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
   * The change of `joinEpic`, without its transaction or announcement: run
   * it in the transaction that makes the change. Returns `null` when `child`
   * was in `epic` already, and otherwise the Epic it left, if any.
   */
  function joinEpicStep(
    { epic, child }: EpicChildInput,
    { move }: { move: boolean },
  ): { previous: number | null } | null {
    checkTicketWritable(child);
    const ticket = db
      .select({
        type: tickets.type,
        projectId: tickets.projectId,
        epicNumber: tickets.epicNumber,
      })
      .from(tickets)
      .where(eq(tickets.number, child))
      .get();
    if (!ticket) {
      throw new NotFoundError(`There is no Ticket T${child}.`);
    }
    const previous = ticket.epicNumber;
    checkEpicChild(db, epic, {
      number: child,
      ...ticket,
      epicNumber: move ? null : previous,
    });
    if (previous === epic) {
      return null;
    }
    checkNoBlockerBetween(db, { epic, child });
    db.update(tickets)
      .set({ epicNumber: epic, archivedWithEpic: false, updatedAt: new Date() })
      .where(eq(tickets.number, child))
      .run();
    recordActivity(child, [{ type: 'epic', from: previous, to: epic }]);
    touchTicket(epic);
    syncEpicStatus(epic);
    if (previous !== null) {
      touchTicket(previous);
      syncEpicStatus(previous);
    }
    return { previous };
  }

  /**
   * Makes each of normal Tickets `children` a child of Epic `epic` in the
   * same Project (ADR 0011), and bumps both updated times, all or nothing:
   * if any cannot join `epic`, none does, and the refusal names every one that cannot and
   * why. A Ticket in another Epic is refused, not moved. Returns the
   * children in the order given. The change is announced once, or not at
   * all when every Ticket was in `epic` already.
   */
  function attachTicketsToEpic({ epic, children }: EpicChildrenInput) {
    throwFieldErrors({ children: checkBatchNumbers(children) });

    const joined = db.transaction(() => {
      checkEpic(db, epic);
      return eachOrNone(children, (child) =>
        joinEpicStep({ epic, child }, { move: false }),
      );
    });
    const changed = children.filter((_, index) => joined[index] !== null);
    if (changed.length > 0) {
      changes.publish({ type: 'tickets', numbers: [epic, ...changed] });
    }
    return children.map((child) => getTicket(child));
  }

  /**
   * `detachFromEpic` for each of `ticketNumbers`, all or nothing: if any
   * cannot leave its Epic, none does, and the refusal names every one. They
   * may come from different Epics, and each one's Status follows. A Ticket
   * in no Epic stays as it is. Returns the Tickets in the order given. The
   * change is announced once, or not at all when none was in an Epic.
   */
  function detachTicketsFromEpic(ticketNumbers: number[]): Ticket[] {
    throwFieldErrors({ ticketNumbers: checkBatchNumbers(ticketNumbers) });

    const left = db.transaction(() => eachOrNone(ticketNumbers, leaveEpicStep));
    const epics = left.filter((epic) => epic !== null);
    if (epics.length > 0) {
      changes.publish({
        type: 'tickets',
        numbers: [
          ...new Set(epics),
          ...ticketNumbers.filter((_, index) => left[index] !== null),
        ],
      });
    }
    return ticketNumbers.map((number) => getTicket(number));
  }

  /**
   * Takes Ticket `number` out of its Epic, without a transaction or an
   * announcement, and bumps both updated times. Returns the Epic it left,
   * or `null` when it was in none.
   */
  function leaveEpicStep(number: number): number | null {
    checkTicketWritable(number);
    const ticket = db
      .select({ epicNumber: tickets.epicNumber })
      .from(tickets)
      .where(eq(tickets.number, number))
      .get();
    if (!ticket) {
      throw new NotFoundError(`There is no Ticket T${number}.`);
    }
    if (ticket.epicNumber === null) {
      return null;
    }
    db.update(tickets)
      .set({ epicNumber: null, archivedWithEpic: false, updatedAt: new Date() })
      .where(eq(tickets.number, number))
      .run();
    recordActivity(number, [
      { type: 'epic', from: ticket.epicNumber, to: null },
    ]);
    touchTicket(ticket.epicNumber);
    syncEpicStatus(ticket.epicNumber);
    return ticket.epicNumber;
  }

  /**
   * Makes `child` a child of `epic`, by the rules of `attachTicketsToEpic`; with
   * `move`, a child of another Epic leaves that one first.
   */
  function joinEpic(
    { epic, child }: EpicChildInput,
    { move }: { move: boolean },
  ): Ticket {
    const changed = db.transaction(() =>
      joinEpicStep({ epic, child }, { move }),
    );
    if (changed) {
      changes.publish({
        type: 'tickets',
        numbers: [
          ...(changed.previous === null ? [] : [changed.previous]),
          epic,
          child,
        ],
      });
    }
    return getTicket(child);
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

/** Normalized `labels` for adding or removing, at least one, or a `ValidationError`. */
function checkedLabels(labels: readonly string[]): string[] {
  const normalized = normalizeLabels(labels);
  throwFieldErrors({
    labels:
      normalized.length === 0 ? 'Enter a label.' : checkLabels(normalized),
  });
  return normalized;
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

/**
 * Records a Blocker added or removed between `blocker` and `blocked` on both
 * Tickets, by `actor`. Run it in the transaction that makes the change.
 */
function recordBlocker(
  { recordActivity }: TicketRowContext,
  { blocker, blocked }: BlockerInput,
  change: 'Added' | 'Removed',
) {
  recordActivity(blocked, [{ type: `blockedBy${change}`, number: blocker }]);
  recordActivity(blocker, [{ type: `blocks${change}`, number: blocked }]);
}
