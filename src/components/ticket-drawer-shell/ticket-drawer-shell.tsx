'use client';

import {
  Box,
  Button,
  Drawer,
  Inline,
  type RequestCloseReason,
  Spinner,
  Stack,
} from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import {
  createContext,
  type FC,
  type ReactNode,
  Suspense,
  use,
  useId,
} from 'react';

import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { CopyTicketNumber } from '../copy-ticket-number/copy-ticket-number';
import { Icon } from '../icon/icon';
import * as styles from './ticket-drawer-shell.css';

type TicketDrawerContextValue = {
  /** The id for the title heading, which names the drawer once loaded. */
  titleId: string;
  /** Goes to the Board, as after deleting the Ticket. */
  close: () => void;
};

const TicketDrawerContext = createContext<TicketDrawerContextValue | null>(
  null,
);

/** The drawer around the contents rendering it. */
export const useTicketDrawer = (): TicketDrawerContextValue => {
  const context = use(TicketDrawerContext);
  if (context === null) {
    throw new Error('useTicketDrawer needs a TicketDrawerShell around it.');
  }
  return context;
};

export type TicketDrawerShellProps = {
  number: number;
  /**
   * The Board's own URL, with its filter and without `?ticket=`: where
   * closing goes.
   */
  boardPath: string;
  /** The drawer's contents, which may stream in. */
  children: ReactNode;
};

/**
 * The side drawer of the Ticket a Board's `?ticket=` opens (ADR 0013), with
 * its number to copy and Close above contents that stream in under a
 * spinner. It stays put while its contents load and when another Ticket
 * opens in it, so it slides in once (T333). It is named "Ticket TN" until
 * the contents give it the Ticket's title. Closing (the Close button, Escape
 * or a click outside) goes to the Board, keeping its scroll. A click while
 * the Conversation dialog is shown over it is the dialog's, not the drawer's.
 */
export const TicketDrawerShell: FC<TicketDrawerShellProps> = ({
  number,
  boardPath,
  children,
}) => {
  const router = useRouter();
  const titleId = useId();
  const conversationDialog = useConversationDialog();

  // Closing replaces the URL (ADR 0013), so Back does not reopen the drawer,
  // and keeps the Board's scroll position, which Next resets by default.
  const close = () => {
    router.replace(boardPath, { scroll: false });
  };
  // The Conversation dialog is a sibling modal, not nested in the drawer, so
  // Blocks counts every click in it as outside the drawer (T615).
  const requestClose = (reason: RequestCloseReason) => {
    if (reason === 'outside-click' && conversationDialog.shown) {
      return;
    }
    close();
  };
  return (
    <Drawer
      open
      onRequestClose={requestClose}
      placement="right"
      className={styles.drawer}
      // Blocks renders `open` on the server only, so hydrating a drawer
      // opened by `?ticket=` reports a mismatch it then fixes itself (T357).
      suppressHydrationWarning
      // The title heading names it once loaded; until then, its number.
      aria-labelledby={titleId}
      aria-label={`Ticket T${number}`}
    >
      <Box padding={5}>
        <Stack gap={3}>
          <Inline gap={2} alignY="center" justifyContent="space-between">
            <CopyTicketNumber number={number} />
            <Button
              type="button"
              variant="ghost"
              size="small"
              aria-label="Close"
              onClick={close}
            >
              <Icon name="x-mark" size="small" />
            </Button>
          </Inline>
          <TicketDrawerContext value={{ titleId, close }}>
            <Suspense
              key={number}
              fallback={<Spinner role="status" aria-label="Loading" />}
            >
              {children}
            </Suspense>
          </TicketDrawerContext>
        </Stack>
      </Box>
    </Drawer>
  );
};
