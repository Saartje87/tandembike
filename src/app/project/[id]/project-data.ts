import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { appAutopilot } from '../../../autopilot/app-autopilot';
import { boardOf } from '../../../components/board/board-of';
import { appConversations } from '../../../conversations/app-conversations';
import { conversationActivity } from '../../../conversations/conversation-activity';
import { startRunLimit } from '../../../conversations/conversations';
import { appTickets } from '../../../tickets/app-tickets';
import { cycleUnitCount } from '../../../tickets/cycle-units';
import { NotFoundError } from '../../../tickets/errors';
import { openTicketNumber } from '../../lib/paths';

/**
 * A Board's search parameters: `?ticket=` opens a Ticket (ADR 0013), and
 * `?q=` and `?label=` hold its Board filter.
 */
export type BoardSearchParams = Promise<{
  ticket?: string | string[];
  q?: string | string[];
  label?: string | string[];
}>;

export type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

/** A Project's Backlog tab, which can open a Ticket in a drawer. */
export type BacklogPageProps = ProjectPageProps & {
  searchParams: BoardSearchParams;
};

export type CyclePageProps = {
  params: Promise<{ id: string; cycleId: string }>;
  searchParams: BoardSearchParams;
};

/** `run()`, or the not-found page when it throws a `NotFoundError`. */
function orNotFound<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
}

/**
 * The browser tab's title for a Board: `T12 Fix the header` while `?ticket=`
 * opens one of Project `projectId`'s Tickets, else `boardTitle`.
 */
export async function boardPageTitle(
  boardTitle: string,
  projectId: number,
  searchParams: BoardSearchParams,
): Promise<string> {
  const number = openTicketNumber((await searchParams).ticket);
  const ticket =
    number === undefined ? null : findBoardTicket(projectId, number);
  return ticket ? `T${ticket.number} ${ticket.title}` : boardTitle;
}

/**
 * Ticket `number`, if it exists and belongs to Project `projectId`, so its
 * Board can open it; `null` otherwise, and its drawer says it is not found.
 */
