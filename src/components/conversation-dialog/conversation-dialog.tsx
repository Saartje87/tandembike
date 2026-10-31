'use client';

import { Alert, Box, Button, Dialog, Heading, Inline } from '@blockle/blocks';
import { type FC, useEffect, useId, useState } from 'react';

import { loadConversation } from '../../app/conversations/actions';
import type {
  Conversation,
  OpenConversation,
} from '../../conversations/conversations';
import { ConversationChat } from '../conversation-chat/conversation-chat';
import {
  ConversationDraft,
  type Draft,
  draftLabel,
} from '../conversation-draft/conversation-draft';
import type { ConversationWithTranscript } from '../conversation-labels/conversation-labels';
import {
  ConversationTabs,
  conversationPanelId,
  conversationTabId,
} from '../conversation-tabs/conversation-tabs';
import { Icon } from '../icon/icon';
import { useConversationRevision } from '../live-updates/live-updates';
import * as styles from './conversation-dialog.css';

export type ConversationDialogProps = {
  /** Every open Conversation, in the order opened: one tab each. */
  tabs: OpenConversation[];
  /** The Conversation whose tab is shown; the dialog is hidden without one or a draft. */
  selectedId: number | undefined;
  /** Drafts (T611), after the Conversations: one tab each. */
  drafts?: Draft[];
  /** The draft whose tab is shown. */
  selectedDraftKey?: string | undefined;
  onSelectDraft?: (key: string) => void;
  /** Closing a draft discards it. */
  onCloseDraft?: (key: string) => void;
  onDraftTextChange?: (key: string, text: string) => void;
  /** Called with the Conversation a draft's Send started and the draft that became it. */
  onDraftStarted?: (key: string, conversation: Conversation) => void;
  onSelect: (conversationId: number) => void;
  /** Hides the dialog; every tab stays. */
  onHide: () => void;
  /** Closes a Conversation, from its tab's close button. */
  onClose: (conversationId: number) => void;
  /** Why the last close was refused, if it was. */
  error?: string | undefined;
};

type ConversationPanelProps = { open: OpenConversation };

/**
 * The shown tab's content: the Conversation's chat, loaded when it
 * shows and again on every Conversation change `LiveUpdates` hears of.
 */
const ConversationPanel: FC<ConversationPanelProps> = ({ open }) => {
  const conversationId = open.conversation.id;
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
  return item ? (
    <ConversationChat
      item={item}
      title={
        open.conversation.ticketNumber === null
          ? open.projectName
          : `T${open.conversation.ticketNumber} ${open.ticketTitle ?? ''}`.trim()
      }
    />
  ) : null;
};

/**
 * The one modal dialog every Conversation is held in (ADR 0019, T608): a tab
 * per open Conversation, and the shown tab's chat below. Escape, the X
 * and a click on the backdrop hide it and keep every tab; a tab's close button
 * closes that Conversation. Mount it once, through
 * `ConversationDialogProvider`.
 */
export const ConversationDialog: FC<ConversationDialogProps> = ({
  tabs,
  selectedId,
  drafts = [],
  selectedDraftKey,
  onSelectDraft,
  onCloseDraft,
  onDraftTextChange,
  onDraftStarted,
  onSelect,
  onHide,
  onClose,
  error,
}) => {
  const titleId = useId();
  const selected = tabs.find((tab) => tab.conversation.id === selectedId);
  const selectedDraft = drafts.find((draft) => draft.key === selectedDraftKey);
  const shownKey = selected ? selectedId : selectedDraft?.key;

  return (
    <Dialog
      open={shownKey !== undefined}
      onRequestClose={onHide}
      className={styles.dialog}
      aria-labelledby={titleId}
      suppressHydrationWarning
    >
      {shownKey !== undefined && (
        <div className={styles.content}>
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
            drafts={drafts.map((draft) => ({
              key: draft.key,
              label: draftLabel(draft),
            }))}
            selectedDraftKey={selectedDraftKey}
            {...(onSelectDraft ? { onSelectDraft } : {})}
            {...(onCloseDraft ? { onCloseDraft } : {})}
          />
          {error && <Alert intent="danger">{error}</Alert>}
          <Box
            role="tabpanel"
            id={conversationPanelId(shownKey)}
            aria-labelledby={conversationTabId(shownKey)}
            className={styles.panel}
          >
            {selected && <ConversationPanel key={selectedId} open={selected} />}
            {selectedDraft && (
              <ConversationDraft
                key={selectedDraft.key}
                draft={selectedDraft}
                onTextChange={(text) =>
                  onDraftTextChange?.(selectedDraft.key, text)
                }
                onStarted={(conversation) =>
                  onDraftStarted?.(selectedDraft.key, conversation)
                }
              />
            )}
          </Box>
        </div>
      )}
    </Dialog>
  );
};
