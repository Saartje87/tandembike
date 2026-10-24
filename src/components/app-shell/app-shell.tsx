import { Box } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { AppHeader } from '../app-header/app-header';

export type AppShellProps = {
  /** The side navigation, opened from the header's menu button. */
  nav: ReactNode;
  /** The current page's breadcrumbs, shown in the header. */
  breadcrumbs: ReactNode;
  children: ReactNode;
};

/** The page frame: the header across the top, the current view below it. */
export const AppShell: FC<AppShellProps> = ({ nav, breadcrumbs, children }) => (
  <>
    <AppHeader nav={nav} breadcrumbs={breadcrumbs} />
    <Box asChild paddingBlock={5} paddingInline={[4, 5]}>
      <main>{children}</main>
    </Box>
  </>
);