export function findBoardTicket(projectId: number, number: number) {
  try {
    const ticket = appTickets('user').getTicket(number);
    return ticket.projectId === projectId ? ticket : null;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
}

/** The Project for the `[id]` segment, or `null` when there is none. */
export async function findProject(params: ProjectPageProps['params']) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) {
    return null;
  }
  try {
    return appTickets('user').getProject(id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
}

/** The Project for the `[id]` segment, or the not-found page. */
export async function loadProject(params: ProjectPageProps['params']) {
  return (await findProject(params)) ?? notFound();
}

/**
 * The Project and Cycle for the `[id]` and `[cycleId]` segments, or the
 * not-found page when either is missing or the Cycle is another Project's.
 */
export async function loadProjectCycle(params: CyclePageProps['params']) {
  const project = await loadProject(params);
  const cycleId = Number((await params).cycleId);
  if (!Number.isSafeInteger(cycleId)) {
    notFound();
  }
  const cycle = orNotFound(() => appTickets('user').getCycle(cycleId));
  if (cycle.projectId !== project.id) {
    notFound();
  }
  return { project, cycle };
}

/**
 * The Project's live Start and Merge runs holding a slot now, idle ones
 * waiting on the User included (ADR 0049), and how many it allows at once.
 */
export function runSlotsOf(projectId: number) {
  const used = appConversations().startRunSlotsInUse(projectId);
  const cap = startRunLimit(
    appTickets('user').getProjectAgentSettings(projectId),
    appTickets('user').getMachineSettings().maxConcurrentRuns,
  );
  return { used, cap };
}

/**
 * The Project's Autopilot switch and Spend ceiling, and what Autopilot has
 * spent on Cycle `cycleId`, for the Active Cycle's Board header.
 */
export function autopilotOf(projectId: number, cycleId: number) {
  const { autopilot, spendCeilingUsd } =
    appTickets('user').getProjectAgentSettings(projectId);
  return {
    autopilot,
    spendCeilingUsd,
    spendUsd: appConversations().autopilotSpend({ projectId, cycleId }),
  };
}

/**
 * What a Board's Triage N button needs (T1318): how many Tickets a Batch
 * triage of the Board, a Cycle's id or null for the Backlog, would list now,
 * and the one open for it, if any (ADR 0047).
 */
export function batchTriageOf(projectId: number, cycleId: number | null) {
  return {
    count: appAutopilot().batchTriageTickets(projectId, cycleId).length,
    openId: appConversations().openBatchTriage(projectId, cycleId)?.id ?? null,
  };
}

/**
 * Cycle `cycleId`'s Tickets, with the Epics planned elsewhere that have a
 * child on the Cycle, so an Epic shows while its children are on it.
 */
export function cycleTicketsWithEpics(projectId: number, cycleId: number) {
  const tickets = appTickets('user');
  const planned = tickets.listTickets({ projectId, cycleId });
  const plannedNumbers = new Set(planned.map(({ number }) => number));
  // An Epic planned elsewhere joins only to hold its children planned here.
  const parents = new Set(
    planned.flatMap(({ epic }) => (epic ? [epic.number] : [])),
  );
  return [
    ...planned,
    ...tickets
      .listTickets({ projectId, type: 'Epic' })
      .filter(
        ({ number }) => parents.has(number) && !plannedNumbers.has(number),
      ),
  ];
}

/**
 * How many Tickets need the User on Project `projectId`'s Active Cycle's
 * Board, unfiltered; 0 without an Active Cycle. The Backlog's Intake is the
 * Backlog's own (ADR 0025).
 */
export function needsYouCountOf(projectId: number): number {
  const active = appTickets('user').activeCycle(projectId);
  if (!active) {
    return 0;
  }
  return boardOf(
    cycleTicketsWithEpics(projectId, active.id),
    conversationActivity(appConversations().activityRows()),
  ).needsYou.count;
}

/**
 * How many rows Needs you → Intake holds on Project `projectId`'s Backlog
 * Board, unfiltered, counted as the Active Cycle's Needs you is.
 */
export function backlogIntakeCountOf(projectId: number): number {
  return boardOf(
    appTickets('user').listTickets({ projectId, cycleId: null }),
    conversationActivity(appConversations().activityRows()),
  ).needsYou.intake.length;
}

/**
 * What Starting a Prepared Cycle is estimated to cost: the Project's cost per
 * Ticket times the Cycle's Ticket units (T1247), null while there are too few
 * runs to estimate.
 */
export function cycleEstimate(
  projectId: number,
  cycleId: number,
): { totalUsd: number | null; units: number } {
  const perTicketUsd = appConversations().startCostEstimate(projectId);
  const units = cycleUnitCount(
    appTickets('user').listTickets({ projectId, cycleId }),
  );
  return {
    totalUsd: perTicketUsd === null ? null : perTicketUsd * units,
    units,
  };
}

/**
 * What Flow's Ticket path shows (ADR 0044): the Backlog's Intake and the
 * Active Cycle's sections, counted by the Board's own derivation, unfiltered,
 * so they match the Board.
 */
export function ticketPathOf(projectId: number) {
  const activity = conversationActivity(appConversations().activityRows());
  const active = appTickets('user').activeCycle(projectId);
  const backlog = boardOf(
    appTickets('user').listTickets({ projectId, cycleId: null }),
    activity,
  );
  const cycle = active
    ? boardOf(cycleTicketsWithEpics(projectId, active.id), activity)
    : null;
  return {
    backlogIntake: backlog.needsYou.intake.length,
    activeCycle:
      active && cycle
        ? {
            id: active.id,
            counts: {
              queued: cycle.queued.length,
              yourWork: cycle.needsYou.yourWork.length,
              inFlight: cycle.epics.length + cycle.inFlight.length,
              actionNeeded: cycle.needsYou.actionNeeded.length,
              review: cycle.needsYou.review.length,
              done: cycle.done.length,
            },
          }
        : null,
  };
}
