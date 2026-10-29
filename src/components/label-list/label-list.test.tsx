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

    expect(onRemove).toHaveBeenCalledExactlyOnceWith(
      'needs-triage',
      expect.objectContaining({ type: 'click' }),
    );
  });
});
