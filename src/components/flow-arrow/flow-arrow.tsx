import { Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import * as styles from './flow-arrow.css';

export type FlowArrowProps = {
  /** What moves the Ticket along this arrow, such as `ready-for-agent`. */
  label?: string;
};

/**
 * A downward arrow between two steps of a Flow diagram, in the theme's
 * border colour so it reads in light and dark mode. Blocks is a design
 * system, not a diagram library, so the arrow is drawn here (ADR 0044).
 */
export const FlowArrow: FC<FlowArrowProps> = ({ label }) => (
  <Stack gap={0} alignX="center" aria-hidden={label ? undefined : true}>
    <div className={styles.shaft} />
    {label && (
      <Text fontSize="xsmall" color="muted">
        {label}
      </Text>
    )}
    <div className={styles.shaft} />
    <div className={styles.head} />
  </Stack>
);
