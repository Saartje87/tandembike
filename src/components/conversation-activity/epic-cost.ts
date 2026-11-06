import type { Ticket } from '../../tickets/tickets';

/**
 * What an Epic has cost in USD: its own Conversations plus its children's,
 * from the per-Ticket totals of the activity (T1066).
 */
export const epicCost = (
  epic: Pick<Ticket, 'number'> & { children: readonly { number: number }[] },
  cost: Record<number, number>,
): number =>
  [epic.number, ...epic.children.map(({ number }) => number)].reduce(
    (sum, number) => sum + (cost[number] ?? 0),
    0,
  );
