import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { QuestionEntry } from '../conversations/conversation-state';
import {
  conversationIntents,
  conversationStarters,
  conversationStates,
  permissionStatuses,
  transcriptRoles,
} from '../conversations/conversation-state';
import { runResults } from '../conversations/run-outcome';
import type { ToolActivity } from '../conversations/tool-activity';
import type { WidgetEntry } from '../conversations/widget';
import { type Canvas, stickyAuthors } from '../spars/canvas';
import type { HandOffDraft } from '../spars/spar-moves';
import type { ActivityChange } from '../tickets/activity-change';
import { agentKinds } from '../tickets/agent-kind';
import { agentRunModes } from '../tickets/agent-run-mode';
import { costUnits } from '../tickets/cost-unit';
import { cycleStates } from '../tickets/cycle-state';
import { mergeModes } from '../tickets/merge-mode';
import { paletteColors } from '../tickets/palette';
import { projectIcons } from '../tickets/project-icons';
import { statuses } from '../tickets/status';
import { ticketTypes } from '../tickets/ticket-type';
import {
  type TriageSplit,
  triageCategories,
  triageProposalStatuses,
  triageStates,
} from '../tickets/triage-proposal-state';

/**
 * What the agent command and run mode columns defaulted to before the
 * Playbook (T1218). SQLite cannot alter a column default without rebuilding
 * the table, so the defaults stay and `createProject` sets every one of these
 * explicitly: new Projects start blank and `auto`, stored values are kept.
 */
