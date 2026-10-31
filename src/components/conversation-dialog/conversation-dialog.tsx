'use client';

import {
  Alert,
  Box,
  Button,
  Dialog,
  Heading,
  Inline,
  Stack,
} from '@blockle/blocks';
import { type FC, useEffect, useId, useState } from 'react';

import { loadConversation } from '../../app/conversations/actions';
import type { OpenConversation } from '../../conversations/conversations';
import {
  ConversationTabs,
  conversationPanelId,
  conversationTabId,
} from '../conversation-tabs/conversation-tabs';
import {
  ConversationTranscript,
  type ConversationWithTranscript,
} from '../conversation-transcript/conversation-transcript';
import { Icon } from '../icon/icon';
import { useConversationRevision } from '../live-updates/live-updates';
import * as styles from './conversation-dialog.css';

export type ConversationDialogProps = {
  /** Every open Conversation, in the order opened: one tab each. */
  tabs: OpenConversation[];
  /** The Conversation whose tab is shown; the dialog is hidden without one. */
  selectedId: number | undefined;
  onSelect: (conversationId: number) => void;
  /** Hides the dialog; every tab stays. */
  onHide: () => void;
  /** Closes a Conversation, from its tab's close button. */
  onClose: (conversationId: number) => void;
  /** Why the last close was refused, if it was. */
  error?: string | undefined;
};

type ConversationPanelProps = { conversationId: number };

/**
 * The shown tab's content: the Conversation's transcript, loaded when it
 * shows and again on every Conversation change `LiveUpdates` hears of.
 */
const ConversationPanel: FC<ConversationPanelProps> = ({ conversationId }) => {
  const revision = useConversationRevision();
  const [item, setItem] = useState<ConversationWithTranscript>();
  const [error, setError] = useState<string>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is the trigger to load again.
  useEffect(() => {
    let current = true;
    loadConversation({ conversationId })
      .then((result) => {
        if (!current) {
          return;
        }
        if (result.ok) {
          setItem(result);
          setError(undefined);
        } else {
          setError(result.error);
        }
      })
      .catch(() => {
        // Keep what was shown; the next change loads it again.
      });
    return () => {
      current = false;
    };
  }, [conversationId, revision]);

  if (error) {
    return <Alert intent="danger">{error}</Alert>;
  }
  return item ? <ConversationTranscript item={item} /> : null;
};

/**
 * The one modal dialog every Conversation is held in (ADR 0019, T608): a tab
 * per open Conversation, and the shown tab's transcript below. Escape, the X
 * and a click on the backdrop hide it and keep every tab; a tab's close button
 * closes that Conversation. Mount it once, through
 * `ConversationDialogProvider`.
 */
export const ConversationDialog: FC<ConversationDialogProps> = ({
  tabs,
  selectedId,
  onSelect,
  onHide,
  onClose,
  error,
}) => {
  const titleId = useId();

  return (
    <Dialog
      open={selectedId !== undefined}
      onRequestClose={onHide}
      className={styles.dialog}
      aria-labelledby={titleId}
      suppressHydrationWarning
    >
      {selectedId !== undefined && (
        <Stack gap={3} padding={4}>
          <Inline gap={2} alignY="center" justifyContent="space-between">
            <Heading id={titleId} level={2} fontSize="large">
              Conversations
            </Heading>
            <Button
              type="button"
              variant="ghost"
              size="small"
              aria-label="Hide"
              onClick={onHide}
            >
              <Icon name="x-mark" size="small" />
            </Button>
          </Inline>
          <ConversationTabs
            tabs={tabs}
            selectedId={selectedId}
            onSelect={onSelect}
            onClose={onClose}
          />
          {error && <Alert intent="danger">{error}</Alert>}
          <Box
            role="tabpanel"
            id={conversationPanelId(selectedId)}
            aria-labelledby={conversationTabId(selectedId)}
            overflowBlock="auto"
          >
            <ConversationPanel key={selectedId} conversationId={selectedId} />
          </Box>
        </Stack>
      )}
    </Dialog>
  );
};
