import type { Ticket } from './tickets';

/**
 * Whether Ticket `blocker` no longer holds back Ticket `blocked`, the one
 * Blocker rule (GLOSSARY: Blocker, T828): it is Done, archived, or an In
 * progress sibling in the same Epic while that Epic is claimed, since the
 * Epic's run works its children on one branch. `resolvedBlockerSql` in
 * `blocker-sql.ts` is the same rule for queries.
 *
 * Its own module so client components can use it without bundling
 * `tickets.ts`, which imports Node built-ins.
 */
export function blockerResolved(
  blocker: Pick<Ticket, 'status' | 'archived' | 'epic'>,
  blocked: Pick<Ticket, 'epic'>,
): boolean {
  return (
    blocker.status === 'Done' ||
    blocker.archived ||
    (blocker.status === 'In progress' &&
      blocker.epic !== null &&
      blocker.epic.number === blocked.epic?.number &&
      blocker.epic.claim !== null)
  );
}
