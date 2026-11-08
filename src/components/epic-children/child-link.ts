import {
  type BoardFilter,
  ticketByNumberPath,
  ticketOnBoardPath,
} from '../../app/lib/paths';

/** The Board the Epic's drawer opens over, and its children on it. */
export type ChildrenBoard = {
  /** The Board's own URL, without its filter or `?ticket=`. */
  path: string;
  /** The Board's filter, which a child opened over it keeps. */
  filter: BoardFilter;
  /** The Epic's children on this Board, by Ticket number. */
  onBoard: number[];
};

/**
 * Where Ticket `number` opens from an Epic's drawer: over `board` when it is
 * on it, keeping the Board's scroll, else over its own Board (ADR 0013).
 */
export function childLink(number: number, board: ChildrenBoard | undefined) {
  return board?.onBoard.includes(number)
    ? {
        href: ticketOnBoardPath(board.path, number, board.filter),
        scroll: false,
      }
    : { href: ticketByNumberPath(number) };
}
