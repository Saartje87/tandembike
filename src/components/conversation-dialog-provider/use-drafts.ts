'use client';

import { useCallback, useRef, useState } from 'react';

import type {
  Draft,
  DraftInput,
} from '../conversation-draft/conversation-draft';
import { nextNeighbour } from './next-neighbour';

/** The drafts of the Conversation dialog and which one is in front (T611). */
export type DraftsState = {
  items: Draft[];
  /** The draft whose tab is shown, if any. */
  shown: string | undefined;
  /** Adds a draft and shows it. */
  open: (input: DraftInput) => void;
  /** Shows a draft's tab. */
  select: (key: string) => void;
  /** Stops showing a draft, keeping it. */
  deselect: () => void;
  setText: (key: string, text: string) => void;
  /**
   * Discards a draft. When it was shown, the neighbouring draft is shown
   * instead, and that one is returned; none is returned otherwise.
   */
  close: (key: string) => Draft | undefined;
  /** Discards a draft without showing another. */
  discard: (key: string) => void;
};

/**
 * The draft lifecycle: open, type, switch, close. Drafts live in the browser
 * only, never in the URL.
 */
export const useDrafts = (): DraftsState => {
  const [items, setItems] = useState<Draft[]>([]);
  const [key, setKey] = useState<string>();
  const counter = useRef(0);

  const shown = items.some((draft) => draft.key === key) ? key : undefined;

  const open = useCallback((input: DraftInput) => {
    counter.current += 1;
    const next = `draft-${counter.current}`;
    setItems((all) => [...all, { text: '', ...input, key: next }]);
    setKey(next);
  }, []);

  const setText = useCallback((target: string, text: string) => {
    setItems((all) =>
      all.map((draft) => (draft.key === target ? { ...draft, text } : draft)),
    );
  }, []);

  const close = (target: string) => {
    const index = items.findIndex((draft) => draft.key === target);
    const remaining = items.filter((draft) => draft.key !== target);
    setItems(remaining);
    if (target !== shown) {
      return undefined;
    }
    const next = nextNeighbour(remaining, index);
    setKey(next?.key);
    return next;
  };

  const discard = useCallback((target: string) => {
    setItems((all) => all.filter((draft) => draft.key !== target));
  }, []);

  const deselect = useCallback(() => setKey(undefined), []);

  return {
    items,
    shown,
    open,
    select: setKey,
    deselect,
    setText,
    close,
    discard,
  };
};
