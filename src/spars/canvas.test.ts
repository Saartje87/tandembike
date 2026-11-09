// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { errorFrom } from '../test/tickets';
import {
  NotAllowedError,
  NotFoundError,
  ValidationError,
} from '../tickets/errors';
import { applyCanvasOps, type Canvas, type CanvasOp } from './canvas';

const canvas: Canvas = {
  columns: [
    {
      id: 1,
      title: 'Ideas',
      stickies: [
        { id: 10, title: 'A', note: null, author: 'user', ticketNumber: null },
        { id: 11, title: 'B', note: null, author: 'agent', ticketNumber: null },
      ],
    },
    { id: 2, title: 'Keep', stickies: [] },
  ],
};

const apply = (ops: CanvasOp[], author: 'user' | 'agent' = 'user') => {
  let next = 100;
  return applyCanvasOps(canvas, ops, author, () => next++);
};

const shape = (result: Canvas) =>
  result.columns.map(({ title, stickies }) => [
    title,
    stickies.map(({ title: sticky }) => sticky),
  ]);

describe('Applying Canvas edits', () => {
  it('adds, renames, moves and removes Columns', () => {
    expect(
      shape(
        apply([
          { op: 'addColumn', title: ' Risks ', index: 1 },
          { op: 'renameColumn', columnId: 2, title: 'Kept' },
          { op: 'moveColumn', columnId: 1, index: 9 },
        ]),
      ),
    ).toEqual([
      ['Risks', []],
      ['Kept', []],
      ['Ideas', ['A', 'B']],
    ]);
    expect(shape(apply([{ op: 'removeColumn', columnId: 2 }]))).toEqual([
      ['Ideas', ['A', 'B']],
    ]);
  });

  it('refuses to remove a Column that holds Stickies', () => {
    const error = errorFrom(() => apply([{ op: 'removeColumn', columnId: 1 }]));
    expect(error).toBeInstanceOf(NotAllowedError);
    expect((error as Error).message).toBe(
      'The Column "Ideas" still holds 2 Stickies. Move or remove them first.',
    );
  });

  it('adds a Sticky with its author, edits it, moves it between Columns and removes it', () => {
    const added = apply(
      [
        {
          op: 'addSticky',
          columnId: 1,
          title: 'C',
          note: ' Why ',
          ticketNumber: 42,
          index: 0,
        },
      ],
      'agent',
    );
    expect(added.columns[0].stickies[0]).toEqual({
      id: 100,
      title: 'C',
      note: 'Why',
      author: 'agent',
      ticketNumber: 42,
    });

    const result = apply([
      {
        op: 'editSticky',
        stickyId: 10,
        title: 'A2',
        note: '',
        ticketNumber: 7,
      },
      { op: 'moveSticky', stickyId: 10, columnId: 2 },
      { op: 'moveSticky', stickyId: 11, columnId: 2, index: 0 },
      { op: 'removeSticky', stickyId: 11 },
    ]);
    expect(result.columns[1].stickies).toEqual([
      { id: 10, title: 'A2', note: null, author: 'user', ticketNumber: 7 },
    ]);
    expect(result.columns[0].stickies).toEqual([]);
  });

  it('moves a Sticky within its Column', () => {
    expect(
      shape(apply([{ op: 'moveSticky', stickyId: 10, columnId: 1, index: 1 }])),
    ).toEqual([
      ['Ideas', ['B', 'A']],
      ['Keep', []],
    ]);
  });

  it('refuses an unknown Column or Sticky, and a blank title, all or nothing', () => {
    expect(
      errorFrom(() => apply([{ op: 'renameColumn', columnId: 9, title: 'X' }])),
    ).toBeInstanceOf(NotFoundError);
    expect(
      errorFrom(() => apply([{ op: 'removeSticky', stickyId: 9 }])),
    ).toBeInstanceOf(NotFoundError);
    expect(
      errorFrom(() => apply([{ op: 'addSticky', columnId: 1, title: '  ' }])),
    ).toBeInstanceOf(ValidationError);
    expect(
      errorFrom(() =>
        apply([
          { op: 'removeSticky', stickyId: 10 },
          { op: 'removeColumn', columnId: 1 },
        ]),
      ),
    ).toBeInstanceOf(NotAllowedError);
  });
});
