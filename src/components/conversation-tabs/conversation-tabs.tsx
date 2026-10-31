'use client';

import { Box, Button, Inline } from '@blockle/blocks';
import { type FC, Fragment, type KeyboardEvent } from 'react';

import { needsYou } from '../../conversations/conversation-activity';
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
  drafts: TabDrafts;
};

/** The draft tabs, which one is shown, and what their buttons do. */
export type TabDrafts = {
  items: DraftTab[];
  /** The draft whose tab is shown. */
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
  /** Called with the draft whose close button was pressed. */
  onClose: (key: string) => void;
};

/** A tab of either kind, in one list. */
type TabItem = {
  /** A Conversation's id, or a draft's key. */
  id: number | string;
  /** Names the close button. */
  label: string;
  /** The tab's text. */
  text: string;
  selected: boolean;
  /** Shows the state indicator of a Conversation; drafts have none. */
  state: ConversationState | null;
  select: () => void;
  close: () => void;
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

/** What a tab says in words about a Conversation that is neither running nor waiting. */
const endedStates: Partial<Record<ConversationState, string>> = {
  interrupted: 'interrupted',
  stopped: 'stopped',
};

type StateMarkerProps = { state: ConversationState };

/**
 * The tab's visible state indicator, with the icons and names the Ticket
 * cards use (T593): running, or needing the User.
 */
const StateMarker: FC<StateMarkerProps> = ({ state }) => {
  if (state === 'running') {
    return (
      <span role="img" aria-label="Agent running">
        <Icon name="arrow-path" size="small" />
      </span>
    );
  }
  if (needsYou(state)) {
    return (
      <span role="img" aria-label="Needs you">
        <Icon name="bell-alert" size="small" />
      </span>
    );
  }
  return null;
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
  drafts,
}) => {
  const items: TabItem[] = [
    ...tabs.map((item) => ({
      id: item.conversation.id,
      label: tabLabel(item),
      text: endedStates[item.conversation.state]
        ? `${tabLabel(item)} · ${endedStates[item.conversation.state]}`
        : tabLabel(item),
      state: item.conversation.state,
      selected: item.conversation.id === selectedId,
      select: () => onSelect(item.conversation.id),
      close: () => onClose(item.conversation.id),
    })),
    ...drafts.items.map((draft) => ({
      id: draft.key,
      label: draft.label,
      text: draft.label,
      state: null,
      selected: draft.key === drafts.selectedKey,
      select: () => drafts.onSelect(draft.key),
      close: () => drafts.onClose(draft.key),
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
    document.getElementById(conversationTabId(items[target].id))?.focus();
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
          <Fragment key={item.id}>
            <Button
              id={conversationTabId(item.id)}
              type="button"
              role="tab"
              size="small"
              variant={item.selected ? 'solid' : 'ghost'}
              aria-selected={item.selected}
              aria-controls={conversationPanelId(item.id)}
              tabIndex={item.selected ? 0 : -1}
              onClick={item.select}
              onKeyDown={(event) => move(event, index)}
            >
              {item.text}
              {item.state && <StateMarker state={item.state} />}
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
