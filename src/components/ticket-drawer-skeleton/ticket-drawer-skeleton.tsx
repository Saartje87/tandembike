'use client';

import { Box, Drawer, Spinner } from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import type { FC } from 'react';

import { useIsShown } from '../ticket-drawer/use-is-shown';

export type TicketDrawerSkeletonProps = {
  /**
   * The Board's own URL, with its filter and without `?ticket=`: where
   * closing goes.
   */
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
  // Like the drawer itself, only while shown (docs/blocks-feedback.md, 10).
  const shown = useIsShown();
  if (!shown) {
    return null;
  }
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
