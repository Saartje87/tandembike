'use client';

import { Box, Button, Inline } from '@blockle/blocks';
import { type FC, Fragment, type KeyboardEvent } from 'react';

import type { ConversationState } from '../../conversations/conversation-state';
import type { OpenConversation } from '../../conversations/conversations';
import { intentNames } from '../conversation-labels/conversation-labels';
import { Icon } from '../icon/icon';

/** A draft's tab: a Conversation the User has not started yet (T611). */
export type DraftTab = { key: string; label: string };

export type ConversationTabsProps = {
  tabs: OpenConversation[];
  /** The Conversation whose tab is shown; none while a draft is shown. */
  selectedId: number | undefined;
  onSelect: (conversationId: number) => void;
  /** Called with the Conversation whose close button was pressed. */
  onClose: (conversationId: number) => void;
  /** Draft tabs, after the Conversations. */
  drafts?: DraftTab[];
  /** The draft whose tab is shown. */
  selectedDraftKey?: string | undefined;
  onSelectDraft?: (key: string) => void;
  /** Called with the draft whose close button was pressed. */
  onCloseDraft?: (key: string) => void;
};

/** The DOM id of a Conversation's tab, for the panel that `aria-labelledby` names. */
export const conversationTabId = (conversationId: number | string) =>
  `conversation-tab-${conversationId}`;

/** The DOM id of a Conversation's tab panel. */
export const conversationPanelId = (conversationId: number | string) =>
  `conversation-panel-${conversationId}`;

/** `T42 · Triage`, or `<Project> · New Ticket` for a Conversation about a Project. */
export const tabLabel = ({ conversation, projectName }: OpenConversation) =>
  `${conversation.ticketNumber === null ? projectName : `T${conversation.ticketNumber}`} · ${intentNames[conversation.intent]}`;

/** What a tab says about its Agent: working, or needing the User. */
const tabStates: Record<ConversationState, string> = {
  running: 'working',
  waiting: 'needs you',
  idle: 'needs you',
  interrupted: 'interrupted',
  stopped: 'stopped',
};

/**
 * The row of tabs in the Conversation dialog, one per open Conversation in the
 * order opened, scrolling sideways when they overflow. Blocks has no Tabs
 * component, so this builds the tablist, tab and tabpanel pattern by hand
 * (T324): only the selected tab is in the Tab order, and the arrow keys, Home
 * and End move to another tab and select it.
 */
export const ConversationTabs: FC<ConversationTabsProps> = ({
  tabs,
  selectedId,
  onSelect,
  onClose,
  drafts = [],
  selectedDraftKey,
  onSelectDraft,
  onCloseDraft,
}) => {
  const items = [
    ...tabs.map((item) => ({
      key: item.conversation.id,
      label: tabLabel(item),
      text: `${tabLabel(item)} · ${tabStates[item.conversation.state]}`,
      selected: item.conversation.id === selectedId,
      select: () => onSelect(item.conversation.id),
      close: () => onClose(item.conversation.id),
    })),
    ...drafts.map((draft) => ({
      key: draft.key,
      label: draft.label,
      text: draft.label,
      selected: draft.key === selectedDraftKey,
      select: () => onSelectDraft?.(draft.key),
      close: () => onCloseDraft?.(draft.key),
    })),
  ];

  const move = (event: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const target = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    items[target].select();
    document.getElementById(conversationTabId(items[target].key))?.focus();
  };

  return (
    <Box overflowInline="auto">
      <Inline
        role="tablist"
        aria-label="Conversations"
        gap={1}
        flexWrap="nowrap"
      >
        {items.map((item, index) => (
          <Fragment key={item.key}>
            <Button
              id={conversationTabId(item.key)}
              type="button"
              role="tab"
              size="small"
              variant={item.selected ? 'solid' : 'ghost'}
              aria-selected={item.selected}
              aria-controls={conversationPanelId(item.key)}
              tabIndex={item.selected ? 0 : -1}
              onClick={item.select}
              onKeyDown={(event) => move(event, index)}
            >
              {item.text}
            </Button>
            <Button
              type="button"
              size="small"
              variant="ghost"
              aria-label={`Close ${item.label}`}
              onClick={item.close}
            >
              <Icon name="x-mark" size="small" />
            </Button>
          </Fragment>
        ))}
      </Inline>
    </Box>
  );
};
