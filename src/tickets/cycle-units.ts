import type { Ticket } from './tickets';

export type PlannedTicket = Pick<
  Ticket,
  'number' | 'type' | 'status' | 'archived'
> & { epic: { number: number } | null };

/**
 * How many units of work a Cycle holds, for its Estimate (GLOSSARY: Estimate):
 * each Ticket counts as one and each Epic as its unarchived, not-Done children
 * planned there, or one when it has none. `planned` is what is planned into
 * the Cycle.
 */
export function cycleUnitCount(planned: PlannedTicket[]): number {
  const live = planned.filter(({ archived }) => !archived);
  const epics = new Set(
    live.filter(({ type }) => type === 'Epic').map(({ number }) => number),
  );
  let units = 0;
  for (const ticket of live) {
    if (ticket.type === 'Epic') {
      const children = live.filter(
        ({ epic, status }) =>
          epic?.number === ticket.number && status !== 'Done',
      ).length;
      units += Math.max(children, 1);
    } else if (!(ticket.epic && epics.has(ticket.epic.number))) {
      units += 1;
    }
  }
  return units;
}
