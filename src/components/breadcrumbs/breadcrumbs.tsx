import { Box, Inline, Text } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { AppLink } from '../app-link/app-link';

type BreadcrumbLink = {
  label: string;
  href: string;
};

export type BreadcrumbsProps = {
  ancestors?: BreadcrumbLink[];
  current: string;
  /** Shown before the current page's name, such as a Project's icon. */
  currentIcon?: ReactNode;
};

/**
 * Where the current page sits, on one line in the header: ancestor links,
 * then the current page, which is cut short with an ellipsis when it does
 * not fit. It sits on the header's primary colour, so its text is white in
 * both Colour modes; links inherit it, and `Text` gets it set, since
 * `Text` falls back to the theme's text colour otherwise (T1290).
 */
export const Breadcrumbs: FC<BreadcrumbsProps> = ({
  ancestors = [],
  current,
  currentIcon,
}) => (
  // The trail may shrink inside a flex row, so the current entry can truncate.
  <Box asChild minInlineSize={0}>
    <nav aria-label="Breadcrumb">
      <Inline gap={2} flexWrap="nowrap" listStyle="none" role="list" asChild>
        <ol>
          {ancestors.map(({ label, href }) => (
            <li key={href}>
              <Inline gap={2} alignY="center" flexWrap="nowrap">
                <AppLink href={href} intent="inherit">
                  {label}
                </AppLink>
                <Text aria-hidden="true" color="white">
                  &gt;
                </Text>
              </Inline>
            </li>
          ))}
          <Box asChild minInlineSize={0}>
            <li>
              <Inline
                gap={2}
                alignY="center"
                flexWrap="nowrap"
                minInlineSize={0}
              >
                {currentIcon}
                <Text
                  aria-current="page"
                  color="white"
                  fontWeight="medium"
                  truncate
                >
                  {current}
                </Text>
              </Inline>
            </li>
          </Box>
        </ol>
      </Inline>
    </nav>
  </Box>
);
