'use client';

import { createContext, use } from 'react';

import type { ConversationWithTranscript } from '../conversation-labels/conversation-labels';

/** What a pending question form holds: per question, its choice, choices and Other text. */
export type QuestionAnswers = {
  answers: { choice: string; choices: string[]; other: string }[];
};

/**
 * What the Conversation dialog keeps of one open Conversation while its tab
 * is not shown, since only the shown tab is mounted (T1100). Its parts read
 * it when they mount and write it as the User works; nothing re-renders on a
 * write.
 */
export type KeptConversation = {
  /** The text typed in the reply input and not sent. */
  reply: string;
  /** Unsent answers to pending question forms, by transcript entry id. */
  answers: Map<number, QuestionAnswers>;
  /** The Conversation as last loaded, shown at once when its tab is shown again. */
  loaded: ConversationWithTranscript | undefined;
};

/** The kept state of every open Conversation, held by `ConversationDialogProvider`. */
export type KeptConversations = {
  /** The kept state of a Conversation, empty the first time. */
  of: (conversationId: number) => KeptConversation;
  /** Drops what is kept of every Conversation not in `openIds`, such as a closed tab's. */
  keepOnly: (openIds: number[]) => void;
};

/** An empty store: client state only, never persisted or sent. */
export const createKeptConversations = (): KeptConversations => {
  const kept = new Map<number, KeptConversation>();
  return {
    of: (conversationId) => {
      let entry = kept.get(conversationId);
      if (!entry) {
        entry = { reply: '', answers: new Map(), loaded: undefined };
        kept.set(conversationId, entry);
      }
      return entry;
    },
    keepOnly: (openIds) => {
      for (const id of kept.keys()) {
        if (!openIds.includes(id)) {
          kept.delete(id);
        }
      }
    },
  };
};

const KeptConversationContext = createContext<KeptConversation | undefined>(
  undefined,
);

/** Gives the shown Conversation's kept state to the parts inside its chat. */
export const KeptConversationProvider = KeptConversationContext;

/**
 * The kept state of the Conversation around this component, or none outside
 * the Conversation dialog, where nothing needs keeping.
 */
export const useKeptConversation = (): KeptConversation | undefined =>
  use(KeptConversationContext);
