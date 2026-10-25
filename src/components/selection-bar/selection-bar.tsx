'use client';

import { Box, Button, Text } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

export type SelectionBarProps = {
  /** How many Tickets are selected. */
  count: number;
  onClear: () => void;
  /** Actions on the selection, shown between the count and Clear. */
  children?: ReactNode;
};

/**
 * A toolbar saying how many Tickets are selected, with their actions and a
 * button to clear the selection. It sticks to the bottom of the view.
 */
export const SelectionBar: FC<SelectionBarProps> = ({
  count,
  onClear,
  children,
}) => (
  // `Inline` takes no `role` (docs/blocks-feedback.md, 15).
  <Box
    asChild
    display="flex"
    alignItems="center"
    gap={3}
    position="sticky"
    insetBlockEnd={0}
    backgroundColor="primary-100"
    borderRadius={2}
    boxShadow={1}
    paddingBlock={2}
    paddingInline={3}
  >
    <div role="toolbar" aria-label="Selection">
      <Text>{count} selected</Text>
      {children}
      <Button type="button" variant="ghost" size="small" onClick={onClear}>
        Clear
      </Button>
    </div>
  </Box>
);
