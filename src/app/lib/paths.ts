/**
 * Every path in the app. A single item gets a singular segment
 * (`/project/3`), a collection a plural one (`/projects`).
 */

export function projectsPath(): string {
  return '/projects';
}

/** The Stats page: every Project's figures side by side. */
export function statsPath(): string {
  return '/stats';
}

/** The archived Projects, which can be restored from there. */
export function archivedProjectsPath(): string {
  return `${projectsPath()}/archived`;
}

/** A Project's Board. */
export function projectPath(projectId: number): string {
  return `/project/${projectId}`;
}

/** One of a Project's Cycles, as a tab of the Project. */
export function cyclePath(projectId: number, cycleId: number): string {
  return `${projectPath(projectId)}/cycle/${cycleId}`;
}

/** The Board of a Project's Backlog, or with `cycleId`, of that Cycle. */
export function boardPathOf(projectId: number, cycleId: number | null): string {
  return cycleId === null
    ? projectPath(projectId)
    : cyclePath(projectId, cycleId);
}

/** A Project's History: its archived Cycles. */
export function cyclesPath(projectId: number): string {
  return `${projectPath(projectId)}/cycles`;
}

/** A Project's settings, such as its Reference templates. */
export function projectSettingsPath(projectId: number): string {
  return `${projectPath(projectId)}/settings`;
}

/**
 * A Board filter (see `GLOSSARY.md`): a search text, kept as typed, and the
 * Labels a Ticket needs every one of, in the order picked.
 */
export type BoardFilter = { query: string; labels: string[] };

/** The Board filter that hides nothing. */
export const noBoardFilter: BoardFilter = { query: '', labels: [] };

/**
 * The Board filter in a Board's `?q=` and `?label=` parameters: the first
 * `q`, and each `label` once, lower-cased as the Tickets module stores them.
 */
export function boardFilterOf(
  q: string | string[] | undefined,
  label: string | string[] | undefined,
): BoardFilter {
  const query = (Array.isArray(q) ? q[0] : q) ?? '';
  const labels = (Array.isArray(label) ? label : label ? [label] : [])
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== '');
  return { query, labels: [...new Set(labels)] };
}

/**
 * Board `boardPath` narrowed by `filter`, as `?q=<text>&label=a&label=b`,
 * with Ticket `ticket` open in its drawer when given. A blank search is
 * left out.
 */
export function filteredBoardPath(
  boardPath: string,
  filter: BoardFilter,
  ticket?: number,
): string {
  const search = new URLSearchParams();
  if (filter.query.trim() !== '') {
    search.set('q', filter.query);
  }
  for (const label of filter.labels) {
    search.append('label', label);
  }
  if (ticket !== undefined) {
    search.set('ticket', String(ticket));
  }
  const query = search.toString();
  return query === '' ? boardPath : `${boardPath}?${query}`;
}

/**
 * Board `boardPath` with Ticket `number` open in its drawer (ADR 0013),
 * keeping the Board's `filter`. Open it with `scroll={false}`, so the Board
 * keeps its scroll position.
 */
export function ticketOnBoardPath(
  boardPath: string,
  number: number,
  filter: BoardFilter = noBoardFilter,
): string {
  return filteredBoardPath(boardPath, filter, number);
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
