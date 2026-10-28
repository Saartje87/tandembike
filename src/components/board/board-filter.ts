import type { BoardFilter } from '../../app/lib/paths';
import type { Ticket } from '../../tickets/tickets';
import { type SelectionDrop, selectionDrop } from './selection-drop';

/** Whether `filter` hides any Ticket. */
export function isFiltering(filter: BoardFilter): boolean {
  return filter.query.trim() !== '' || filter.labels.length > 0;
}

/**
 * Whether `ticket` shows under Board filter `filter`: its title contains the
 * search, trimmed and ignoring case, or its number does, written as `42` or
 * `T42`; and it has every chosen Label.
 */
export function ticketMatches(
  ticket: Pick<Ticket, 'number' | 'title' | 'labels'>,
  filter: BoardFilter,
): boolean {
  const query = filter.query.trim().toLowerCase();
  const digits = query.replace(/^t(?=\d+$)/, '');
  const found =
    query === '' ||
    ticket.title.toLowerCase().includes(query) ||
    (/^\d+$/.test(digits) && String(ticket.number).includes(digits));
  return found && filter.labels.every((label) => ticket.labels.includes(label));
}

/**
 * Status lane `lane`, in full, once the cards shown of it are in order
 * `shown`, `moving` having been dragged there: each hidden Ticket stays just
 * before the shown card it came before, or at the end of the lane, so a card
 * dropped just below shown card B lands straight after B, before any hidden
 * Tickets that follow it. Hidden Tickets keep their order.
 */
export function mergeLaneOrder(
  lane: readonly number[],
  shown: readonly number[],
  moving: readonly number[],
): number[] {
  const isShown = new Set(shown);
  const hiddenBefore = new Map<number, number[]>();
  let hidden: number[] = [];
  for (const number of lane) {
    if (!isShown.has(number)) {
      hidden.push(number);
    } else if (!moving.includes(number)) {
      hiddenBefore.set(number, hidden);
      hidden = [];
    }
  }
  return [
    ...shown.flatMap((number) => [...(hiddenBefore.get(number) ?? []), number]),
    ...hidden,
  ];
}

/**
 * Where selection `moving` lands in Status lane `lane`, in full, when card
 * `source` carries it onto card `target` among the cards shown of it,
 * `shown`, or onto the lane itself: as `selectionDrop` places it among the
 * shown cards, with the hidden Tickets kept as `mergeLaneOrder` keeps them.
 */
export function filteredSelectionDrop(
  lane: readonly number[],
  shown: readonly number[],
  moving: readonly number[],
  source: number,
  target: number | undefined,
): SelectionDrop {
  const laneOrder = mergeLaneOrder(
    lane,
    selectionDrop(shown, moving, source, target).laneOrder,
    moving,
  );
  const last = laneOrder.findLastIndex((number) => moving.includes(number));
  return { before: laneOrder[last + 1] ?? null, laneOrder };
}
