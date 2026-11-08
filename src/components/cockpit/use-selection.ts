import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { moveTicketsToCycle } from '../../app/cycles/actions';
import { archiveTickets, moveTicketsToEpic } from '../../app/tickets/actions';
import type { BatchFailure } from '../../tickets/errors';
import type { SelectMode } from './select-click';

/** The lists of the Board whose rows can be selected. */
export type SelectionList =
  | 'actionNeeded'
  | 'review'
  | 'intake'
  | 'inFlight'
  | 'yourWork'
  | 'queued'
  | 'done';

/** The selectable rows of each list, by number, in the order shown. */
export type SelectionLists = Record<SelectionList, number[]>;

/**
 * The Board's row selection: which rows are picked, with the gestures that
 * pick them (a click, Cmd/Ctrl-click, or a Shift-click range within one
 * list), Escape to clear, and the actions the selection bar offers. Tickets
 * that left the lists drop out of the selection. The Tickets an action
 * refuses stay selected, with the reason in `refusals`; a refusal of the
 * whole action, or of a drag the Board saves, is its `error`.
 */
export function useSelection(lists: SelectionLists, projectId: number) {
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const anchor = useRef<{ number: number; list: SelectionList } | undefined>(
    undefined,
  );
  const [refusals, setRefusals] = useState<BatchFailure[]>();
  const [error, setError] = useState<string>();
  const [changing, startChange] = useTransition();
  const selection = Object.values(lists)
    .flat()
    .filter((number) => picked.has(number));
  const shownRefusals = refusals?.filter(({ number }) =>
    selection.includes(number),
  );
  const clear = useCallback(() => {
    setPicked(new Set());
    setRefusals(undefined);
    setError(undefined);
    anchor.current = undefined;
  }, []);
  const hasSelection = picked.size > 0;
  useEffect(() => {
    if (!hasSelection) {
      return;
    }
    const clearOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !(
          event.target instanceof Element &&
          event.target.closest(
            'input:not([type="checkbox"]), textarea, select, dialog, [role="dialog"]',
          )
        )
      ) {
        clear();
      }
    };
    document.addEventListener('keydown', clearOnEscape);
    return () => document.removeEventListener('keydown', clearOnEscape);
  }, [hasSelection, clear]);

  const select = (number: number, list: SelectionList, mode: SelectMode) => {
    setRefusals(undefined);
    setError(undefined);
    const numbers = lists[list];
    const from =
      mode === 'range' && anchor.current?.list === list
        ? numbers.indexOf(anchor.current.number)
        : -1;
    if (from >= 0) {
      const to = numbers.indexOf(number);
      const range = numbers.slice(Math.min(from, to), Math.max(from, to) + 1);
      setPicked((current) => new Set([...current, ...range]));
      return;
    }
    anchor.current = { number, list };
    setPicked((current) => {
      const next = new Set(current);
      if (mode === 'toggle' && next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  };
  /** What a row of `list` needs to be selectable. */
  const selectable = (number: number, list: SelectionList) => ({
    selected: picked.has(number),
    onSelect: (mode: SelectMode) => select(number, list, mode),
  });
  const withoutMoved = (numbers: number[], keep: Set<number> = new Set()) =>
    setPicked(
      (current) =>
        new Set(
          [...current].filter(
            (number) => !numbers.includes(number) || keep.has(number),
          ),
        ),
    );
  const moveToCycle = (cycleId: number | null) => {
    const numbers = selection;
    setError(undefined);
    setRefusals(undefined);
    startChange(async () => {
      const result = await moveTicketsToCycle({
        projectId,
        cycleId,
        ticketNumbers: numbers,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Only the moved Tickets leave: rows picked meanwhile stay selected.
      withoutMoved(numbers, new Set(result.failed.map(({ number }) => number)));
      if (result.failed.length > 0) {
        setRefusals(result.failed);
      }
    });
  };
  const addToEpic = (epic: number) => {
    const numbers = selection;
    setError(undefined);
    setRefusals(undefined);
    startChange(async () => {
      const result = await moveTicketsToEpic({ epic, children: numbers });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      withoutMoved(numbers);
    });
  };
  const archive = () => {
    const numbers = selection;
    setError(undefined);
    setRefusals(undefined);
    startChange(async () => {
      const result = await archiveTickets({ ticketNumbers: numbers });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      withoutMoved(numbers);
    });
  };

  return {
    selection,
    refusals: shownRefusals,
    error,
    setError,
    changing,
    clear,
    selectable,
    moveToCycle,
    addToEpic,
    archive,
  };
}
