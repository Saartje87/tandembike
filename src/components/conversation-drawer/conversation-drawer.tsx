'use client';

import {
  Alert,
  Box,
  Button,
  Drawer,
  Heading,
  Inline,
  Stack,
} from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import { type FC, useId, useState, useTransition } from 'react';

import { closeConversation } from '../../app/conversations/actions';
import { AppLink } from '../app-link/app-link';
import { Icon } from '../icon/icon';
import {
  type ConversationWithTranscript,
  intentNames,
  TicketConversations,
} from '../ticket-conversations/ticket-conversations';
import * as styles from './conversation-drawer.css';

/** The Epic whose drawer a Conversation drawer replaced, and the URL that reopens it. */
export type ConversationBackLink = { number: number; href: string };

export type ConversationDrawerProps = {
  item: ConversationWithTranscript;
  /**
   * The Board's own URL, with its filter and without `?conversation=`: where
   * hiding or closing goes.
   */
  boardPath: string;
  /** Where a link back goes, when this drawer replaced an Epic's. */
  backTo?: ConversationBackLink;
};

/**
 * The side drawer of the Conversation a Board's `?conversation=` opens (T592,
 * as ADR 0013 does for a Ticket): the transcript, reply field, Stop and
 * permission answers of a Ticket Conversation. Hiding it (the X, Escape or a
 * click outside) leaves the run going and the Conversation in the Project's
 * list; Close Conversation stops the run and takes it off the list.
 */
export const ConversationDrawer: FC<ConversationDrawerProps> = ({
  item,
  boardPath,
  backTo,
}) => {
  const router = useRouter();
  const titleId = useId();
  const [pending, startClose] = useTransition();
  const [error, setError] = useState<string>();
  const { conversation } = item;

  const hide = () => {
    router.replace(boardPath, { scroll: false });
  };

  return (
    <Drawer
      open
      onRequestClose={hide}
      placement="right"
      className={styles.drawer}
      suppressHydrationWarning
      aria-labelledby={titleId}
    >
      <Box padding={5}>
        <Stack gap={3}>
          <Inline
            gap={2}
            alignY="center"
            justifyContent={backTo ? 'space-between' : 'flex-end'}
          >
            {backTo && (
              <AppLink href={backTo.href} scroll={false}>
                {`Back to T${backTo.number}`}
              </AppLink>
            )}
            <Button
              type="button"
              variant="ghost"
              size="small"
              aria-label="Hide"
              onClick={hide}
            >
              <Icon name="x-mark" size="small" />
            </Button>
          </Inline>
          <Heading id={titleId} level={2} fontSize="large">
            {intentNames[conversation.intent]}
          </Heading>
          <TicketConversations items={[item]} showList={false} />
          <Stack gap={1}>
            <Inline gap={2}>
              <Button
                type="button"
                size="small"
                variant="outline"
                intent="danger"
                loading={pending}
                disabled={pending}
                onClick={() => {
                  setError(undefined);
                  startClose(async () => {
                    const result = await closeConversation({
                      conversationId: conversation.id,
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    hide();
                  });
                }}
              >
                Close Conversation
              </Button>
            </Inline>
            {error && <Alert intent="danger">{error}</Alert>}
          </Stack>
        </Stack>
      </Box>
    </Drawer>
  );
};
