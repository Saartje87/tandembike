import { asc, eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { cycles, projects } from '../db/schema';
import type { ChangeChannel } from './changes';
import type { CycleState } from './cycle-state';
import { NotFoundError } from './errors';
import { checkTitle, throwFieldErrors } from './rules';

/** A goal-led plan within one Project (ADR 0010). */
export type Cycle = {
  id: number;
  projectId: number;
  /** One line, trimmed: the goal it works towards. */
  title: string;
  state: CycleState;
  createdAt: Date;
};

export type CreateCycleInput = { projectId: number; title: string };

export type RenameCycleInput = { title: string };

const cycleColumns = {
  id: cycles.id,
  projectId: cycles.projectId,
  title: cycles.title,
  state: cycles.state,
  createdAt: cycles.createdAt,
};

/** A trimmed Cycle title, or a `ValidationError` when it breaks the rules. */
function checkedCycleTitle(rawTitle: string): string {
  const title = rawTitle.trim();
  throwFieldErrors({ title: checkTitle(title) });
  return title;
}

/** Throws a `NotFoundError` unless Project `id` exists. */
function checkProjectExists(db: DatabaseConnection, id: number) {
  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id))
    .get();
  if (!project) {
    throw new NotFoundError(`There is no Project with id ${id}.`);
  }
}

/**
 * The Tickets module's Cycle functions, spread into `createTickets`: they
 * share its database and change channel.
 */
export function createCycles(db: DatabaseConnection, changes: ChangeChannel) {
  function getCycle(id: number): Cycle {
    const cycle = db
      .select(cycleColumns)
      .from(cycles)
      .where(eq(cycles.id, id))
      .get();
    if (!cycle) {
      throw new NotFoundError(`There is no Cycle with id ${id}.`);
    }
    return cycle;
  }

  return {
    getCycle,

    /** Every Cycle of Project `projectId`, oldest first. */
    listCycles(projectId: number): Cycle[] {
      checkProjectExists(db, projectId);
      return db
        .select(cycleColumns)
        .from(cycles)
        .where(eq(cycles.projectId, projectId))
        .orderBy(asc(cycles.id))
        .all();
    },

    /** Creates an empty, Prepared Cycle in a Project. */
    createCycle(input: CreateCycleInput): Cycle {
      const title = checkedCycleTitle(input.title);
      checkProjectExists(db, input.projectId);
      const cycle = db
        .insert(cycles)
        .values({
          projectId: input.projectId,
          title,
          state: 'Prepared',
          createdAt: new Date(),
        })
        .returning(cycleColumns)
        .get();
      changes.publish({ type: 'cycle', id: cycle.id });
      return cycle;
    },

    /** Renames Cycle `id` by the rules for creating one. */
    renameCycle(id: number, input: RenameCycleInput): Cycle {
      const title = checkedCycleTitle(input.title);
      const cycle = db
        .update(cycles)
        .set({ title })
        .where(eq(cycles.id, id))
        .returning(cycleColumns)
        .get();
      if (!cycle) {
        throw new NotFoundError(`There is no Cycle with id ${id}.`);
      }
      changes.publish({ type: 'cycle', id });
      return cycle;
    },

    /** Deletes Prepared Cycle `id`: a plan the User no longer wants. */
    discardCycle(id: number): void {
      getCycle(id);
      db.delete(cycles).where(eq(cycles.id, id)).run();
      changes.publish({ type: 'cycle', id });
    },
  };
}
