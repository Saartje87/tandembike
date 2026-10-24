import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { FieldError } from './field-error';

describe('FieldError', () => {
  it('shows the reason under the id a field can point to', () => {
    renderWithTheme(<FieldError id="title-error" reason="Too long." />);

    expect(screen.getByText('Too long.')).toHaveAttribute('id', 'title-error');
  });

  it('shows nothing without a reason', () => {
    const { container } = renderWithTheme(<FieldError id="title-error" />);

    expect(container.querySelector('#title-error')).toBeNull();
    expect(container).toHaveTextContent('');
  });
});