const legacyAgentCommandDefaults = {
  triageCommand: '/mattpocock-skills:triage',
  startCommand: '/mattpocock-skills:implement',
  startEpicCommand: '/mattpocock-skills:implement-spec',
  retroCommand: '/mattpocock-skills:retro',
};

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** The name trimmed and lower-cased, so uniqueness ignores case. */
  nameKey: text('name_key').notNull().unique(),
  /** A colour from the palette, or null for none. */
  color: text('color', { enum: paletteColors }),
  /** One of the Project icons, or null for the default. */
  icon: text('icon', { enum: projectIcons }),
  /** An archived Project and its Tickets are hidden and read-only. */
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  /** Where Agent runs start: an absolute directory, set only by the User. */
  repositoryPath: text('repository_path'),
  /** The command that defines green for the repository; null while unset. */
  checkCommand: text('check_command'),
  prepareCommand: text('prepare_command'),
  /**
   * Whether Start runs of this Project may overlap, each in its own worktree:
   * off allows one at a time, on up to the Machine cap (ADR 0049).
   */
  parallelRuns: integer('parallel_runs', { mode: 'boolean' })
    .notNull()
    .default(false),
  /** Whether the title fields create through a Conversation. */
  agentMode: integer('agent_mode', { mode: 'boolean' })
    .notNull()
    .default(false),
  /** The permission mode of every run this Project starts (ADR 0029). */
  runMode: text('run_mode', { enum: agentRunModes })
    .notNull()
    .default('default'),
  /** The Agent kind new Conversations start on (ADR 0051); only the User sets it. */
  defaultAgentKind: text('default_agent_kind', { enum: agentKinds })
    .notNull()
    .default('claude-code'),
  /** Whether Autopilot starts the Active Cycle's Eligible work (ADR 0030). */
  autopilot: integer('autopilot', { mode: 'boolean' }).notNull().default(false),
  /** What Autopilot may spend on one Cycle, in dollars; null while unset. */
  spendCeilingUsd: real('spend_ceiling_usd'),
  /** The same in GitHub AI credits, for Copilot runs (ADR 0051); null while unset. */
  spendCeilingAiCredits: real('spend_ceiling_ai_credits'),
  /** Whether Autopilot starts Triage runs on Triage-eligible Tickets (ADR 0040). */
  autoTriage: integer('auto_triage', { mode: 'boolean' })
    .notNull()
    .default(false),
  /** What Auto-triage may spend per local calendar day, in dollars; null while unset. */
  triageCeilingUsd: real('triage_ceiling_usd'),
  /** The same in GitHub AI credits, for Copilot runs (ADR 0051); null while unset. */
  triageCeilingAiCredits: real('triage_ceiling_ai_credits'),
  /** Whether the run that opened a PR merges it itself (ADR 0043). */
  autoMerge: integer('auto_merge', { mode: 'boolean' })
    .notNull()
    .default(false),
  /** The command Triage sends before the Ticket number; null runs the Playbook's. */
  triageCommand: text('triage_command').default(
    legacyAgentCommandDefaults.triageCommand,
  ),
  /** The command Start sends before the Ticket number; null runs the Playbook's. */
  startCommand: text('start_command').default(
    legacyAgentCommandDefaults.startCommand,
  ),
  /** The command Start sends for an Epic; null runs the Playbook's. */
  startEpicCommand: text('start_epic_command').default(
    legacyAgentCommandDefaults.startEpicCommand,
  ),
  /** The command a Retro sends before the Cycle reference; null runs the Playbook's. */
  retroCommand: text('retro_command').default(
    legacyAgentCommandDefaults.retroCommand,
  ),
  /** The command a Spec Conversation sends before the Ticket number; null runs the Playbook's. */
  specCommand: text('spec_command'),
  /** The command a Merge Conversation sends before the Ticket number; null runs the Playbook's. */
  mergeCommand: text('merge_command'),
  /** The command a Plan Conversation sends before the goal; null runs the Playbook's. */
  planCommand: text('plan_command'),
  /** The command a Spar sends before its topic and focus; null runs the Playbook's. */
  sparCommand: text('spar_command'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const tickets = sqliteTable(
  'tickets',
  {
    /** The Ticket number. AUTOINCREMENT, so a number is never reused. */
    number: integer('number').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status', { enum: statuses }).notNull(),
    /** Fixed at creation. An Epic's Status is derived from its children. */
    type: text('type', { enum: ticketTypes }).notNull().default('Ticket'),
    /** An Epic's colour from the palette; null for a normal Ticket. */
    color: text('color', { enum: paletteColors }),
    /** The Epic this Ticket is a child of, in the same Project, or null. */
    epicNumber: integer('epic_number').references(
      (): AnySQLiteColumn => tickets.number,
    ),
    /**
     * The Ticket this one was split from, in any Project, or null. The
     * Tickets module keeps Origin chains from looping.
     */
    originNumber: integer('origin_number').references(
      (): AnySQLiteColumn => tickets.number,
    ),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    claimAgentRunId: text('claim_agent_run_id'),
    claimAgentName: text('claim_agent_name'),
    /**
     * The merge mode the Project gave the Claim when it was taken (ADR 0043);
     * read only while `claimAgentRunId` is set.
     */
    claimMerge: text('claim_merge', { enum: mergeModes }),
    /** The Agent-run ID that filed this Ticket (`X-Tandembike-Run`), or null. */
    filedByRun: text('filed_by_run'),
    position: integer('position').notNull().default(0),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    /**
     * Whether this archived child was archived along with its Epic, so
     * restoring the Epic restores it too. Cleared when it is restored or
     * leaves its Epic.
     */
    archivedWithEpic: integer('archived_with_epic', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('tickets_project_id').on(table.projectId),
    index('tickets_epic_number').on(table.epicNumber),
    index('tickets_origin_number').on(table.originNumber),
  ],
);

/** A Ticket's labels: one row per label, stored trimmed and lower-cased. */
export const ticketLabels = sqliteTable(
  'ticket_labels',
  {
    ticketNumber: integer('ticket_number')
      .notNull()
      .references(() => tickets.number),
    label: text('label').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ticketNumber, table.label] }),
    index('ticket_labels_label').on(table.label),
  ],
);

/**
 * A Ticket's External references, in the order they were added by `id`:
 * one row per reference, stored trimmed and each once per Ticket.
 */
export const ticketExternalReferences = sqliteTable(
  'ticket_external_references',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketNumber: integer('ticket_number')
      .notNull()
      .references(() => tickets.number),
    reference: text('reference').notNull(),
  },
  (table) => [
    uniqueIndex('ticket_external_references_ticket_reference').on(
      table.ticketNumber,
      table.reference,
    ),
  ],
);

