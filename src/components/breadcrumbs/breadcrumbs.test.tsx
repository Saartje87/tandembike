import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { Breadcrumbs } from './breadcrumbs';

describe('Breadcrumbs', () => {
  it('links ancestor pages and marks the current page without linking it', () => {
    renderWithTheme(
      <Breadcrumbs
        ancestors={[
          { label: 'Projects', href: '/projects' },
          { label: 'Website', href: '/project/1' },
        ]}
        current="Fix the header"
      />,
    );

    const navigation = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(navigation).getByRole('list')).toHaveAttribute(
      'role',
      'list',
    );
    expect(within(navigation).getAllByRole('listitem')).toHaveLength(3);
    expect(within(navigation).getByText('Projects')).toBeInTheDocument();
    expect(
      within(navigation).getByRole('link', { name: 'Projects' }),
    ).toHaveAttribute('href', '/projects');
    expect(
      within(navigation).getByRole('link', { name: 'Website' }),
    ).toHaveAttribute('href', '/project/1');
    expect(within(navigation).getByText('Fix the header')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(navigation).queryByRole('link', { name: 'Fix the header' }),
    ).not.toBeInTheDocument();
  });
});
