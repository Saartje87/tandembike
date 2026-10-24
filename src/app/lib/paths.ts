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

export function ticketPath(projectId: number, number: number): string {
  return `${projectPath(projectId)}/ticket/${number}`;
}

/** Finds a Ticket by number alone and redirects to its `ticketPath`. */
export function ticketByNumberPath(number: number): string {
  return `/ticket/${number}`;
}

/**
 * Route patterns, for revalidating every Board, Cycle or Ticket page. A
 * `revalidatePath(boardRoute, 'layout')` covers every page of a Project.
 */
export const boardRoute = '/project/[id]';
export const cycleRoute = '/project/[id]/cycle/[cycleId]';
export const ticketRoute = '/project/[id]/ticket/[number]';

/** The id of the Project whose Board or Ticket is on screen, if any. */
export function projectIdFromPath(pathname: string): number | undefined {
  const match = /^\/project\/(\d+)(?:\/|$)/.exec(pathname);
  return match ? Number(match[1]) : undefined;
}
