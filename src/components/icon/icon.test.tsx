import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { Icon } from './icon';

describe('Icon', () => {
  it('uses the matching Heroicon asset as its mask', () => {
    const { container } = renderWithTheme(<Icon name="ticket" />);

    expect(container.querySelector('[role="presentation"]')).toHaveStyle({
      maskImage: 'url("/heroicons/outline/ticket.svg")',
    });
  });
});
