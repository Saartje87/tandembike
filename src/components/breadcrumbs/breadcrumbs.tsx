import { Box, Inline, Text } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { AppLink } from '../app-link/app-link';
import * as styles from './breadcrumbs.css';

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
 * not fit. Colours follow the surrounding text.
 */
export const Breadcrumbs: FC<BreadcrumbsProps> = ({
  ancestors = [],
  current,
  currentIcon,
}) => (
  <nav aria-label="Breadcrumb" className={styles.trail}>
    <Inline gap={2} flexWrap="nowrap" listStyle="none" role="list" asChild>
      <ol>
        {ancestors.map(({ label, href }) => (
          <li key={href}>
            <Inline gap={2} alignY="center" flexWrap="nowrap">
              <AppLink href={href} intent="inherit">
                {label}
              </AppLink>
              <Text aria-hidden="true">&gt;</Text>
            </Inline>
          </li>
        ))}
        <Box asChild minInlineSize={0}>
          <li>
            <Inline gap={2} alignY="center" flexWrap="nowrap" minInlineSize={0}>
              {currentIcon}
              <Text aria-current="page" fontWeight="medium" truncate>
                {current}
              </Text>
            </Inline>
          </li>
        </Box>
      </ol>
    </Inline>
  </nav>
);
