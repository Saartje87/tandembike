import type { EpicChild, RelatedTicket } from '../../tickets/tickets';

/**
 * A direct Blocker of an Epic's children from outside the Epic, such as a
 * Ticket of another Epic or Project, with the children it blocks.
 */
export type OutsideBlocker = Pick<
  RelatedTicket,
  'number' | 'title' | 'status' | 'projectId'
> & {
  /** The Epic's children it blocks, by Ticket number. */
  blocks: number[];
};

/** A node of an Epic's Order diagram, at its row and column from 0. */
export type OrderNode = { row: number; column: number } & (
  | { outside: false; ticket: EpicChild }
  | { outside: true; ticket: OutsideBlocker }
);

/**
 * An arrow from a Blocker to the child it blocks, by Ticket number; an
 * `outside` one comes from a Blocker outside the Epic.
 */
export type OrderEdge = { from: number; to: number; outside: boolean };

/** An Epic's Order diagram: its nodes, by row then column, and arrows. */
export type OrderLayout = {
  rows: number;
  columns: number;
  nodes: OrderNode[];
  edges: OrderEdge[];
};

/** A node before it has its row and column. */
type Placing =
  | { outside: false; ticket: EpicChild }
  | { outside: true; ticket: OutsideBlocker };

/**
 * Lays out an Epic's children as a layered graph read top to bottom, to show
 * the order to work them in. Archived children are left out.
 *
 * - Row: each child sits one row below its deepest Blocker, and in the top
 *   row when it has none. A Blocker from `outside` the Epic sits one row
 *   above the highest child it blocks, and its own Blockers are not
 *   followed. Blockers cannot form cycles, so this ends.
 * - Column: one barycenter pass, top down. Each Ticket goes under the mean
 *   column of its Blockers, as far as its row leaves room. Ties, and Tickets
 *   with no Blockers in the diagram (after the others), go by Ticket number.
 */
export function layoutEpicOrder(
  items: EpicChild[],
  outside: OutsideBlocker[] = [],
): OrderLayout {
  const children = items.filter((ticket) => !ticket.archived);
  const byNumber = new Map(children.map((ticket) => [ticket.number, ticket]));
  const outsideOf = new Map(
    outside
      .map((ticket) => ({
        ...ticket,
        blocks: ticket.blocks.filter((number) => byNumber.has(number)),
      }))
      .filter((ticket) => ticket.blocks.length > 0)
      .map((ticket) => [ticket.number, ticket]),
  );
  // A child's Blockers in the diagram: its fellow children, then those from
  // outside the Epic.
  const blockersOf = (ticket: EpicChild): OrderEdge[] => [
    ...ticket.blockedBy
      .filter((number) => byNumber.has(number))
      .map((from) => ({ from, to: ticket.number, outside: false })),
    ...[...outsideOf.values()]
      .filter((blocker) => blocker.blocks.includes(ticket.number))
      .map(({ number }) => ({
        from: number,
        to: ticket.number,
        outside: true,
      })),
  ];

  const rowOf = new Map<number, number>();
  const placeRow = (ticket: EpicChild): number => {
    const known = rowOf.get(ticket.number);
    if (known !== undefined) {
      return known;
    }
    const row = Math.max(
      0,
      ...blockersOf(ticket).map(({ from, outside }) => {
        const blocker = byNumber.get(from);
        return outside || blocker === undefined ? 1 : placeRow(blocker) + 1;
      }),
    );
    rowOf.set(ticket.number, row);
    return row;
  };

  const rows: Placing[][] = [];
  const addToRow = (row: number, placing: Placing) => {
    rows[row] = [...(rows[row] ?? []), placing];
  };
  for (const ticket of children) {
    addToRow(placeRow(ticket), { outside: false, ticket });
  }
  // Every child has its row by now, so each one an outside Blocker blocks.
  for (const ticket of outsideOf.values()) {
    const highest = Math.min(
      ...ticket.blocks.map((number) => rowOf.get(number) ?? 1),
    );
    addToRow(highest - 1, { outside: true, ticket });
  }

  const columnOf = new Map<number, number>();
  const nodes: OrderNode[] = [];
  rows.forEach((placings, row) => {
    const keyed = placings.map((placing) => {
      const columns = placing.outside
        ? []
        : blockersOf(placing.ticket).map(({ from }) => columnOf.get(from) ?? 0);
      const center =
        columns.length > 0
          ? columns.reduce((sum, column) => sum + column, 0) / columns.length
          : undefined;
      return { placing, center };
    });
    keyed.sort(
      (a, b) =>
        compareCenters(a.center, b.center) ||
        a.placing.ticket.number - b.placing.ticket.number,
    );
    let column = -1;
    for (const { placing, center } of keyed) {
      column = Math.max(column + 1, Math.round(center ?? 0));
      columnOf.set(placing.ticket.number, column);
      nodes.push({ ...placing, row, column });
    }
  });

  const edges = children
    .flatMap(blockersOf)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  return {
    rows: rows.length,
    columns: Math.max(0, ...nodes.map((node) => node.column + 1)),
    nodes,
    edges,
  };
}

/** Orders by mean Blocker column, a Ticket without one after the others. */
function compareCenters(a: number | undefined, b: number | undefined): number {
  if (a === undefined || b === undefined) {
    return (a === undefined ? 1 : 0) - (b === undefined ? 1 : 0);
  }
  return a - b;
}

/**
 * The direct Blockers of the unarchived `children` of an Epic from outside
 * it, by Ticket number, each with the children it blocks. `blockedByOf`
 * gives a child's Blockers, as `listBlockers` does. An archived Blocker is
 * left out.
 */
export function outsideBlockersOf(
  children: EpicChild[],
  blockedByOf: (number: number) => RelatedTicket[],
): OutsideBlocker[] {
  const childNumbers = new Set(children.map((child) => child.number));
  const found = new Map<number, OutsideBlocker>();
  for (const child of children) {
    if (child.archived) {
      continue;
    }
    for (const blocker of blockedByOf(child.number)) {
      if (blocker.archived || childNumbers.has(blocker.number)) {
        continue;
      }
      const { number, title, status, projectId } = blocker;
      const known = found.get(number) ?? {
        number,
        title,
        status,
        projectId,
        blocks: [],
      };
      found.set(number, { ...known, blocks: [...known.blocks, child.number] });
    }
  }
  return [...found.values()].sort((a, b) => a.number - b.number);
}
