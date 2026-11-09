import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { editSparCanvas } from '../../app/spars/actions';
import type { Canvas } from '../../spars/canvas';
import { keyboardDrag, stubDragAndDrop } from '../../test/drag-and-drop';
import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import { SparCanvas } from './spar-canvas';

vi.mock('../../app/spars/actions', () => ({ editSparCanvas: vi.fn() }));

stubDragAndDrop();

const canvas: Canvas = {
  columns: [
    {
      id: 1,
      title: 'Ideas',
      stickies: [
        { id: 10, title: 'Mine', note: null, author: 'user', ticketNumber: 42 },
        {
          id: 11,
          title: 'Yours',
          note: 'A **note**',
          author: 'agent',
          ticketNumber: null,
        },
      ],
    },
    { id: 2, title: 'Keep', stickies: [] },
  ],
};

const column = (name: string) =>
  screen.getByRole('region', { name: new RegExp(`^${name}`) });
const stickiesIn = (name: string) =>
  within(column(name))
    .queryAllByRole('listitem')
    .map((item) => item.getAttribute('aria-label'));
const lastOps = () => vi.mocked(editSparCanvas).mock.calls.at(-1)?.[0].ops;

/** A save the test settles itself, to look at the Canvas meanwhile. */
const pendingSave = () => {
  let settle: (result: Awaited<ReturnType<typeof editSparCanvas>>) => void =
    () => {};
  vi.mocked(editSparCanvas).mockReturnValue(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  return (result: Awaited<ReturnType<typeof editSparCanvas>>) => settle(result);
};

describe('SparCanvas', () => {
  beforeEach(() => {
    vi.mocked(editSparCanvas)
      .mockReset()
      .mockResolvedValue({ ok: true, canvas } as never);
  });

  it('shows its Columns and Stickies, with who wrote each and its Ticket link', () => {
    renderWithTheme(<SparCanvas sparId={3} canvas={canvas} />);

    expect(stickiesIn('Ideas')).toEqual(['Mine', 'Yours']);
    const mine = within(column('Ideas')).getByRole('listitem', {
      name: 'Mine',
    });
    expect(within(mine).getByText('You')).toBeInTheDocument();
    expect(within(mine).getByRole('link', { name: 'T42' })).toHaveAttribute(
      'href',
      '/ticket/42',
    );
    const yours = within(column('Ideas')).getByRole('listitem', {
      name: 'Yours',
    });
    expect(within(yours).getByText('Claude')).toBeInTheDocument();
    expect(within(yours).getByText('note')).toBeInTheDocument();
  });

  it('shows a new Sticky at once and saves it as an add', async () => {
    const settle = pendingSave();
    renderWithTheme(<SparCanvas sparId={3} canvas={canvas} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Sticky in Keep' }),
      'Fresh{Enter}',
    );

    expect(stickiesIn('Keep')).toEqual(['Fresh']);
    expect(editSparCanvas).toHaveBeenCalledWith({
      sparId: 3,
      ops: [{ op: 'addSticky', columnId: 2, title: 'Fresh' }],
    });
    settle({ ok: true, canvas } as never);
  });

  it('moves a Sticky within its Column by keyboard drag', async () => {
    renderWithTheme(<SparCanvas sparId={3} canvas={canvas} />);
    const items = within(column('Ideas')).getAllByRole('listitem');
    const rects = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const index = items.indexOf(this as HTMLLIElement);
        return index < 0
          ? new DOMRect(0, 0, 800, 700)
          : new DOMRect(0, index * 50, 300, 40);
      });
    onTestFinished(() => rects.mockRestore());

    await keyboardDrag(
      screen.getByRole('button', { name: 'Drag Mine' }),
      '{ArrowDown}',
    );

    await waitFor(() =>
      expect(lastOps()).toEqual([
        { op: 'moveSticky', stickyId: 10, columnId: 1, index: 1 },
      ]),
    );
  });

  describe('with menus', () => {
    showOpenPopovers();

    it("moves a Sticky to another Column from its 'Move to' menu", async () => {
      renderWithTheme(<SparCanvas sparId={3} canvas={canvas} />);

      await userEvent.click(
        screen.getByRole('button', { name: 'Actions for Mine' }),
      );
      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'Move to Keep' }),
      );

      expect(lastOps()).toEqual([
        { op: 'moveSticky', stickyId: 10, columnId: 2 },
      ]);
    });

    it('puts the Canvas back and says why when an edit is refused', async () => {
      vi.mocked(editSparCanvas).mockResolvedValue({
        ok: false,
        error: 'This Spar is closed. Reopen it to change it.',
      });
      renderWithTheme(<SparCanvas sparId={3} canvas={canvas} />);

      await userEvent.click(
        screen.getByRole('button', { name: 'Actions for Yours' }),
      );
      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'Move to Keep' }),
      );

      expect(
        await screen.findByText('This Spar is closed. Reopen it to change it.'),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(stickiesIn('Ideas')).toEqual(['Mine', 'Yours']);
        expect(stickiesIn('Keep')).toEqual([]);
      });
    });
  });

  it('adds, moves and removes Columns, refusing to remove one with Stickies', async () => {
    vi.mocked(editSparCanvas).mockResolvedValueOnce({
      ok: false,
      error:
        'The Column "Ideas" still holds 2 Stickies. Move or remove them first.',
    });
    renderWithTheme(<SparCanvas sparId={3} canvas={canvas} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Ideas' }));
    expect(
      await screen.findByText(
        'The Column "Ideas" still holds 2 Stickies. Move or remove them first.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Move Keep left' }),
    );
    expect(lastOps()).toEqual([{ op: 'moveColumn', columnId: 2, index: 0 }]);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Column' }),
      'Risks{Enter}',
    );
    expect(lastOps()).toEqual([{ op: 'addColumn', title: 'Risks' }]);
  });

  it("animates in the Agent's Stickies that arrive, not the User's or those it showed first", () => {
    const { rerender } = renderWithTheme(
      <SparCanvas sparId={3} canvas={canvas} />,
    );
    const sticky = (name: string) =>
      screen.getByRole('listitem', { name }).getAttribute('data-arrived');
    expect(sticky('Yours')).toBe('false');

    const [ideas, keep] = canvas.columns;
    rerender(
      <SparCanvas
        sparId={3}
        canvas={{
          columns: [
            ideas,
            {
              ...keep,
              stickies: [
                {
                  id: 12,
                  title: 'New of Claude',
                  note: null,
                  author: 'agent',
                  ticketNumber: null,
                },
                {
                  id: 13,
                  title: 'New of mine',
                  note: null,
                  author: 'user',
                  ticketNumber: null,
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(sticky('New of Claude')).toBe('true');
    expect(sticky('New of mine')).toBe('false');
  });

  it('shows a closed Spar read-only', () => {
    renderWithTheme(<SparCanvas sparId={3} canvas={canvas} readOnly />);

    expect(stickiesIn('Ideas')).toEqual(['Mine', 'Yours']);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Drag|^Remove|^Actions/ }),
    ).toBeNull();
  });
});
