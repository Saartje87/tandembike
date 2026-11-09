import { Box, Grid, GridItem, Stack } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { FlowArrow } from '../flow-arrow/flow-arrow';
import * as styles from './flow-connector.css';

export type FlowConnectorProps = {
  /** The two ways out of the step above, with what sends a Ticket each way. */
  branches: { key: string; label: string; children: ReactNode }[];
};

/**
 * A split in a Flow diagram: one step leading to two, each with an
 * arrow naming what sends a Ticket that way. Side by side from tablet width,
 * stacked top to bottom on a phone, so nothing scrolls sideways.
 */
export const FlowConnector: FC<FlowConnectorProps> = ({ branches }) => (
  <Stack gap={0}>
    {/* Hidden on a phone, where the branches stack. */}
    <Box className={styles.bar} display={['none', 'block']} aria-hidden />
    <Grid gap={3}>
      {branches.map(({ key, label, children }) => (
        <GridItem key={key} colSpan={[12, 6]}>
          <Stack gap={0}>
            <FlowArrow label={label} />
            {children}
          </Stack>
        </GridItem>
      ))}
    </Grid>
  </Stack>
);
