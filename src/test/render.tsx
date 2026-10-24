import { BlocksProvider } from '@blockle/blocks';
import { momotaro } from '@blockle/blocks-theme-momotaro';
import { type RenderOptions, render } from '@testing-library/react';
import type { ReactElement } from 'react';

export function renderWithTheme(ui: ReactElement, options?: RenderOptions) {
  return render(ui, {
    wrapper: ({ children }) => (
      <BlocksProvider theme={momotaro}>{children}</BlocksProvider>
    ),
    ...options,
  });
}
