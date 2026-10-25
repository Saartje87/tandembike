'use client';

import { Box, Drawer, Spinner } from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import type { FC } from 'react';

export type TicketDrawerSkeletonProps = {
  /** The Board's own URL, without `?ticket=`: where closing goes. */
  boardPath: string;
};

/**
 * The Ticket drawer while its Ticket streams in over the Board (ADR 0013).
 * It shares the drawer's `data-ticket-drawer` styles, and closing it leaves
 * the Board where it was.
 */
export const TicketDrawerSkeleton: FC<TicketDrawerSkeletonProps> = ({
  boardPath,
}) => {
  const router = useRouter();
  return (
    <Drawer
      open
      onRequestClose={() => router.replace(boardPath, { scroll: false })}
      placement="right"
      aria-label="Loading Ticket"
      data-ticket-drawer=""
    >
      <Box padding={4}>
        <Spinner role="status" aria-label="Loading" />
      </Box>
    </Drawer>
  );
};
