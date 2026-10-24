import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../test/render';
import NotFound from './not-found';

describe('NotFound', () => {
  it('tells the visitor the page does not exist', () => {
    renderWithTheme(<NotFound />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });
});
