'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { Notice } from '../../notices/notice';
import type { Change } from '../../tickets/changes';

/** How long a changed Ticket stays highlighted on the Board. */
const highlightMs = 2000;

const ChangedTickets = createContext<ReadonlySet<number>>(new Set());

/** Whether Ticket `number` changed a moment ago and should stand out. */
export const useTicketChanged = (number: number): boolean =>
  useContext(ChangedTickets).has(number);

const ConversationRevision = createContext(0);

/** A number that goes up whenever a Conversation or the machine settings change, to load again by. */
export const useConversationRevision = (): number =>
  useContext(ConversationRevision);

type NoticeListener = (notice: Notice) => void;

const NoticeFeed = createContext<(listener: NoticeListener) => () => void>(
  () => () => {},
);

/**
 * Calls `listener` with each Notice the server raises (ADR 0042), over
 * LiveUpdates' one events connection. It is the latest `listener`; the
 * subscription lasts as long as the component.
 */
export const useNotices = (listener: NoticeListener): void => {
  const subscribe = useContext(NoticeFeed);
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => subscribe((notice) => latest.current(notice)), [subscribe]);
};

export type LiveUpdatesProps = {
  children: ReactNode;
};

/**
 * Keeps the page in step with changes made elsewhere: another tab or an
 * Agent. It listens to `/api/events` (ADR 0005) and refetches the current
 * route on every change, which refreshes the Board, the side navigation
 * and an open drawer. A changed Ticket is highlighted for a moment
 * (see `useTicketChanged`). After the connection drops, for example when the
 * dev server restarts, the browser reconnects by itself and the page
 * refetches to catch up on what it missed.
 *
 * Mount it once, in the root layout, so there is one connection per tab.
 */
export const LiveUpdates: FC<LiveUpdatesProps> = ({ children }) => {
  const router = useRouter();
  const [changed, setChanged] = useState<ReadonlySet<number>>(new Set());
  const [revision, setRevision] = useState(0);
  const noticeListeners = useRef(new Set<NoticeListener>());
  const subscribeNotices = useCallback((listener: NoticeListener) => {
    noticeListeners.current.add(listener);
    return () => {
      noticeListeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/events');
    const highlights = new Map<number, ReturnType<typeof setTimeout>>();
    let dropped = false;

    const highlight = (number: number) => {
      clearTimeout(highlights.get(number));
      highlights.set(
        number,
        setTimeout(() => {
          highlights.delete(number);
          setChanged((current) => {
            const next = new Set(current);
            next.delete(number);
            return next;
          });
        }, highlightMs),
      );
      setChanged((current) => new Set(current).add(number));
    };

    const reloadConversations = () => setRevision((current) => current + 1);

    source.onmessage = (event: MessageEvent<string>) => {
      const change = JSON.parse(event.data) as Change;
      if (change.type === 'notice') {
        // Nothing on the page changed: the notifier alone cares.
        for (const listener of noticeListeners.current) {
          listener(change.notice);
        }
        return;
      }
      router.refresh();
      if (change.type === 'conversation' || change.type === 'machine') {
        reloadConversations();
      } else if (change.type === 'ticket') {
        highlight(change.number);
      } else if (change.type === 'tickets') {
        change.numbers.forEach(highlight);
      }
    };
    source.onerror = () => {
      dropped = true;
    };
    source.onopen = () => {
      if (dropped) {
        dropped = false;
        router.refresh();
        reloadConversations();
      }
    };

    return () => {
      source.close();
      for (const timer of highlights.values()) {
        clearTimeout(timer);
      }
    };
  }, [router]);

  return (
    <NoticeFeed.Provider value={subscribeNotices}>
      <ConversationRevision.Provider value={revision}>
        <ChangedTickets.Provider value={changed}>
          {children}
        </ChangedTickets.Provider>
      </ConversationRevision.Provider>
    </NoticeFeed.Provider>
  );
};
