import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { StatusSelect } from './status-select';

describe('StatusSelect', () => {
  it('shows the given Status and offers every Status in Board order', () => {
    renderWithTheme(
      <StatusSelect aria-label="Status" value="Done" onChange={vi.fn()} />,
    );

    const select = screen.getByRole('combobox', { name: 'Status' });
    expect(select).toHaveValue('Done');
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Todo', 'In progress', 'Done']);
  });

  it('reports the Status the User picks', async () => {
    const onChange = vi.fn();
    renderWithTheme(
      <StatusSelect aria-label="Status" value="Todo" onChange={onChange} />,
    );

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Status' }),
      'In progress',
    );

    expect(onChange).toHaveBeenCalledWith('In progress');
  });
});
