import { and, asc, eq, gte, sql } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import {
  cycles,
  cycleTickets,
  projects,
  ticketActivity,
  ticketBlockers,
  tickets,
} from '../db/schema';
import type { ActivityChange } from './activity-change';
import type { Project } from './tickets';

/** One Project's figures on the Stats page (see `GLOSSARY.md`). */
export type ProjectStats = {
  project: Project;
  /** Its non-archived Tickets in Todo. */
  todo: number;
  /** Its non-archived Tickets in In progress. */
  inProgress: number;
  /** Its non-archived, not-Done Tickets with an unresolved Blocker. */
  blocked: number;
  /** Its non-archived Tickets an Agent run holds right now. */
  claimed: number;
  /**
   * Its Active Cycle, with how many of the Cycle's Tickets are Done out of
   * all of them, archived ones included; `null` when it has none.
   */
  activeCycle: ActiveCycleProgress | null;
  /**
   * Its Tickets that are Done now and last reached Done within the last
   * 7 days, archived ones included.
   */
  doneLast7Days: number;
};

export type ActiveCycleProgress = {
  id: number;
  title: string;
  done: number;
  total: number;
};

/** Every count of `ProjectStats` summed across Projects. */
export type StatsTotal = Pick<
  ProjectStats,
  'todo' | 'inProgress' | 'blocked' | 'claimed' | 'doneLast7Days'
> & {
  /** How many Projects have an Active Cycle. */
  activeCycles: number;
};

export type Stats = {
  /** One row per non-archived Project, in id order. */
  projects: ProjectStats[];
  total: StatsTotal;
};

const projectColumns = {
  id: projects.id,
  name: projects.name,
  color: projects.color,
  icon: projects.icon,
  archived: projects.archived,
  createdAt: projects.createdAt,
};

/** Counts the grouped rows matching `condition`. */
const countOf = (condition: ReturnType<typeof sql>) =>
  sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`;

/** Whether the Ticket has a Blocker that is neither Done nor archived. */
const hasUnresolvedBlocker = sql`exists (
  select 1 from ${ticketBlockers}
  join ${tickets} as blocker on blocker.number = ${ticketBlockers.blockerNumber}
  where ${ticketBlockers.blockedNumber} = ${tickets.number}
    and blocker.status <> 'Done' and blocker.archived = 0
)`;

/** The Ticket counts of each Project that has any, by Project id. */
function ticketCounts(db: DatabaseConnection) {
  const rows = db
    .select({
      projectId: tickets.projectId,
      todo: countOf(sql`${tickets.status} = 'Todo'`),
      inProgress: countOf(sql`${tickets.status} = 'In progress'`),
      blocked: countOf(
        sql`${tickets.status} <> 'Done' and ${hasUnresolvedBlocker}`,
      ),
      claimed: countOf(sql`${tickets.claimAgentRunId} is not null`),
    })
    .from(tickets)
    .where(and(eq(tickets.archived, false), eq(tickets.type, 'Ticket')))
    .groupBy(tickets.projectId)
    .all();
  return new Map(rows.map(({ projectId, ...count }) => [projectId, count]));
}

const noTickets = { todo: 0, inProgress: 0, blocked: 0, claimed: 0 };

/**
 * Each Active Cycle's progress over its non-Epic Tickets, archived ones
 * included so archiving a Done Ticket does not lower it, by Project id.
 */
function activeCycles(db: DatabaseConnection) {
  const rows = db
    .select({
      projectId: cycles.projectId,
      id: cycles.id,
      title: cycles.title,
      done: countOf(sql`${tickets.status} = 'Done'`),
      total: sql<number>`count(${tickets.number})`,
    })
    .from(cycles)
    .leftJoin(cycleTickets, eq(cycleTickets.cycleId, cycles.id))
    .leftJoin(
      tickets,
      and(
        eq(tickets.number, cycleTickets.ticketNumber),
        eq(tickets.type, 'Ticket'),
      ),
    )
    .where(eq(cycles.state, 'Active'))
    .groupBy(cycles.id)
    .all();
  return new Map(
    rows.map(({ projectId, ...progress }) => [projectId, progress]),
  );
}

const doneWindowMs = 7 * 24 * 60 * 60 * 1000;

/** Whether an Activity change created the Ticket or moved it to Done. */
const createdOrDone = (change: ActivityChange) =>
  change.type === 'created' ||
  (change.type === 'status' && change.to === 'Done');

/**
 * How many non-Epic Tickets, archived ones included, are Done now and last
 * reached Done within the last 7 days, by their current Project id.
 *
 * A Ticket that is Done now reached Done last at or after any Activity entry
 * that moved it to Done or created it: its latest move to Done is that entry
 * or a later one. So one such entry within the window is enough, however
 * often it went back and forth.
 */
function doneLast7Days(db: DatabaseConnection) {
  const since = new Date(Date.now() - doneWindowMs);
  const rows = db
    .select({
      projectId: tickets.projectId,
      number: tickets.number,
      changes: ticketActivity.changes,
    })
    .from(ticketActivity)
    .innerJoin(tickets, eq(tickets.number, ticketActivity.ticketNumber))
    .where(
      and(
        eq(tickets.status, 'Done'),
        eq(tickets.type, 'Ticket'),
        gte(ticketActivity.createdAt, since),
      ),
    )
    .all();
  const numbers = new Map<number, Set<number>>();
  for (const { projectId, number, changes } of rows) {
    if (changes.some(createdOrDone)) {
      const done = numbers.get(projectId) ?? new Set();
      numbers.set(projectId, done.add(number));
    }
  }
  return new Map(
    [...numbers].map(([projectId, done]) => [projectId, done.size]),
  );
}

/** The Total row: each count summed, and how many have an Active Cycle. */
function totalOf(rows: readonly ProjectStats[]): StatsTotal {
  const total: StatsTotal = {
    todo: 0,
    inProgress: 0,
    blocked: 0,
    claimed: 0,
    doneLast7Days: 0,
    activeCycles: 0,
  };
  for (const row of rows) {
    total.todo += row.todo;
    total.inProgress += row.inProgress;
    total.blocked += row.blocked;
    total.claimed += row.claimed;
    total.doneLast7Days += row.doneLast7Days;
    total.activeCycles += row.activeCycle ? 1 : 0;
  }
  return total;
}

export function createStats(db: DatabaseConnection) {
  return {
    /**
     * Every non-archived Project's figures side by side, with their total.
     * Epics are not counted anywhere: their Status follows their children.
     */
    getStats(): Stats {
      const counts = ticketCounts(db);
      const cycleProgress = activeCycles(db);
      const recentlyDone = doneLast7Days(db);
      const rows = db
        .select(projectColumns)
        .from(projects)
        .where(eq(projects.archived, false))
        .orderBy(asc(projects.id))
        .all()
        .map(
          (project): ProjectStats => ({
            project,
            ...(counts.get(project.id) ?? noTickets),
            activeCycle: cycleProgress.get(project.id) ?? null,
            doneLast7Days: recentlyDone.get(project.id) ?? 0,
          }),
        );
      return { projects: rows, total: totalOf(rows) };
    },
  };
}
