import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { ActivityChange } from '../tickets/activity-change';
import { cycleStates } from '../tickets/cycle-state';
import { paletteColors } from '../tickets/palette';
import { projectIcons } from '../tickets/project-icons';
import { statuses } from '../tickets/status';
import { ticketTypes } from '../tickets/ticket-type';

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
