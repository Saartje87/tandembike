import { useEffect, useRef, useState } from 'react';

import {
  type BoardFilter,
  filteredBoardPath,
  noBoardFilter,
  openTicketNumber,
} from '../../app/lib/paths';

/**
 * A Board's filter (see `GLOSSARY.md`) as the Board holds it: `initial`, the
 * `?q=` and `?label=` it loaded with, shown at once as it changes and written
 * to the URL in place of the history entry (after a pause while the search is
 * typed). Navigating to the Board with another filter, such as none, follows it.
 */
export function useBoardFilter(
  boardPath: string,
  initial: BoardFilter = noBoardFilter,
): [BoardFilter, (next: BoardFilter, typing?: boolean) => void] {
  const [filter, setFilter] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const urlFilter = filteredBoardPath('', initial);
  const [renderedUrlFilter, setRenderedUrlFilter] = useState(urlFilter);
  const [writtenUrlFilter, setWrittenUrlFilter] = useState(urlFilter);
  if (urlFilter !== renderedUrlFilter) {
    setRenderedUrlFilter(urlFilter);
    if (urlFilter !== writtenUrlFilter) {
      setFilter(initial);
      setWrittenUrlFilter(urlFilter);
    }
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (next: BoardFilter, typing = false) => {
    setFilter(next);
    clearTimeout(timer.current);
    const writeUrl = () => {
      // A drawer opened meanwhile stays open.
      const ticket = openTicketNumber(
        new URLSearchParams(window.location.search).get('ticket') ?? undefined,
      );
      window.history.replaceState(
        null,
        '',
        filteredBoardPath(boardPath, next, ticket),
      );
      setWrittenUrlFilter(filteredBoardPath('', next));
    };
    if (typing) {
      timer.current = setTimeout(writeUrl, 300);
    } else {
      writeUrl();
    }
  };
  return [filter, change];
}
