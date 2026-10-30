'use client';

import { BlocksProvider } from '@blockle/blocks';
import { momotaro } from '@blockle/blocks-theme-momotaro';
import { type FC, type ReactNode, useSyncExternalStore } from 'react';

import { readColorMode, subscribeToColorMode } from '../../app/lib/color-mode';
import './color-mode-provider.css';

export type ColorModeProviderProps = {
  children: ReactNode;
};

// During hydration React reads the server snapshot. Reading the stored
// choice there too keeps `BlocksProvider` from writing `system` over the
// mode the `<head>` script set before the first paint. The rendered HTML
// does not depend on the mode, so the two snapshots cannot mismatch it.
const getServerSnapshot = () =>
  typeof window === 'undefined' ? 'system' : readColorMode();

/**
 * The outermost `BlocksProvider`, set to the Color mode this browser stored,
 * which follows a new choice in this tab or another one.
 */
export const ColorModeProvider: FC<ColorModeProviderProps> = ({ children }) => {
  const colorMode = useSyncExternalStore(
    subscribeToColorMode,
    readColorMode,
    getServerSnapshot,
  );

  return (
    <BlocksProvider theme={momotaro} colorMode={colorMode}>
      {children}
    </BlocksProvider>
  );
};
