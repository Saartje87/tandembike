import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { noBoardFilter } from '../../app/lib/paths';
import { renderWithTheme } from '../../test/render';
import { BoardFilterBar } from './board-filter-bar';

const labelPicker = () =>
  screen.getByRole('combobox', { name: 'Filter by Label' });

describe('BoardFilterBar', () => {
  it('reports the search as it is typed', async () => {
    const onChange = vi.fn();
    renderWithTheme(
      <BoardFilterBar filter={noBoardFilter} labels={[]} onChange={onChange} />,
    );

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search Tickets' }),
      'f',
    );

    expect(onChange).toHaveBeenCalledExactlyOnceWith(
      { query: 'f', labels: [] },
      true,
    );
  });

  it('offers the Labels not chosen yet, and adds a picked one after the chosen ones', async () => {
    const onChange = vi.fn();
    renderWithTheme(
      <BoardFilterBar
        filter={{ query: 'fix', labels: ['ui'] }}
        labels={['bug', 'docs', 'ui']}
        onChange={onChange}
      />,
    );

    expect(
      within(labelPicker())
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Filter by Label', 'bug', 'docs']);
    await userEvent.selectOptions(labelPicker(), 'bug');

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      query: 'fix',
      labels: ['ui', 'bug'],
    });
  });

  it('removes a chosen Label', async () => {
    const onChange = vi.fn();
    renderWithTheme(
      <BoardFilterBar
        filter={{ query: '', labels: ['ui', 'bug'] }}
        labels={['bug', 'ui']}
        onChange={onChange}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove label ui' }),
    );

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      query: '',
      labels: ['bug'],
    });
  });

  it('turns the picker off once every Label is chosen', () => {
    renderWithTheme(
      <BoardFilterBar
        filter={{ query: '', labels: ['bug'] }}
        labels={['bug']}
        onChange={vi.fn()}
      />,
    );

    expect(labelPicker()).toBeDisabled();
    expect(labelPicker()).toHaveDisplayValue('No Labels to add');
  });

  it('offers Clear filter only while the filter hides anything', async () => {
    const onChange = vi.fn();
    const { rerender } = renderWithTheme(
      <BoardFilterBar
        filter={{ query: '  ', labels: [] }}
        labels={[]}
        onChange={onChange}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Clear filter' }),
    ).not.toBeInTheDocument();

    rerender(
      <BoardFilterBar
        filter={{ query: '', labels: ['bug'] }}
        labels={['bug']}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(noBoardFilter);
  });
});