/**
 * A Project's Reference templates, in the order they were added by `id`:
 * each turns External reference keys starting with `prefix` into `url`,
 * with `{n}` replaced by the rest of the key. A prefix is unique within its
 * Project.
 */
export const referenceTemplates = sqliteTable(
  'reference_templates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    prefix: text('prefix').notNull(),
    url: text('url').notNull(),
  },
  (table) => [
    uniqueIndex('reference_templates_project_prefix').on(
      table.projectId,
      table.prefix,
    ),
  ],
);

export const commentAuthors = ['user', 'agent'] as const;

/**
 * Comments on a Ticket, oldest first by id. Removing one deletes the row
 * (ADR 0006); `editedAt` is null until the comment is edited.
 */
export const ticketComments = sqliteTable(
  'ticket_comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketNumber: integer('ticket_number')
      .notNull()
      .references(() => tickets.number),
    author: text('author', { enum: commentAuthors }).notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    editedAt: integer('edited_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('ticket_comments_ticket_number').on(table.ticketNumber)],
);

/**
 * Which Tickets block which: Ticket `blockerNumber` must be resolved (Done
 * or archived) before Ticket `blockedNumber` is ready to start. One row per
 * pair; the Tickets module refuses self-dependencies and cycles.
 */
export const ticketBlockers = sqliteTable(
  'ticket_blockers',
  {
    blockerNumber: integer('blocker_number')
      .notNull()
      .references(() => tickets.number),
    blockedNumber: integer('blocked_number')
      .notNull()
      .references(() => tickets.number),
  },
  (table) => [
    primaryKey({ columns: [table.blockerNumber, table.blockedNumber] }),
    index('ticket_blockers_blocked_number').on(table.blockedNumber),
  ],
);

/**
 * A Ticket's acceptance criteria (ADR 0007), in order by `position` within
 * the Ticket. Removing a criterion deletes its row.
 */
export const ticketAcceptanceCriteria = sqliteTable(
  'ticket_acceptance_criteria',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketNumber: integer('ticket_number')
      .notNull()
      .references(() => tickets.number),
    text: text('text').notNull(),
    checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
    position: integer('position').notNull(),
  },
  (table) => [
    index('ticket_acceptance_criteria_ticket_number').on(table.ticketNumber),
  ],
);

/**
 * A Project's Cycles (ADR 0010): goal-led plans, each Prepared, Active or
 * Archived, with at most one Active per Project. A discarded Prepared Cycle
 * deletes its row.
 */
export const cycles = sqliteTable(
  'cycles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    title: text('title').notNull(),
    state: text('state', { enum: cycleStates }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('cycles_project_id').on(table.projectId),
    uniqueIndex('cycles_one_active_per_project')
      .on(table.projectId)
      .where(sql`${table.state} = 'Active'`),
  ],
);

/**
 * Which Tickets each Cycle holds: one row per pair. The Tickets module keeps
 * a Ticket in at most one Cycle that is not Archived; an Archived Cycle's
 * rows are its final membership, kept as history.
 */
export const cycleTickets = sqliteTable(
  'cycle_tickets',
  {
    cycleId: integer('cycle_id')
      .notNull()
      .references(() => cycles.id),
    ticketNumber: integer('ticket_number')
      .notNull()
      .references(() => tickets.number),
  },
  (table) => [
    primaryKey({ columns: [table.cycleId, table.ticketNumber] }),
    index('cycle_tickets_ticket_number').on(table.ticketNumber),
  ],
);

/**
 * A Ticket's Activity (ADR 0009): one row per action that changed it, oldest
 * first by id, with who acted and the list of changes it made as JSON.
 * Deleting a Ticket deletes its rows.
 */
export const ticketActivity = sqliteTable(
  'ticket_activity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketNumber: integer('ticket_number')
      .notNull()
      .references(() => tickets.number),
    actor: text('actor', { enum: commentAuthors }).notNull(),
    changes: text('changes', { mode: 'json' })
      .$type<ActivityChange[]>()
      .notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('ticket_activity_ticket_number').on(table.ticketNumber)],
);

/**
 * A Ticket's Attachments (ADR 0018), in the order added by `id`. The content
 * is a BLOB; name and content never change. Removing one deletes the row.
 */
