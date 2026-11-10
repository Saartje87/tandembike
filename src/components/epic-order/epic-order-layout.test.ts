import { describe, expect, it } from 'vitest';

import { anEpicChild } from '../../test/fixtures';
import type { EpicChild, RelatedTicket } from '../../tickets/tickets';
import {
  layoutEpicOrder,
  type OutsideBlocker,
  outsideBlockersOf,
} from './epic-order-layout';

function child(
  number: number,
  blockedBy: number[] = [],
  extra: Partial<EpicChild> = {},
): EpicChild {
  return anEpicChild({
    number,
    title: `Ticket ${number}`,
    blockedBy,
    blocked: blockedBy.length > 0,
    ...extra,
  });
}

/** Each node as `T<number>@<row>:<column>`, in the order returned. */
function placed(layout: ReturnType<typeof layoutEpicOrder>): string[] {
  return layout.nodes.map(
    (node) => `T${node.ticket.number}@${node.row}:${node.column}`,
  );
}

describe('layoutEpicOrder', () => {
  it('puts children without Blockers in one row, by Ticket number', () => {
    const layout = layoutEpicOrder([child(7), child(3), child(5)]);

    expect(placed(layout)).toEqual(['T3@0:0', 'T5@0:1', 'T7@0:2']);
    expect(layout.rows).toBe(1);
    expect(layout.columns).toBe(3);
    expect(layout.edges).toEqual([]);
  });

  it('puts each child one row below its deepest Blocker, with an arrow from each Blocker', () => {
    // 1 → 2 → 4, and 1 → 4: 4 sits below 2, its deepest Blocker.
    const layout = layoutEpicOrder([child(4, [1, 2]), child(2, [1]), child(1)]);

    expect(placed(layout)).toEqual(['T1@0:0', 'T2@1:0', 'T4@2:0']);
    expect(layout.rows).toBe(3);
    expect(layout.columns).toBe(1);
    expect(layout.edges).toEqual([
      { from: 1, to: 2, outside: false },
      { from: 1, to: 4, outside: false },
      { from: 2, to: 4, outside: false },
    ]);
  });

  it('orders a row by the mean column of each Ticket’s Blockers', () => {
    const layout = layoutEpicOrder([
      child(1),
      child(2),
      child(3),
      child(4, [3]),
      child(5, [1]),
      child(6, [1, 3]),
    ]);

    expect(placed(layout)).toEqual([
      'T1@0:0',
      'T2@0:1',
      'T3@0:2',
      'T5@1:0',
      'T6@1:1',
      'T4@1:2',
    ]);
  });

  it('places a Ticket under its Blockers when its row has room', () => {
    const layout = layoutEpicOrder([
      child(1),
      child(2),
      child(3),
      child(4, [3]),
    ]);

    expect(placed(layout)).toContain('T4@1:2');
    expect(layout.columns).toBe(3);
  });

  it('breaks a tie in a row by Ticket number', () => {
    const layout = layoutEpicOrder([
      child(1),
      child(2),
      child(3),
      child(9, [2]),
      child(8, [2]),
    ]);

    expect(placed(layout).slice(3)).toEqual(['T8@1:1', 'T9@1:2']);
  });

  it('leaves out archived children and their arrows', () => {
    const layout = layoutEpicOrder([
      child(1),
      child(2, [1], { archived: true }),
      child(3, [2]),
    ]);

    expect(placed(layout)).toEqual(['T1@0:0', 'T3@0:1']);
    expect(layout.edges).toEqual([]);
  });

  it('puts a Blocker from outside the Epic one row above the child it blocks', () => {
    const layout = layoutEpicOrder(
      [child(1), child(2, [1]), child(3, [2, 70])],
      [outside(70, [3])],
    );

    expect(placed(layout)).toEqual(['T1@0:0', 'T2@1:0', 'T70@1:1', 'T3@2:1']);
    expect(layout.nodes.map((node) => node.outside)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(layout.edges).toContainEqual({ from: 70, to: 3, outside: true });
    expect(layout.edges).toContainEqual({ from: 2, to: 3, outside: false });
  });

  it('moves a child whose only Blocker is outside the Epic below the top row', () => {
    const layout = layoutEpicOrder(
      [child(1), child(3, [60])],
      [outside(60, [3])],
    );

    expect(placed(layout)).toEqual(['T1@0:0', 'T60@0:1', 'T3@1:1']);
  });

  it('draws one node for an outside Blocker of several children, above the highest', () => {
    const layout = layoutEpicOrder(
      [child(1), child(2, [1, 80]), child(3, [2, 80])],
      [outside(80, [2, 3])],
    );

    expect(placed(layout).filter((each) => each.startsWith('T80'))).toEqual([
      'T80@0:1',
    ]);
    expect(layout.edges.filter((edge) => edge.from === 80)).toEqual([
      { from: 80, to: 2, outside: true },
      { from: 80, to: 3, outside: true },
    ]);
  });

  it('leaves out an outside Blocker of archived children only', () => {
    const layout = layoutEpicOrder(
      [child(1), child(2, [90], { archived: true })],
      [outside(90, [2])],
    );

    expect(placed(layout)).toEqual(['T1@0:0']);
    expect(layout.edges).toEqual([]);
  });
});

function outside(number: number, blocks: number[]): OutsideBlocker {
  return {
    number,
    title: `Outside ${number}`,
    status: 'In progress',
    projectId: 2,
    blocks,
  };
}

describe('outsideBlockersOf', () => {
  const related = (
    number: number,
    extra: Partial<RelatedTicket> = {},
  ): RelatedTicket => ({
    number,
    title: `Ticket ${number}`,
    status: 'Todo',
    projectId: 1,
    archived: false,
    resolved: false,
    ...extra,
  });

  it('collects each unarchived child’s Blockers from outside the Epic, once each', () => {
    const blockers: Record<number, RelatedTicket[]> = {
      2: [related(1), related(40, { projectId: 2 })],
      3: [related(40, { projectId: 2 }), related(41)],
      4: [related(42)],
    };

    expect(
      outsideBlockersOf(
        [child(1), child(2), child(3), child(4, [], { archived: true })],
        (number) => blockers[number] ?? [],
      ),
    ).toEqual([
      {
        number: 40,
        title: 'Ticket 40',
        status: 'Todo',
        projectId: 2,
        blocks: [2, 3],
      },
      {
        number: 41,
        title: 'Ticket 41',
        status: 'Todo',
        projectId: 1,
        blocks: [3],
      },
    ]);
  });

  it('leaves out an archived Blocker and an archived child of the Epic', () => {
    expect(
      outsideBlockersOf([child(1), child(5, [], { archived: true })], () => [
        related(5, { archived: true }),
        related(50, { archived: true }),
      ]),
    ).toEqual([]);
  });
});
