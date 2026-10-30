'use client';

import { Link, type LinkProps } from '@blockle/blocks';
import NextLink from 'next/link';
import type { FC } from 'react';

export type AppLinkProps = Omit<LinkProps, 'asChild' | 'href'> & {
  href: string;
  /**
   * Whether Next scrolls to the top after navigating. Pass `false` for a
   * link that opens a Ticket's drawer over the Board the User is on, so the
   * Board keeps its scroll position (ADR 0013). Defaults to Next's `true`.
   */
  scroll?: boolean;
};

/**
 * A Blocks `Link` with Next.js client-side navigation.
 *
 * A Client Component, so the `NextLink` is built in the browser-side tree.
 * Built in a Server Component, it can reach `Link asChild` as a lazy element
 * inside a streamed Suspense boundary, which Blocks drops: the server renders
 * no link and hydration fails (T419, T522).
 */
export const AppLink: FC<AppLinkProps> = ({
  href,
  scroll,
  children,
  ...props
}) => (
  <Link asChild {...props}>
    <NextLink href={href} scroll={scroll}>
      {children}
    </NextLink>
  </Link>
);
