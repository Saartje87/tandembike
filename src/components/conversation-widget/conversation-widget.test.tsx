// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { answerConversationWidget } from '../../app/conversations/actions';
import type {
  ChoiceWidget,
  MatrixWidget,
  RankWidget,
  ScaleWidget,
  Widget,
  WidgetEntry,
} from '../../conversations/widget';
import { keyboardDrag, stubDragAndDrop } from '../../test/drag-and-drop';
import { renderWithTheme } from '../../test/render';
import { ConversationWidget } from './conversation-widget';

vi.mock('../../app/conversations/actions', () => ({
  answerConversationWidget: vi.fn(),
}));

const choice: ChoiceWidget = {
  kind: 'choice',
  prompt: 'Which library?',
  options: [
    { label: 'Alpha', description: 'The first' },
    { label: 'Beta', description: 'The second' },
    { label: 'Gamma' },
  ],
  multiSelect: false,
  recommended: ['Beta'],
};

stubDragAndDrop();

const renderWidget = (entry: Partial<WidgetEntry> = {}) =>
  renderWithTheme(
    <ConversationWidget
      conversationId={3}
      entryId={7}
      entry={{ widget: choice, answer: null, expired: false, ...entry }}
    />,
  );

const sent = () => vi.mocked(answerConversationWidget).mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.mocked(answerConversationWidget)
    .mockReset()
    .mockResolvedValue({ ok: true } as never);
});

