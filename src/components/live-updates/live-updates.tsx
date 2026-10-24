'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

import type { Change } from '../../tickets/changes';

/** How long a changed Ticket stays highlighted on the Board. */
const highlightMs = 2000;

const ChangedTickets = createContext<ReadonlySet<number>>(new Set());

/** Whether Ticket `number` changed a moment ago and should stand out. */
export const useTicketChanged = (number: number): boolean =>
  useContext(ChangedTickets).has(number);

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

    source.onmessage = (event: MessageEvent<string>) => {
      const change = JSON.parse(event.data) as Change;
      router.refresh();
      if (change.type === 'ticket') {
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
    <ChangedTickets.Provider value={changed}>
      {children}
    </ChangedTickets.Provider>
  );
};
