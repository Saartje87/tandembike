'use client';

import { Alert, Button, Dialog, Heading, Inline } from '@blockle/blocks';
import { type FC, useEffect, useId, useState } from 'react';

import { loadConversation } from '../../app/conversations/actions';
import { callAction } from '../../app/lib/call-action';
import type {
  Conversation,
  OpenConversation,
} from '../../conversations/conversations';
import { ConversationChat } from '../conversation-chat/conversation-chat';
import {
  type KeptConversation,
  KeptConversationProvider,
  type KeptConversations,
} from '../conversation-dialog-provider/kept-conversations';
import {
  ConversationDraft,
  type Draft,
  draftLabel,
} from '../conversation-draft/conversation-draft';
import { ConversationTabs } from '../conversation-tabs/conversation-tabs';
import { Icon } from '../icon/icon';
import { useConversationRevision } from '../live-updates/live-updates';
import * as styles from './conversation-dialog.css';

/** The drafts the dialog shows, and what its tabs and inputs do to them. */
export type DialogDrafts = {
  items: Draft[];
  /** The draft whose tab is shown. */
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
  /** Closing a draft discards it. */
  onClose: (key: string) => void;
  onTextChange: (key: string, text: string) => void;
  /** Called with the draft a Send started and the Conversation it became. */
  onStarted: (key: string, conversation: Conversation) => void;
};

export type ConversationDialogProps = {
  /** Every open Conversation, in the order opened: one tab each. */
  tabs: OpenConversation[];
  /** The Conversation whose tab is shown; the dialog is hidden without one or a draft. */
  selectedId: number | undefined;
  /** Drafts (T611), after the Conversations: one tab each. */
  drafts: DialogDrafts;
  onSelect: (conversationId: number) => void;
  /** Hides the dialog; every tab stays. */
  onHide: () => void;
  /** Closes a Conversation, from its tab's close button. */
  onClose: (conversationId: number) => void;
  /** Why the last close was refused, if it was. */
  error?: string | undefined;
  /** What is kept of each open Conversation while its tab is not shown (T1100). */
  kept: KeptConversations;
};

type ConversationPanelProps = {
  open: OpenConversation;
  /** What the dialog keeps of this Conversation while its tab is not shown. */
  kept: KeptConversation;
};

/**
 * The shown tab's content: the Conversation's chat, loaded when it
 * shows and again on every Conversation change `LiveUpdates` hears of. It
 * starts from the transcript loaded last time, if any, so a switch of tab
 * never shows it empty (T1100). A failed load keeps that transcript and shows
 * the reason above it.
 */
const ConversationPanel: FC<ConversationPanelProps> = ({ open, kept }) => {
  const conversationId = open.conversation.id;
  const revision = useConversationRevision();
  const [item, setItem] = useState(kept.loaded);
  const [error, setError] = useState<string>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is the trigger to load again.
  useEffect(() => {
    let current = true;
    const before = kept.loaded;
    // A throw becomes a refusal: shown while nothing is, else the last load
    // stays and the next change loads it again (T1324).
    callAction(
      () => loadConversation({ conversationId }),
      'The Conversation could not be loaded. Try again.',
    ).then((result) => {
      // Kept even when the tab was switched away meanwhile, unless a later
      // load has kept a newer one.
      if (result.ok && (current || kept.loaded === before)) {
        kept.loaded = result;
      }
      if (!current) {
        return;
      }
      if (result.ok) {
        setItem(result);
        setError(undefined);
      } else {
        setError(result.error);
      }
    });
    return () => {
      current = false;
    };
  }, [conversationId, revision, kept]);

  if (!item) {
    return error ? <Alert intent="danger">{error}</Alert> : null;
  }
  return (
    <KeptConversationProvider value={kept}>
      <ConversationChat
        item={item}
        error={error}
        title={
          open.conversation.ticketNumber === null
            ? open.projectName
            : `T${open.conversation.ticketNumber} ${open.ticketTitle ?? ''}`.trim()
        }
      />
    </KeptConversationProvider>
  );
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
  drafts,
  onSelect,
  onHide,
  onClose,
  error,
  kept,
}) => {
  const titleId = useId();
  const selected = tabs.find((tab) => tab.conversation.id === selectedId);
  const selectedDraft = drafts.items.find(
    (draft) => draft.key === drafts.selectedKey,
  );
  const shownKey = selected ? selectedId : selectedDraft?.key;

  return (
    <Dialog
      open={shownKey !== undefined}
      onRequestClose={onHide}
      size="large"
      className={styles.dialog}
      aria-labelledby={titleId}
    >
      {shownKey !== undefined && (
        <div className={styles.content}>
          <Inline
            gap={2}
            alignY="center"
            justifyContent="space-between"
            flexShrink={0}
          >
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
            drafts={{
              items: drafts.items.map((draft) => ({
                ...draft,
                label: draftLabel(draft),
              })),
              selectedKey: drafts.selectedKey,
              onSelect: drafts.onSelect,
              onClose: drafts.onClose,
            }}
            notice={error && <Alert intent="danger">{error}</Alert>}
            renderConversation={(open) => (
              <ConversationPanel
                key={open.conversation.id}
                open={open}
                kept={kept.of(open.conversation.id)}
              />
            )}
            renderDraft={(draft) => (
              <ConversationDraft
                key={draft.key}
                draft={draft}
                onTextChange={(text) => drafts.onTextChange(draft.key, text)}
                onStarted={(conversation) =>
                  drafts.onStarted(draft.key, conversation)
                }
              />
            )}
          />
        </div>
      )}
    </Dialog>
  );
};
