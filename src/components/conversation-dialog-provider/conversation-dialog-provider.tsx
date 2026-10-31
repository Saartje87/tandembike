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
import type {
  Draft,
  DraftInput,
} from '../conversation-draft/conversation-draft';
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
  /**
   * Opens a draft tab (T611): a Conversation that starts only when the User
   * presses Send in it. Drafts live in the browser, not in the URL.
   */
  openDraft: (draft: DraftInput) => void;
};

const noControl: ConversationDialogControl = {
  conversations: [],
  open: () => {},
  show: () => {},
  reopenAndOpen: async () => undefined,
  openDraft: () => {},
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
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftKey, setDraftKey] = useState<string>();
  const nextDraft = useRef(0);
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

  // A draft in front wins over the URL, which only catches up after it.
  const shownDraft = drafts.some((draft) => draft.key === draftKey)
    ? draftKey
    : undefined;
  const shown =
    shownDraft === undefined &&
    conversations.some(({ conversation }) => conversation.id === url.id)
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
      setDraftKey(undefined);
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
    } else if (drafts[0]) {
      setDraftKey(drafts[0].key);
    }
  }, [conversations, drafts, open]);

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

  const openDraft = useCallback(
    (input: DraftInput) => {
      nextDraft.current += 1;
      const key = `draft-${nextDraft.current}`;
      setDrafts((all) => [...all, { text: '', ...input, key }]);
      setError(undefined);
      setDraftKey(key);
      // A draft is shown by the provider, not by the URL.
      if (url.id !== undefined) {
        go(undefined, true);
      }
    },
    [go, url.id],
  );

  const selectDraft = (key: string) => {
    setDraftKey(key);
    if (url.id !== undefined) {
      go(undefined, true);
    }
  };

  const closeDraft = (key: string) => {
    const index = drafts.findIndex((draft) => draft.key === key);
    const remaining = drafts.filter((draft) => draft.key !== key);
    setDrafts(remaining);
    if (key === shownDraft) {
      const next = remaining[index] ?? remaining[index - 1];
      if (next) {
        setDraftKey(next.key);
      } else {
        setDraftKey(undefined);
        go(conversations.at(-1)?.conversation.id, true);
      }
    }
  };

  const startDraft = async (key: string, started: Conversation) => {
    // Show the new tab at once: the list must hold it before the draft goes.
    try {
      setConversations(await listOpenConversations());
    } catch {
      // The next change loads it again.
    }
    setDrafts((all) => all.filter((draft) => draft.key !== key));
    open(started.id);
  };

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
    () => ({ conversations, open, show, reopenAndOpen, openDraft }),
    [conversations, open, show, reopenAndOpen, openDraft],
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
        drafts={drafts}
        selectedDraftKey={shownDraft}
        onSelectDraft={selectDraft}
        onCloseDraft={closeDraft}
        onDraftTextChange={(key, text) =>
          setDrafts((all) =>
            all.map((draft) =>
              draft.key === key ? { ...draft, text } : draft,
            ),
          )
        }
        onDraftStarted={startDraft}
        onSelect={(id) => {
          setDraftKey(undefined);
          go(id, true);
        }}
        onHide={() => {
          setDraftKey(undefined);
          go(undefined, true);
        }}
        onClose={close}
        error={error}
      />
    </ConversationDialogContext>
  );
};