describe('A choice Widget', () => {
  it('preselects and marks the recommended choice, so agreeing is one click', async () => {
    renderWidget();

    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('The first')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(sent()).toEqual({
      conversationId: 3,
      entryId: 7,
      answer: { selected: ['Beta'] },
    });
  });

  it('sends another single choice, picked by keyboard', async () => {
    renderWidget({ widget: { ...choice, recommended: [] } });
    const send = screen.getByRole('button', { name: 'Send answer' });
    expect(send).toBeDisabled();

    screen.getByRole('radio', { name: 'Alpha' }).focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.click(send);

    expect(sent()?.answer).toEqual({ selected: ['Beta'] });
  });

  it('sends several choices of a multi select', async () => {
    renderWidget({
      widget: { ...choice, multiSelect: true, recommended: ['Alpha'] },
    });
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Gamma' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(sent()?.answer).toEqual({ selected: ['Alpha', 'Gamma'] });
  });

  it('sends Other with its text instead of the options', async () => {
    renderWidget();

    await userEvent.click(screen.getByRole('button', { name: 'Other…' }));
    expect(screen.queryByRole('radio', { name: 'Beta' })).toBeNull();
    const send = screen.getByRole('button', { name: 'Send answer' });
    expect(send).toBeDisabled();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Other answer to Which library?' }),
      'Delta',
    );
    await userEvent.click(send);

    expect(sent()?.answer).toEqual({ other: 'Delta' });
  });

  it('sends Skip', async () => {
    renderWidget();

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(sent()?.answer).toEqual({ skipped: true });
  });

  it('shows a refusal and keeps the choice', async () => {
    vi.mocked(answerConversationWidget).mockResolvedValue({
      ok: false,
      error: 'This Widget is no longer waiting.',
    });
    renderWidget();

    await userEvent.click(screen.getByRole('radio', { name: 'Gamma' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(
      await screen.findByText('This Widget is no longer waiting.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Gamma' })).toBeChecked();
  });
});

const rank: RankWidget = {
  kind: 'rank',
  prompt: 'Order these',
  items: ['One', 'Two', 'Three'],
};

const scale: ScaleWidget = {
  kind: 'scale',
  prompt: 'How much?',
  items: ['Speed', 'Cost'],
  min: 1,
  max: 5,
  minLabel: 'None',
  maxLabel: 'Lots',
};

const renderKind = (widget: Widget) => renderWidget({ widget });

const orderShown = () =>
  within(screen.getByRole('list', { name: 'Order' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent?.replace(/^\d+\./, ''));

describe('A rank Widget', () => {
  it('starts in the given order and sends it reordered by move buttons', async () => {
    renderKind(rank);
    expect(orderShown()).toEqual(['One', 'Two', 'Three']);
    expect(screen.getByRole('button', { name: 'Move One up' })).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Move Three up' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Move One down' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(sent()?.answer).toEqual({ order: ['Three', 'One', 'Two'] });
  });

  it('reorders by keyboard drag', async () => {
    renderKind(rank);
    const items = within(
      screen.getByRole('list', { name: 'Order' }),
    ).getAllByRole('listitem');
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
      screen.getByRole('button', { name: 'Drag One' }),
      '{ArrowDown}',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(sent()?.answer).toEqual({ order: ['Two', 'One', 'Three'] });
  });

  it('offers Skip', async () => {
    renderKind(rank);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(sent()?.answer).toEqual({ skipped: true });
  });
});

describe('A scale Widget', () => {
  it('shows a labelled slider per item with the min and max labels, and sends the values set by keyboard', async () => {
    renderKind(scale);
    expect(screen.getByText('1: None')).toBeInTheDocument();
    expect(screen.getByText('5: Lots')).toBeInTheDocument();

    screen.getByRole('slider', { name: 'Speed' }).focus();
    await userEvent.keyboard('{End}');
    screen.getByRole('slider', { name: 'Cost' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(sent()?.answer).toEqual({
      values: [
        { item: 'Speed', value: 5 },
        { item: 'Cost', value: 2 },
      ],
    });
  });

  it('offers Other…', async () => {
    renderKind(scale);
    await userEvent.click(screen.getByRole('button', { name: 'Other…' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Other answer to How much?' }),
      'Depends',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(sent()?.answer).toEqual({ other: 'Depends' });
  });
});

const matrix: MatrixWidget = {
  kind: 'matrix',
  prompt: 'Place these',
  items: ['Alpha', 'Beta'],
  xAxis: { low: 'Cheap', high: 'Costly' },
  yAxis: { low: 'Small', high: 'Big' },
};

describe('A matrix Widget', () => {
  it('shows the four axis labels and sends once every item is placed by quadrant picker and arrow keys', async () => {
    renderKind(matrix);
    for (const label of ['Cheap', '↑ Big', 'Costly →', 'Small']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    const send = screen.getByRole('button', { name: 'Send answer' });
    expect(send).toBeDisabled();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Quadrant of Alpha' }),
      'Costly, Small',
    );
    expect(send).toBeDisabled();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Quadrant of Beta' }),
      'Cheap, Big',
    );
    screen.getByRole('button', { name: /^Alpha: Costly, Small/ }).focus();
    await userEvent.keyboard('{ArrowUp}{ArrowRight}');
    await userEvent.click(send);

    expect(sent()?.answer).toEqual({
      positions: [
        { item: 'Alpha', x: 0.8, y: 0.3, quadrant: 'high-low' },
        { item: 'Beta', x: 0.25, y: 0.75, quadrant: 'low-high' },
      ],
    });
  });

  it('places an item by dragging it onto the matrix', async () => {
    renderKind(matrix);
    const area = screen.getByRole('group', { name: /^Matrix/ });
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 200, 200),
    );
    const alpha = screen.getByRole('button', { name: 'Alpha: not placed' });

    fireEvent.pointerDown(alpha, { pointerId: 1 });
    fireEvent.pointerMove(alpha, { pointerId: 1, clientX: 150, clientY: 50 });
    fireEvent.pointerUp(screen.getByRole('button', { name: /^Alpha:/ }), {
      pointerId: 1,
      clientX: 150,
      clientY: 50,
    });

    expect(
      within(area).getByRole('button', { name: /^Alpha: Costly, Big/ }),
    ).toBeInTheDocument();
  });

  it('offers Skip', async () => {
    renderKind(matrix);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(sent()?.answer).toEqual({ skipped: true });
  });
});

describe('A settled Widget', () => {
  it('shows a matrix answer by quadrant, read-only', () => {
    renderWidget({
      widget: matrix,
      answer: {
        positions: [
          { item: 'Alpha', x: 0.8, y: 0.3, quadrant: 'high-low' },
          { item: 'Beta', x: 0.1, y: 0.9, quadrant: 'low-high' },
        ],
      },
    });
    expect(screen.getByText('Alpha: Costly, Small')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a rank and a scale answer read-only', () => {
    const { unmount } = renderWidget({
      widget: rank,
      answer: { order: ['Two', 'One', 'Three'] },
    });
    expect(screen.getByText('1. Two')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    renderWidget({
      widget: scale,
      answer: { values: [{ item: 'Speed', value: 4 }] },
    });
    expect(screen.getByText('Speed: 4 of 5')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it.each([
    [{ selected: ['Alpha', 'Gamma'] }, ['Alpha', 'Gamma']],
    [{ other: 'Delta' }, ['Other: Delta']],
    [{ skipped: true as const }, ['Skipped']],
  ])('shows the answer %j read-only', (answer, lines) => {
    renderWidget({ answer });

    expect(screen.getByText('Which library?')).toBeInTheDocument();
    for (const line of lines) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows an expired one as expired', () => {
    renderWidget({ expired: true });

    expect(screen.getByText(/Expired/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
