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
 * page's breadcrumbs, kept on one line.
 * Picking a link in the drawer, or any other navigation, closes it.
 * Escape or a click outside closes the drawer and puts focus back on the
 * menu button, which the Blocks `Drawer` does not do itself.
 */
export const AppHeader: FC<AppHeaderProps> = ({ nav, breadcrumbs }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const requestClose = useCallback(() => {
    // The Blocks `Drawer` does not join `Dialog`'s nesting, so an Escape or
    // outside click meant for a dialog in it ("New Project") reaches the
    // drawer first. Leave that one to the dialog (docs/blocks-feedback.md, 17).
    if (document.querySelector('dialog[data-app-nav] dialog[open]')) {
      return;
    }
    setOpen(false);
    menuRef.current?.focus();
  }, []);

  return (
    <>
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
              ref={menuRef}
              type="button"
              size="small"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Icon name="bars-3" color="white" />
            </Button>
            {breadcrumbs}
          </Inline>
        </header>
      </Box>
      <Suspense fallback={null}>
        <CloseOnNavigation onNavigate={close} />
      </Suspense>
      <Drawer
        open={open}
        onRequestClose={requestClose}
        placement="left"
        aria-label="Navigation"
        data-app-nav=""
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