export const ticketAttachments = sqliteTable(
  'ticket_attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketNumber: integer('ticket_number')
      .notNull()
      .references(() => tickets.number),
    name: text('name').notNull(),
    mediaType: text('media_type').notNull(),
    /** The content's length in bytes. */
    size: integer('size').notNull(),
    author: text('author', { enum: commentAuthors }).notNull(),
    content: blob('content', { mode: 'buffer' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('ticket_attachments_ticket_number').on(table.ticketNumber)],
);

/**
 * A Conversation (ADR 0019): an exchange between the User and an Agent run
 * that Tandembike starts, about a Project and optionally one of its Tickets.
 * `cost` adds up every run of it.
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    ticketNumber: integer('ticket_number').references(() => tickets.number),
    intent: text('intent', { enum: conversationIntents }).notNull(),
    state: text('state', { enum: conversationStates }).notNull(),
    /** Who started it: the User, Autopilot or a Terminal session; older rows read the User. No CHECK constraint, so `terminal` needs no migration. */
    startedBy: text('started_by', { enum: conversationStarters })
      .notNull()
      .default('user'),
    /** The Agent kind it runs on for life (ADR 0051); older rows are Claude Code. */
    agentKind: text('agent_kind', { enum: agentKinds })
      .notNull()
      .default('claude-code'),
    /** The runner's opaque session a reply resumes; set by the first run. */
    sdkSessionId: text('sdk_session_id'),
    /** In `costUnit`; the column keeps its old name (ADR 0051). */
    cost: real('cost_usd').notNull().default(0),
    /** The unit of `cost`, its runner's; older rows are dollars. */
    costUnit: text('cost_unit', { enum: costUnits }).notNull().default('usd'),
    /** Closed by the User: stopped and left out of the Project's list. */
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    /**
     * The Active Cycle Autopilot started it for; its cost counts against that
     * Cycle's Spend ceiling. Null for a hand-started Conversation.
     */
    autopilotCycleId: integer('autopilot_cycle_id'),
    /**
     * Retro: the Cycle it looks back on. Separate from `autopilotCycleId`,
     * so a Retro never counts against the Spend ceiling. Null for others.
     */
    retroCycleId: integer('retro_cycle_id'),
    /**
     * Batch triage: the Board it triages, a Cycle's id, or null for the
     * Backlog. Null for other intents too; the intent tells them apart.
     */
    batchTriageCycleId: integer('batch_triage_cycle_id'),
    /** Batch triage: the Ticket numbers it covers, fixed when it started (T1316). */
    batchTriageTickets: text('batch_triage_tickets', { mode: 'json' }).$type<
      number[]
    >(),
    /** New Ticket: the Cycle the title field was on, a default for the Agent. */
    defaultCycleId: integer('default_cycle_id'),
    /** New Ticket: the Epic the title field was under, a default. */
    defaultEpicNumber: integer('default_epic_number'),
    /** New Ticket: what the title field creates, a default. */
    defaultType: text('default_type', { enum: ticketTypes }),
    /**
     * Start with Parallel runs: the worktree Tandembike made for it, the
     * folder every run of it works in, and what it is detached at. Null
     * for a Conversation that works in the main checkout.
     */
    worktreePath: text('worktree_path'),
    worktreeBase: text('worktree_base'),
    /** Why Tandembike kept the worktree at close or Done: it holds `dirty` or `unpushed` work. */
    worktreeKept: text('worktree_kept', { enum: ['dirty', 'unpushed'] }),
    /** Tandembike removed the worktree; `worktreePath` stays as the record of where it was. */
    worktreeRemoved: integer('worktree_removed', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('conversations_project_id').on(table.projectId),
    index('conversations_ticket_number').on(table.ticketNumber),
  ],
);

