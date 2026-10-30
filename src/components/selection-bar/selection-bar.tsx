'use client';

import { Box, Button, Inline, Text } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { modeColors } from '../../app/lib/mode-colors';

export type SelectionBarProps = {
  /** How many Tickets are selected. */
  count: number;
  onClear: () => void;
  /** Actions on the selection, shown between the count and Clear. */
  children?: ReactNode;
  /** Shown under the actions, such as why an action left some Tickets. */
  notice?: ReactNode;
};

/**
 * A toolbar saying how many Tickets are selected, with their actions and a
 * button to clear the selection, and an optional notice under it. It sticks
 * to the bottom of the view.
 */
export const SelectionBar: FC<SelectionBarProps> = ({
  count,
  onClear,
  children,
  notice,
}) => (
  <Box
    asChild
    display="flex"
    flexDirection="column"
    gap={2}
    position="sticky"
    insetBlockEnd={0}
    backgroundColor={modeColors.primarySubtle}
    borderRadius={2}
    boxShadow={1}
    paddingBlock={2}
    paddingInline={3}
  >
    {/* Marked so a click inside it is not one on empty Board space. */}
    <div data-selection-bar="">
      <Inline
        gap={3}
        alignY="center"
        flexWrap="nowrap"
        role="toolbar"
        aria-label="Selection"
      >
        <Text>{count} selected</Text>
        {children}
        <Button type="button" variant="ghost" size="small" onClick={onClear}>
          Clear
        </Button>
      </Inline>
      {notice}
    </div>
  </Box>
);
