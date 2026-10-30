import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import HomeBreadcrumbs from './page';
import ProjectsBreadcrumbs from './projects/page';
import StatsBreadcrumbs from './stats/page';

describe('Breadcrumbs slot', () => {
  it.each([
    ['the home page', HomeBreadcrumbs, 'Home'],
    ['the Projects list', ProjectsBreadcrumbs, 'Projects'],
    ['the Stats page', StatsBreadcrumbs, 'Stats'],
  ])('shows a one-entry trail on %s', (_, Page, current) => {
    renderWithTheme(<Page />);

    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByText(current)).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(trail).queryByRole('link')).not.toBeInTheDocument();
  });
});
