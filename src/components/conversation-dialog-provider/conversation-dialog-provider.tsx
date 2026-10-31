'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  type FC,
  type ReactNode,
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  closeConversation,
  listOpenConversations,
  reopenConversation,
} from '../../app/conversations/actions';
import { conversationOnPath, openConversationId } from '../../app/lib/paths';
import type {
  Conversation,
  OpenConversation,
} from '../../conversations/conversations';
import { ConversationDialog } from '../conversation-dialog/conversation-dialog';
import { useConversationRevision } from '../live-updates/live-updates';

/** What the rest of the app may do with the Conversation dialog. */
export type ConversationDialogControl = {
  /** Every open Conversation, in the order opened. */
  conversations: OpenConversation[];
  /** Shows the dialog on this Conversation's tab. It must be open already. */
  open: (conversationId: number) => void;
  /** Shows the dialog on the tab it showed last, else the first. */
  show: () => void;
  /**
   * Opens a Conversation, reopening it first when the User closed it. Resolves
   * with the reason when reopening is refused.
   */
  reopenAndOpen: (conversation: Conversation) => Promise<string | undefined>;
};

const noControl: ConversationDialogControl = {
  conversations: [],
  open: () => {},
  show: () => {},
  reopenAndOpen: async () => undefined,
};

const ConversationDialogContext =
  createContext<ConversationDialogControl>(noControl);

/**
 * The control of the Conversation dialog. Entry points use only this: call
 * `open` with the id of a Conversation that is open, or `reopenAndOpen` for
 * one that may be closed.
 */
export const useConversationDialog = (): ConversationDialogControl =>
  use(ConversationDialogContext);

type UrlState = { id: number | undefined; href: string };

type UrlWatcherProps = { onChange: (state: UrlState) => void };

/**
 * Reports the page's URL and the Conversation `?conversation=` names. It
 * reads `usePathname` and `useSearchParams`, which suspend while a route is
 * prerendered (Cache Components), so it sits behind its own Suspense boundary
 * and the rest of the app still renders at once.
 */
const UrlWatcher: FC<UrlWatcherProps> = ({ onChange }) => {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const id = openConversationId(search.get('conversation') ?? undefined);
  const href = query === '' ? pathname : `${pathname}?${query}`;

  useEffect(() => {
    onChange({ id, href });
  }, [id, href, onChange]);
  return null;
};

export type ConversationDialogProviderProps = {
  children: ReactNode;
};

/**
 * Holds the app-wide Conversation dialog: the open Conversations, reloaded on
 * every Conversation change `LiveUpdates` hears of, and which tab is shown,
 * which `?conversation=<id>` holds on any page, next to `?ticket=`. Hiding the
 * dialog removes the parameter and keeps every tab; it never opens by itself.
 * Mount it once, inside `LiveUpdates`, around everything that opens it.
 */
export const ConversationDialogProvider: FC<
  ConversationDialogProviderProps
> = ({ children }) => {
  const router = useRouter();
  const revision = useConversationRevision();
  const [conversations, setConversations] = useState<OpenConversation[]>([]);
  const [url, setUrl] = useState<UrlState>({ id: undefined, href: '' });
  const [error, setError] = useState<string>();
  const lastShown = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setConversations(await listOpenConversations());
    } catch {
      // Keep what was shown; the next change loads it again.
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is the trigger to load again.
  useEffect(() => {
    load();
  }, [load, revision]);

  const shown = conversations.some(
    ({ conversation }) => conversation.id === url.id,
  )
    ? url.id
    : undefined;
  if (shown !== undefined) {
    lastShown.current = shown;
  }

  const go = useCallback(
    (id: number | undefined, replace: boolean) => {
      const href = conversationOnPath(url.href, id);
      if (replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [router, url.href],
  );

  const open = useCallback(
    (id: number) => {
      setError(undefined);
      lastShown.current = id;
      // The Conversation may be new: its tab needs the list to be current.
      load();
      go(id, false);
    },
    [go, load],
  );

  const show = useCallback(() => {
    const first = conversations[0]?.conversation.id;
    const last = conversations.some(
      ({ conversation }) => conversation.id === lastShown.current,
    )
      ? lastShown.current
      : first;
    if (last !== undefined) {
      open(last);
    }
  }, [conversations, open]);

  const reopenAndOpen = useCallback(
    async (conversation: Conversation) => {
      if (conversation.hidden) {
        const result = await reopenConversation({
          conversationId: conversation.id,
        });
        if (!result.ok) {
          return result.error;
        }
      }
      open(conversation.id);
      return undefined;
    },
    [open],
  );

  const close = async (id: number) => {
    setError(undefined);
    const result = await closeConversation({ conversationId: id });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const remaining = conversations.filter(
      ({ conversation }) => conversation.id !== id,
    );
    setConversations(remaining);
    if (id === shown) {
      const index = conversations.findIndex(
        ({ conversation }) => conversation.id === id,
      );
      const next = (remaining[index] ?? remaining[index - 1])?.conversation.id;
      go(next, true);
    }
  };

  const control = useMemo(
    () => ({ conversations, open, show, reopenAndOpen }),
    [conversations, open, show, reopenAndOpen],
  );

  return (
    <ConversationDialogContext value={control}>
      <Suspense fallback={null}>
        <UrlWatcher onChange={setUrl} />
      </Suspense>
      {children}
      <ConversationDialog
        tabs={conversations}
        selectedId={shown}
        onSelect={(id) => go(id, true)}
        onHide={() => go(undefined, true)}
        onClose={close}
        error={error}
      />
    </ConversationDialogContext>
  );
};
