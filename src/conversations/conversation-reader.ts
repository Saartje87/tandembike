import { and, count, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { conversationEntries, conversations } from '../db/schema';
import { NotFoundError, ValidationError } from '../tickets/errors';
import { parseTimestamp, type Tickets } from '../tickets/tickets';
import type {
  ConversationIntent,
  ConversationStarter,
  ConversationState,
  PermissionStatus,
  QuestionEntry,
  TranscriptRole,
} from './conversation-state';
import type { WidgetEntry } from './widget';

/** A Conversation as an Agent reads it: no cost, worktree or SDK session. */
export type ConversationListing = {
  id: number;
  intent: ConversationIntent;
  state: ConversationState;
  startedBy: ConversationStarter;
  entryCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** One transcript entry as an Agent reads it; fields that do not apply are left out. */
export type EntryListing = {
  id: number;
  role: TranscriptRole;
  toolName?: string;
  text: string;
  /** Set when `text` was cut to `trimmedTextLength`. */
  truncated?: true;
  /** Only with `full`. */
  toolInput?: Record<string, unknown>;
  permission?: PermissionStatus;
  /** When the User answered a permission request; left out while pending, once expired and for older entries. */
  answeredAt?: Date;
  question?: QuestionEntry;
  widget?: WidgetEntry;
  createdAt: Date;
};

export type EntriesQuery = {
  /** Only entries with an id below this one: the previous page's `nextBefore`. */
  before?: number;
  /** An ISO 8601 date-time with a time zone: only entries at or after it. */
  since?: string;
  /** An ISO 8601 date-time with a time zone: only entries at or before it. */
  until?: string;
  limit?: number;
  /** The whole text and the tool input, instead of the trimmed text. */
  full?: boolean;
};

/** The most characters of an entry's text returned without `full`. */
export const trimmedTextLength = 500;
export const defaultEntriesLimit = 50;
export const maxEntriesLimit = 200;

const timestampOf = (
  field: 'since' | 'until',
  text: string | undefined,
): Date | undefined => {
  if (text === undefined) {
    return undefined;
  }
  const time = parseTimestamp(text);
  if (time === null) {
    throw new ValidationError({
      [field]: `Give ${field} as an ISO 8601 timestamp with a time zone, such as 2026-11-09T10:00:00Z.`,
    });
  }
  return time;
};

const listingColumns = {
  id: conversations.id,
  intent: conversations.intent,
  state: conversations.state,
  startedBy: conversations.startedBy,
  createdAt: conversations.createdAt,
  updatedAt: conversations.updatedAt,
};

/**
 * Read-only access to a Ticket's Conversations and their transcripts, for
 * the MCP server (T1265). It never starts, stops or changes a Conversation,
 * and shows no cost or Run outcome, so no Agent shapes its own statistics.
 */
export function createConversationReader(
  db: DatabaseConnection,
  tickets: Tickets,
) {
  const entryCounts = (ids: number[]) =>
    new Map(
      db
        .select({
          conversationId: conversationEntries.conversationId,
          entries: count(),
        })
        .from(conversationEntries)
        .where(inArray(conversationEntries.conversationId, ids))
        .groupBy(conversationEntries.conversationId)
        .all()
        .map((row) => [row.conversationId, row.entries]),
    );

  const listOf = (ticketNumber: number): ConversationListing[] => {
    // Refuses an unknown Ticket with the Tickets module's own message.
    tickets.getTicket(ticketNumber);
    const rows = db
      .select(listingColumns)
      .from(conversations)
      .where(eq(conversations.ticketNumber, ticketNumber))
      .orderBy(desc(conversations.id))
      .all();
    const counts = entryCounts(rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, entryCount: counts.get(row.id) ?? 0 }));
  };

  return {
    /** A Ticket's Conversations, newest first. */
    ticketConversations: listOf,

    /**
     * One Conversation of a Ticket and a page of its entries, newest first.
     * `nextBefore` is the `before` of the next, older page; null on the last.
     */
    conversationEntries(
      ticketNumber: number,
      conversationId: number,
      query: EntriesQuery = {},
    ): {
      conversation: ConversationListing;
      entries: EntryListing[];
      nextBefore: number | null;
    } {
      const conversation = listOf(ticketNumber).find(
        (row) => row.id === conversationId,
      );
      if (!conversation) {
        throw new NotFoundError(
          `T${ticketNumber} has no Conversation ${conversationId}.`,
        );
      }
      const since = timestampOf('since', query.since);
      const until = timestampOf('until', query.until);
      const limit = query.limit ?? defaultEntriesLimit;
      const rows = db
        .select()
        .from(conversationEntries)
        .where(
          and(
            eq(conversationEntries.conversationId, conversationId),
            query.before === undefined
              ? undefined
              : lt(conversationEntries.id, query.before),
            since && gte(conversationEntries.createdAt, since),
            until && lte(conversationEntries.createdAt, until),
          ),
        )
        .orderBy(desc(conversationEntries.id))
        .limit(limit + 1)
        .all();
      const page = rows.slice(0, limit);
      return {
        conversation,
        entries: page.map((row) => {
          const cut = !query.full && row.text.length > trimmedTextLength;
          return {
            id: row.id,
            role: row.role,
            ...(row.toolName === null ? {} : { toolName: row.toolName }),
            text: cut ? `${row.text.slice(0, trimmedTextLength)}…` : row.text,
            ...(cut ? { truncated: true as const } : {}),
            ...(query.full && row.toolInput !== null
              ? { toolInput: row.toolInput }
              : {}),
            ...(row.permission === null ? {} : { permission: row.permission }),
            ...(row.answeredAt === null ? {} : { answeredAt: row.answeredAt }),
            ...(row.question === null ? {} : { question: row.question }),
            ...(row.widget === null ? {} : { widget: row.widget }),
            createdAt: row.createdAt,
          };
        }),
        nextBefore: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}

export type ConversationReader = ReturnType<typeof createConversationReader>;
