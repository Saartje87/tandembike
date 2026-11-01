'use client';

import { IconButton, Tab, TabList, TabPanel, Tabs } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { needsYou } from '../../conversations/conversation-activity';
import type { ConversationState } from '../../conversations/conversation-state';
import type { OpenConversation } from '../../conversations/conversations';
import { intentNames } from '../conversation-labels/conversation-labels';
import { Icon } from '../icon/icon';
import * as styles from './conversation-tabs.css';

/** A draft's tab: a Conversation the User has not started yet (T611). */
export type DraftTab = { key: string; label: string };

/** The draft tabs, which one is shown, and what their buttons do. */
export type TabDrafts<D extends DraftTab = DraftTab> = {
  items: D[];
  /** The draft whose tab is shown. */
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
  /** Called with the draft whose close button was pressed. */
  onClose: (key: string) => void;
};

export type ConversationTabsProps<D extends DraftTab = DraftTab> = {
  tabs: OpenConversation[];
  /** The Conversation whose tab is shown; none while a draft is shown. */
  selectedId: number | undefined;
  onSelect: (conversationId: number) => void;
  /** Called with the Conversation whose close button was pressed. */
  onClose: (conversationId: number) => void;
  /** Draft tabs, after the Conversations. */
  drafts: TabDrafts<D>;
  /** The content of a Conversation's panel; every panel stays mounted. */
  renderConversation?: (open: OpenConversation) => ReactNode;
  /** The content of a draft's panel, given the draft item; every panel stays mounted. */
  renderDraft?: (draft: D) => ReactNode;
  /** Shown between the tab row and the panels, such as an error. */
  notice?: ReactNode;
};

/** A tab of either kind, in one list. */
type TabItem = {
  /** Identifies the tab to Blocks `Tabs`; only ever compared. */
  value: string;
  /** Names the close button. */
  label: string;
  /** The tab's text. */
  text: string;
  /** Shows the state indicator of a Conversation; drafts have none. */
  state: ConversationState | null;
  selected: boolean;
  select: () => void;
  close: () => void;
  panel: ReactNode;
};

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
 * The Conversation dialog's tabs and panels on Blocks `Tabs`: one tab per open
 * Conversation in the order opened, then the draft tabs. Blocks draws the
 * moving indicator, scrolls an overflowing row and handles the arrow keys,
 * Home and End. A tab's close button and state marker sit in its slots. Every
 * panel stays mounted, so a draft reply and the scroll position survive a
 * switch of tab.
 */
export const ConversationTabs = <D extends DraftTab>({
  tabs,
  selectedId,
  onSelect,
  onClose,
  drafts,
  renderConversation,
  renderDraft,
  notice,
}: ConversationTabsProps<D>) => {
  const items: TabItem[] = [
    ...tabs.map((item): TabItem => {
      const { id, state } = item.conversation;
      const label = tabLabel(item);
      return {
        value: `conversation-${id}`,
        label,
        text: endedStates[state] ? `${label} · ${endedStates[state]}` : label,
        state,
        selected: id === selectedId,
        select: () => onSelect(id),
        close: () => onClose(id),
        panel: renderConversation?.(item),
      };
    }),
    ...drafts.items.map(
      (draft): TabItem => ({
        value: `draft-${draft.key}`,
        label: draft.label,
        text: draft.label,
        state: null,
        selected: selectedId === undefined && draft.key === drafts.selectedKey,
        select: () => drafts.onSelect(draft.key),
        close: () => drafts.onClose(draft.key),
        panel: renderDraft?.(draft),
      }),
    ),
  ];
  const itemOf = new Map(items.map((item) => [item.value, item]));

  return (
    <Tabs
      value={items.find((item) => item.selected)?.value}
      onValueChange={(value) => itemOf.get(value)?.select()}
      className={styles.tabs}
    >
      <TabList aria-label="Conversations" className={styles.tabList}>
        {items.map((item) => (
          <Tab
            key={item.value}
            value={item.value}
            endSlot={
              <IconButton
                type="button"
                size="small"
                variant="ghost"
                label={`Close ${item.label}`}
                onClick={item.close}
              >
                <Icon name="x-mark" size="small" />
              </IconButton>
            }
          >
            {item.text}
            {item.state && <StateMarker state={item.state} />}
          </Tab>
        ))}
      </TabList>
      {notice}
      {items.map((item) => (
        <TabPanel key={item.value} value={item.value} className={styles.panel}>
          {item.panel}
        </TabPanel>
      ))}
    </Tabs>
  );
};
