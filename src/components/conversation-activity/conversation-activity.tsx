'use client';

import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

import { currentConversationActivity } from '../../app/conversations/actions';
import {
  type ConversationActivity,
  type LiveConversation,
  noConversationActivity,
} from '../../conversations/conversation-activity';
import { useConversationRevision } from '../live-updates/live-updates';

const Activity = createContext<ConversationActivity>(noConversationActivity);

export type ConversationActivityProviderProps = {
  children: ReactNode;
};

/**
 * Knows which Tickets have a running Conversation or one that waits for the
 * User, and how many wait in all. It loads that when it mounts and again on
 * every Conversation change `LiveUpdates` hears of. Mount it once, inside
 * `LiveUpdates`.
 */
export const ConversationActivityProvider: FC<
  ConversationActivityProviderProps
> = ({ children }) => {
  const revision = useConversationRevision();
  const [activity, setActivity] = useState(noConversationActivity);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is the trigger to load again.
  useEffect(() => {
    let current = true;
    currentConversationActivity()
      .then((next) => {
        if (current) {
          setActivity(next);
        }
      })
      .catch(() => {
        // Keep what was shown; the next change loads it again.
      });
    return () => {
      current = false;
    };
  }, [revision]);

  return <Activity.Provider value={activity}>{children}</Activity.Provider>;
};

/** Whether Ticket `number` has a running Conversation, or one that needs the User. */
export const useTicketActivity = (
  number: number,
): { running: boolean; waiting: boolean } => {
  const activity = useContext(Activity);
  return {
    running: activity.running.includes(number),
    waiting: activity.waiting.includes(number),
  };
};

/** Ticket `number`'s live Conversation, or undefined without one. */
export const useTicketLiveConversation = (
  number: number,
): LiveConversation | undefined => useContext(Activity).live[number];

/** Every Ticket's live Conversation, for a view that places many Tickets. */
export const useLiveConversations = (): ConversationActivity['live'] =>
  useContext(Activity).live;

/** What Ticket `number`'s Conversations have cost in USD, 0 without any. */
export const useTicketCost = (number: number): number =>
  useContext(Activity).cost[number] ?? 0;

/** Every Ticket's total cost, for a view that sums over many Tickets. */
export const useTicketCosts = (): ConversationActivity['cost'] =>
  useContext(Activity).cost;
