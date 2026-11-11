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

/** The Settings page: the machine-wide limits (ADR 0041). */
export function settingsPath(): string {
  return '/settings';
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

/** A Board section's anchor, which Flow links to. */
export type BoardSection =
  | 'needs-you'
  | 'action-needed'
  | 'review'
  | 'intake'
  | 'in-flight'
  | 'your-work'
  | 'queued'
  | 'done'
  | 'archived';

/** Section `section` of the Board at `boardPath`, scrolled to by its anchor. */
export function boardSectionPath(
  boardPath: string,
  section: BoardSection,
): string {
  return `${boardPath}#${section}`;
}

/** The sections of a Project's Settings, one tab each (ADR 0053). */
export type SettingsSection =
  | 'general'
  | 'repository'
  | 'agent'
  | 'automation'
  | 'commands'
  | 'references';

/** One section of a Project's Settings, opened on its tab. */
export function projectSettingsSectionPath(
  projectId: number,
  section: SettingsSection,
): string {
  return `${projectSettingsPath(projectId)}?section=${section}`;
}

/** The fields of a Project's Settings that other pages link to, by their anchor. */
export type SettingsField =
  | 'repository-path'
  | 'check-command'
  | 'prepare-command'
  | 'run-mode'
  | 'default-agent'
  | 'run-model'
  | 'copilot-run-model'
  | 'autopilot'
  | 'spend-ceiling'
  | 'spend-ceiling-ai-credits'
  | 'auto-triage'
  | 'triage-ceiling'
  | 'triage-ceiling-ai-credits'
  | 'agent-commands'
  | `${string}-command`;

/**
 * The anchor of a Stage's command field on Settings, from its field name in
 * the agent commands, such as `start-epic-command` for `startEpicCommand`.
 */
export function settingsFieldOfStage(field: string): SettingsField {
  return field
    .replace(/Command$/, '-command')
    .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`) as SettingsField;
}

/** One field of a Project's Settings, scrolled to by its anchor. */
export function projectSettingsFieldPath(
  projectId: number,
  field: SettingsField,
): string {
  return `${projectSettingsPath(projectId)}#${field}`;
}

/** A Project's Spars: the list of its Spars, with the Spar button. */
export function sparsPath(projectId: number): string {
  return `${projectPath(projectId)}/spars`;
}

/** One Spar's own page (GLOSSARY: Spar); a Spar's id is its Conversation's. */
export function sparPath(projectId: number, sparId: number): string {
  return `${projectPath(projectId)}/spar/${sparId}`;
}

/** A Project's Flow: how its factory runs, and why work waits (ADR 0044). */
export function projectFlowPath(projectId: number): string {
  return `${projectPath(projectId)}/flow`;
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
 * `href`, a path with its search parameters, with Conversation `id` open in
 * the Conversation dialog as `?conversation=<id>`, or without any when `id`
 * is left out (the dialog hidden). Every other parameter, such as `?ticket=`,
 * stays. Open it with `scroll={false}`.
 */
export function conversationOnPath(href: string, id?: number): string {
  const [path, search = ''] = href.split('?');
  const params = new URLSearchParams(search);
  params.delete('conversation');
  if (id !== undefined) {
    params.set('conversation', String(id));
  }
  const query = params.toString();
  return query === '' ? path : `${path}?${query}`;
}

/** The Conversation `?conversation=` opens, if it is one id. */
export const openConversationId = openTicketNumber;

/**
 * Finds a Ticket by number alone and opens it on its own Board: its open
 * Cycle's, or the Backlog (ADR 0013). Every link to another Ticket uses it.
 */
export function ticketByNumberPath(number: number): string {
  return `/ticket/${number}`;
}

/** The content of Attachment `id`, as a route handler serves it. */
export function attachmentPath(id: number): string {
  return `/attachment/${id}`;
}

/** The id of the Project whose Board is on screen, if any. */
export function projectIdFromPath(pathname: string): number | undefined {
  const match = /^\/project\/(\d+)(?:\/|$)/.exec(pathname);
  return match ? Number(match[1]) : undefined;
}

/**
 * The route the `tandembike` command calls for terminal sessions (ADR 0039).
 * The CLI builds its URL from it, so it is here beside every other path.
 */
export function terminalApiPath(): string {
  return '/api/terminal';
}
