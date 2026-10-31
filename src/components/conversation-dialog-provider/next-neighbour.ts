/**
 * The item to show after one was removed: the one that took its place, else
 * the one before it, else none. `remaining` is the list without the removed
 * item and `removedIndex` is where that item was.
 */
export const nextNeighbour = <T>(
  remaining: T[],
  removedIndex: number,
): T | undefined => remaining[removedIndex] ?? remaining[removedIndex - 1];
