import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { LabelList } from './label-list';

describe('LabelList', () => {
  it('lists each label', () => {
    renderWithTheme(<LabelList labels={['bug', 'needs-triage']} />);

    const list = screen.getByRole('list', { name: 'Labels' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['bug', 'needs-triage']);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // WebKit drops list semantics from a list without markers unless it has an
  // explicit role.
  it('keeps its list role without markers', () => {
    renderWithTheme(<LabelList labels={['bug']} />);

    expect(screen.getByRole('list', { name: 'Labels' })).toHaveAttribute(
      'role',
      'list',
    );
  });

  it('shows at most `max` labels, then one tag naming the rest', () => {
    renderWithTheme(
      <LabelList labels={['bug', 'from:agent-run', 'ui', 'docs']} max={2} />,
    );

    const items = within(
      screen.getByRole('list', { name: 'Labels' }),
    ).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'bug',
      'from:agent-run',
      '+2',
    ]);
    expect(items[2]).toHaveAccessibleName('2 more labels: ui, docs');
    expect(items[2]).toHaveAttribute('title', 'ui, docs');
  });

  it('names a single hidden label in the singular', () => {
    renderWithTheme(<LabelList labels={['bug', 'ui', 'docs']} max={2} />);

    expect(screen.getByText('+1')).toHaveAccessibleName('1 more label: docs');
  });

  it('shows no overflow tag when the labels fit `max`', () => {
    renderWithTheme(<LabelList labels={['bug', 'ui']} max={2} />);

    expect(
      within(screen.getByRole('list', { name: 'Labels' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['bug', 'ui']);
  });

  it('shows nothing without labels', () => {
    renderWithTheme(<LabelList labels={[]} />);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('offers to remove each label when it can', async () => {
    const onRemove = vi.fn();
    renderWithTheme(
      <LabelList labels={['bug', 'needs-triage']} onRemove={onRemove} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove label needs-triage' }),
    );

    expect(onRemove).toHaveBeenCalledExactlyOnceWith('needs-triage');
  });
});
