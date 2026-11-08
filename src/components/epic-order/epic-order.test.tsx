import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import type { EpicChild } from '../../tickets/tickets';
import { EpicOrder } from './epic-order';

function child(
  number: number,
  title: string,
  extra: Partial<EpicChild> = {},
): EpicChild {
  return {
    number,
    title,
    status: 'Todo',
    archived: false,
    blockedBy: [],
    blocked: false,
    ...extra,
  };
}

const design = child(5, 'Design the payment form', { status: 'Done' });
const card = child(6, 'Pay by card', {
  status: 'In progress',
  blockedBy: [5],
});
const invoice = child(7, 'Send the invoice', {
  blockedBy: [6, 40],
  blocked: true,
});
const receipt = child(8, 'Print the receipt', { blockedBy: [5] });

const order = () => screen.getByRole('region', { name: 'Order' });
const node = (number: number) =>
  within(order()).getByRole('link', { name: new RegExp(`^T${number} `) });

describe('EpicOrder', () => {
  it('shows nothing for an Epic without unarchived children', () => {
    renderWithTheme(
      <EpicOrder items={[child(5, 'Old', { archived: true })]} />,
    );

    expect(screen.queryByText('Order')).not.toBeInTheDocument();
  });

  it('shows the children in an open Order section, even without Blockers', () => {
    renderWithTheme(<EpicOrder items={[child(5, 'Pay'), child(6, 'Ship')]} />);

    expect(screen.getByText('Order').closest('details')).toHaveAttribute(
      'open',
    );
    expect(within(order()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('links each child, over the Board when it is on it and else over its own', () => {
    renderWithTheme(
      <EpicOrder
        items={[design, card]}
        board={{
          path: '/project/1',
          filter: { query: '', labels: [] },
          onBoard: [5],
        }}
      />,
    );

    expect(node(5)).toHaveAttribute('href', '/project/1?ticket=5');
    expect(node(6)).toHaveAttribute('href', '/ticket/6');
  });

  it('shows T<number> and the title, with the full title on hover and to screen readers', () => {
    renderWithTheme(<EpicOrder items={[card]} />);

    expect(node(6)).toHaveTextContent('T6');
    expect(node(6)).toHaveAccessibleName(/^T6 Pay by card\b/);
    expect(node(6)).toHaveAttribute('title', 'T6 Pay by card');
  });

  it('names each child’s Status, and whether it is blocked or ready to start', () => {
    renderWithTheme(<EpicOrder items={[design, card, invoice, receipt]} />);

    expect(node(5)).toHaveAccessibleName(/Done/);
    expect(node(6)).toHaveAccessibleName(/In progress/);
    expect(
      within(node(7)).getByRole('img', {
        name: 'Blocked by an unresolved Ticket',
      }),
    ).toBeInTheDocument();
    expect(node(7)).not.toHaveAccessibleName(/Ready to start/);
    expect(node(8)).toHaveAccessibleName(/Ready to start/);
    expect(node(5)).not.toHaveAccessibleName(/Ready to start/);
  });

  it('shows a Blocker from outside the Epic, linked over its own Board', () => {
    renderWithTheme(
      <EpicOrder
        items={[invoice]}
        outside={[
          {
            number: 40,
            title: 'Set up the tax rules',
            status: 'Todo',
            projectId: 2,
            blocks: [7],
          },
        ]}
      />,
    );

    expect(node(40)).toHaveAttribute('href', '/ticket/40');
    expect(node(40)).toHaveAccessibleName(/outside this Epic/);
  });

  it('draws one arrow per Blocker in an SVG hidden from screen readers', () => {
    const { container } = renderWithTheme(
      <EpicOrder items={[design, card, receipt]} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelectorAll('line')).toHaveLength(2);
  });

  it('tells screen readers each child’s Blockers', () => {
    renderWithTheme(<EpicOrder items={[design, card, invoice]} />);

    expect(node(7)).toHaveAccessibleName(/after T6/);
  });
});
