/**
 * Every path in the app. A single item gets a singular segment
 * (`/project/3`), a collection a plural one (`/projects`).
 */

export function projectsPath(): string {
  return '/projects';
}

/** A Project's Board. */
export function projectPath(projectId: number): string {
  return `/project/${projectId}`;
}

/** One of a Project's Cycles, as a tab of the Project. */
export function cyclePath(projectId: number, cycleId: number): string {
  return `${projectPath(projectId)}/cycle/${cycleId}`;
}

/** A Project's History: its archived Cycles. */
export function cyclesPath(projectId: number): string {
  return `${projectPath(projectId)}/cycles`;
}

/**
 * Board `boardPath` with Ticket `number` open in its drawer (ADR 0013). Open
 * it with `scroll={false}`, so the Board keeps its scroll position.
 */
export function ticketOnBoardPath(boardPath: string, number: number): string {
  return `${boardPath}?ticket=${number}`;
}

/**
 * The Ticket a Board's `?ticket=` parameter opens, or `undefined` unless it
 * is one positive whole number.
 */
export function openTicketNumber(
  value: string | string[] | undefined,
): number | undefined {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return undefined;
  }
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

/**
 * Finds a Ticket by number alone and opens it on its own Board: its open
 * Cycle's, or the Backlog (ADR 0013). Every link to another Ticket uses it.
 */
export function ticketByNumberPath(number: number): string {
  return `/ticket/${number}`;
}

/**
 * Route patterns, for revalidating every Backlog or Cycle Board, and with
 * them the Ticket drawers they open (ADR 0013). A
 * `revalidatePath(boardRoute, 'layout')` covers every page of a Project.
 */
export const boardRoute = '/project/[id]';
export const cycleRoute = '/project/[id]/cycle/[cycleId]';

/** The id of the Project whose Board is on screen, if any. */
export function projectIdFromPath(pathname: string): number | undefined {
  const match = /^\/project\/(\d+)(?:\/|$)/.exec(pathname);
  return match ? Number(match[1]) : undefined;
}
