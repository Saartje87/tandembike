import { Text } from '@blockle/blocks';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from './render';

describe('renderWithTheme', () => {
  it('pins the light Color mode, as the app layout does', () => {
    renderWithTheme(<Text>Hello</Text>);

    expect(document.documentElement).toHaveAttribute(
      'data-color-mode',
      'light',
    );
  });
});
