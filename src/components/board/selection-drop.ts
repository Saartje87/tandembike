/** Where a dragged selection lands in a Status lane. */
export type SelectionDrop = {
  /** The card it lands just before, or `null` for the end of the lane. */
  before: number | null;
  /** The lane's Ticket numbers once it has landed. */
  laneOrder: number[];
};

/**
 * Where selection `moving`, in Board order, lands in `lane` when card
 * `source` carries it onto card `target`, or onto the lane itself when
 * `target` is undefined: before the card dropped on, after it when `source`
 * came from above it in the same lane, at the next unselected card when it
 * is itself selected, and at the end of a lane dropped on as a whole.
 */
export function selectionDrop(
  lane: readonly number[],
  moving: readonly number[],
  source: number,
  target: number | undefined,
): SelectionDrop {
  const firstUnselectedFrom = (from: number) =>
    lane.slice(from).find((number) => !moving.includes(number)) ?? null;
  const targetIndex = target === undefined ? -1 : lane.indexOf(target);
  const sourceIndex = lane.indexOf(source);
  const before =
    target === undefined || targetIndex < 0
      ? null
      : moving.includes(target) ||
          (sourceIndex >= 0 && sourceIndex < targetIndex)
        ? firstUnselectedFrom(targetIndex + 1)
        : target;
  const laneOrder = lane.filter((number) => !moving.includes(number));
  laneOrder.splice(
    before === null ? laneOrder.length : laneOrder.indexOf(before),
    0,
    ...moving,
  );
  return { before, laneOrder };
}