/** A Conversation's transcript, in the order written by `id`. */
export const conversationEntries = sqliteTable(
  'conversation_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id),
    role: text('role', { enum: transcriptRoles }).notNull(),
    text: text('text').notNull(),
    /** For a permission request: where it is; null for other entries. */
    permission: text('permission', { enum: permissionStatuses }),
    /** For a permission request: the allow rules its run proposed; null for none. */
    permissionRules: text('permission_rules', { mode: 'json' }).$type<
      string[]
    >(),
    /** For a tool or permission entry: the tool's name; null for other entries and older rows. */
    toolName: text('tool_name'),
    /** For a tool or permission entry: the tool's input as JSON, null when over the cap. */
    toolInput: text('tool_input', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    /** For a tool entry: what it did, as its runner mapped it (ADR 0051); null for older entries. */
    toolActivity: text('tool_activity', { mode: 'json' }).$type<ToolActivity>(),
    /** For a question of the Agent: what it asked and the answers; null for other entries. */
    question: text('question', { mode: 'json' }).$type<QuestionEntry>(),
    /** For a Widget of the Agent: the Widget, the answer and expired; null for other entries. */
    widget: text('widget', { mode: 'json' }).$type<WidgetEntry>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    /**
     * For a permission request: when the User answered it (T1155); null while
     * pending, once expired, for other entries and for older rows.
     */
    answeredAt: integer('answered_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('conversation_entries_conversation_id').on(table.conversationId),
  ],
);

/**
 * One row per run end of a Conversation (GLOSSARY: Run outcome). Written and
 * read only by the Conversations module, and kept when a Conversation is
 * closed.
 */
export const runOutcomes = sqliteTable(
  'run_outcomes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    ticketNumber: integer('ticket_number').references(() => tickets.number),
    /** The Conversation's intent, the Stage. */
    stage: text('stage', { enum: conversationIntents }).notNull(),
    result: text('result', { enum: runResults }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }).notNull(),
    /** What this run cost in `costUnit`, not the Conversation's total. */
    cost: real('cost_usd').notNull(),
    /** The unit of `cost`, its Conversation's; older rows are dollars. */
    costUnit: text('cost_unit', { enum: costUnits }).notNull().default('usd'),
    /** The model from the SDK's init message; null when the run never reported one. */
    model: text('model'),
    /** The `/command` the run's first message started with; null for none. */
    command: text('command'),
    /** Whether Autopilot started this run. */
    startedByAutopilot: integer('started_by_autopilot', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** Whether this run was Autopilot's one automatic resume of a transient end (ADR 0034). */
    transientResume: integer('transient_resume', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [
    index('run_outcomes_conversation_id').on(table.conversationId),
    index('run_outcomes_project_ended').on(table.projectId, table.endedAt),
  ],
);

/**
 * The tokens a Conversation's runs used, one row per model, as running totals
 * across its runs (ADR 0050). Written and read only by the Conversations
 * module. A Conversation without rows is not measured.
 */
export const conversationUsage = sqliteTable(
  'conversation_usage',
  {
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.model] })],
);

/**
 * Triage proposals: what a Triage run recommends for a Ticket, kept as a
 * record after the User decides. Proposals are never deleted, except along
 * with their Ticket.
 */
export const triageProposals = sqliteTable(
  'triage_proposals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketNumber: integer('ticket_number')
      .notNull()
      .references(() => tickets.number),
    /** The Agent run that made it, when it said so. */
    runId: text('run_id'),
    category: text('category', { enum: triageCategories }).notNull(),
    state: text('state', { enum: triageStates }).notNull(),
    reasoning: text('reasoning').notNull(),
    /** The criteria that replace the Ticket's on Approve; null leaves them. */
    acceptanceCriteria: text('acceptance_criteria', {
      mode: 'json',
    }).$type<string[] | null>(),
    /** The Ticket this one duplicates, or null. */
    duplicateOf: integer('duplicate_of'),
    splits: text('splits', { mode: 'json' }).$type<TriageSplit[] | null>(),
    status: text('status', { enum: triageProposalStatuses })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('triage_proposals_ticket_number').on(table.ticketNumber)],
);

/**
 * The settings of the whole machine (ADR 0041): one row, id 1, written only
 * through a Server Action. No row means the defaults.
 */
/**
 * A Project's run and triage models for one Agent kind (ADR 0051); a kind
 * without a row has neither. Only the User sets them.
 */
