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
): { running: boolean; needsYou: boolean } => {
  const activity = useContext(Activity);
  return {
    running: activity.running.includes(number),
    needsYou: activity.needsYou.includes(number),
  };
};

/** How many Conversations, in all Projects, wait for the User. */
export const useNeedsYouCount = (): number =>
  useContext(Activity).needsYouCount;
