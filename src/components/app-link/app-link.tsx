import { Link, type LinkProps } from '@blockle/blocks';
import NextLink from 'next/link';
import type { FC } from 'react';

export type AppLinkProps = Omit<LinkProps, 'asChild' | 'href'> & {
  href: string;
};

/** A Blocks `Link` with Next.js client-side navigation. */
export const AppLink: FC<AppLinkProps> = ({ href, children, ...props }) => (
  <Link asChild {...props}>
    <NextLink href={href}>{children}</NextLink>
  </Link>
);