export const projectAgentModels = sqliteTable(
  'project_agent_models',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    agentKind: text('agent_kind', { enum: agentKinds }).notNull(),
    /** The model its runs start on; null is that agent's own default. */
    runModel: text('run_model'),
    /** The model Triage runs start on; null uses the run model. */
    triageModel: text('triage_model'),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.agentKind] })],
);

export const machineSettings = sqliteTable('machine_settings', {
  id: integer('id').primaryKey(),
  /** The most working runs across all Projects at once. */
  maxConcurrentRuns: integer('max_concurrent_runs').notNull().default(3),
  /** Autopilot's most spend per local day across all Projects; null is none. */
  dailySpendCeilingUsd: real('daily_spend_ceiling_usd'),
  /** The same in GitHub AI credits, for Copilot runs (ADR 0051); null is none. */
  dailySpendCeilingAiCredits: real('daily_spend_ceiling_ai_credits'),
});

/**
 * The app-wide Footprint factors (ADR 0050): one row, id 1, written and read
 * only by the Settings module. No row means the defaults.
 */
export const footprintFactors = sqliteTable('footprint_factors', {
  id: integer('id').primaryKey(),
  /** Wh per 1M Haiku output tokens, data-centre PUE included. */
  haikuWhPerMillion: real('haiku_wh_per_million').notNull(),
  sonnetWhPerMillion: real('sonnet_wh_per_million').notNull(),
  opusWhPerMillion: real('opus_wh_per_million').notNull(),
  /** Grid carbon intensity in gCO₂e per kWh. */
  gridGramsPerKwh: real('grid_grams_per_kwh').notNull(),
});

/**
 * A Spar (GLOSSARY): the User thinks an idea through with an Agent on its own
 * page. One-to-one with its Conversation of intent `spar`, whose id is the
 * Spar's id; the Conversation holds the run, cost, transcript and focus
 * Ticket. Only the Spars module reads or writes it.
 */
export const spars = sqliteTable('spars', {
  id: integer('id')
    .primaryKey()
    .references(() => conversations.id),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id),
  /** The one-line topic the User gave; null for none. */
  topic: text('topic'),
  /** Closed by the User: read-only until reopened. */
  closed: integer('closed', { mode: 'boolean' }).notNull().default(false),
  /** The Ticket its Hand-off filed; null before. */
  outcomeTicketNumber: integer('outcome_ticket_number'),
  /**
   * The Canvas as of the Agent's last turn, with the Agent's own edits since:
   * what the next message tells the Agent changed. Null before the first.
   */
  baseline: text('baseline', { mode: 'json' }).$type<Canvas>(),
  /** Close was asked: closed once the Summarise turn it sent ends. */
  closing: integer('closing', { mode: 'boolean' }).notNull().default(false),
  /** The Write-up's sections, Markdown, empty for none. */
  decisions: text('decisions').notNull().default(''),
  openQuestions: text('open_questions').notNull().default(''),
  nextSteps: text('next_steps').notNull().default(''),
  /** The Agent's Hand-off draft, until the User approves it; null for none. */
  handOffDraft: text('hand_off_draft', { mode: 'json' }).$type<HandOffDraft>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** A Column of a Spar's Canvas (GLOSSARY: Column), in order. */
export const sparColumns = sqliteTable(
  'spar_columns',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sparId: integer('spar_id')
      .notNull()
      .references(() => spars.id),
    /** Its place on the Canvas, from 0. */
    position: integer('position').notNull(),
    title: text('title').notNull(),
  },
  (table) => [index('spar_columns_spar_id').on(table.sparId)],
);

/** A Sticky on a Spar's Canvas (GLOSSARY: Sticky), in its Column's order. */
export const sparStickies = sqliteTable(
  'spar_stickies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sparId: integer('spar_id')
      .notNull()
      .references(() => spars.id),
    columnId: integer('column_id')
      .notNull()
      .references(() => sparColumns.id),
    /** Its place in its Column, from 0. */
    position: integer('position').notNull(),
    title: text('title').notNull(),
    note: text('note'),
    author: text('author', { enum: stickyAuthors }).notNull(),
    /** A Ticket the idea already has work in; null for none. */
    ticketNumber: integer('ticket_number'),
  },
  (table) => [index('spar_stickies_spar_id').on(table.sparId)],
);
