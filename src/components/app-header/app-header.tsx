'use client';

import { Box, Button, Drawer, Inline } from '@blockle/blocks';
import { usePathname } from 'next/navigation';
import {
  type FC,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { statsPath } from '../../app/lib/paths';
import { AppLink } from '../app-link/app-link';
import { ColorModeMenu } from '../color-mode-menu/color-mode-menu';
import { Icon } from '../icon/icon';

export type AppHeaderProps = {
  /** The side navigation the menu button opens. */
  nav: ReactNode;
  /** The current page's breadcrumbs, shown after the menu button. */
  breadcrumbs: ReactNode;
};

type CloseOnNavigationProps = {
  onNavigate: () => void;
};

/**
 * Calls `onNavigate` when the pathname changes. `usePathname` suspends on a
 * route with an unknown dynamic param (Cache Components), so it lives in its
 * own component behind Suspense and the header still renders at once.
 */
const CloseOnNavigation: FC<CloseOnNavigationProps> = ({ onNavigate }) => {
  const pathname = usePathname();
  const previous = useRef(pathname);
  useEffect(() => {
    if (pathname !== previous.current) {
      previous.current = pathname;
      onNavigate();
    }
  }, [pathname, onNavigate]);
  return null;
};

/**
 * The bar across the top of every page, in the theme's primary colour: a
 * menu button that opens `nav` in a drawer on the left, then the current
 * page's breadcrumbs, kept on one line, and a link to the Stats page and the
 * Colour mode menu at the end.
 * Picking a link in the drawer, or any other navigation, closes it.
 * Escape or a click outside closes the drawer, and focus goes back to the
 * menu button.
 */
export const AppHeader: FC<AppHeaderProps> = ({ nav, breadcrumbs }) => {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* A deliberate fixed colour: the header is primary-600 with white in both
          Colour modes, so its buttons are ghost and inherit the white. */}
      <Box
        asChild
        backgroundColor="primary-600"
        color="white"
        paddingBlock={2}
        paddingInline={[4, 5]}
      >
        <header>
          <Inline gap={3} alignY="center" flexWrap="nowrap">
            <Button
              type="button"
              size="small"
              variant="ghost"
              intent="inherit"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Icon name="bars-3" color="white" />
            </Button>
            {breadcrumbs}
            <Inline
              gap={3}
              alignY="center"
              flexWrap="nowrap"
              marginInlineStart="auto"
            >
              <AppLink href={statsPath()} intent="inherit">
                Stats
              </AppLink>
              <ColorModeMenu />
            </Inline>
          </Inline>
        </header>
      </Box>
      <Suspense fallback={null}>
        <CloseOnNavigation onNavigate={close} />
      </Suspense>
      <Drawer
        open={open}
        onRequestClose={close}
        placement="left"
        aria-label="Navigation"
        onClick={(event) => {
          // `CloseOnNavigation` misses a link to the page already open.
          if (event.target instanceof Element && event.target.closest('a')) {
            close();
          }
        }}
      >
        {nav}
      </Drawer>
    </>
  );
};
