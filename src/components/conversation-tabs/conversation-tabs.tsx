'use client';

import { Box, Button, Inline } from '@blockle/blocks';
import { type FC, Fragment, type KeyboardEvent } from 'react';

import type { ConversationState } from '../../conversations/conversation-state';
import type { OpenConversation } from '../../conversations/conversations';
import { intentNames } from '../conversation-labels/conversation-labels';
import { Icon } from '../icon/icon';

export type ConversationTabsProps = {
  tabs: OpenConversation[];
  /** The Conversation whose tab is shown. */
  selectedId: number;
  onSelect: (conversationId: number) => void;
  /** Called with the Conversation whose close button was pressed. */
  onClose: (conversationId: number) => void;
};

/** The DOM id of a Conversation's tab, for the panel that `aria-labelledby` names. */
export const conversationTabId = (conversationId: number) =>
  `conversation-tab-${conversationId}`;

/** The DOM id of a Conversation's tab panel. */
export const conversationPanelId = (conversationId: number) =>
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
}) => {
  const move = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
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
    const id = tabs[target].conversation.id;
    onSelect(id);
    document.getElementById(conversationTabId(id))?.focus();
  };

  return (
    <Box overflowInline="auto">
      <Inline
        role="tablist"
        aria-label="Conversations"
        gap={1}
        flexWrap="nowrap"
      >
        {tabs.map((item, index) => {
          const { id, state } = item.conversation;
          const selected = id === selectedId;
          return (
            <Fragment key={id}>
              <Button
                id={conversationTabId(id)}
                type="button"
                role="tab"
                size="small"
                variant={selected ? 'solid' : 'ghost'}
                aria-selected={selected}
                aria-controls={conversationPanelId(id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(id)}
                onKeyDown={(event) => move(event, index)}
              >
                {`${tabLabel(item)} · ${tabStates[state]}`}
              </Button>
              <Button
                type="button"
                size="small"
                variant="ghost"
                aria-label={`Close ${tabLabel(item)}`}
                onClick={() => onClose(id)}
              >
                <Icon name="x-mark" size="small" />
              </Button>
            </Fragment>
          );
        })}
      </Inline>
    </Box>
  );
};
