import { z } from 'zod';

import {
  type ConversationReader,
  defaultEntriesLimit,
  maxEntriesLimit,
  trimmedTextLength,
} from '../conversations/conversation-reader';
import { NotFoundError } from '../tickets/errors';
import { respond, type ToolContext, ticketNumber } from './tool-shared';

export const registerConversationTools = (
  { registerTool }: ToolContext,
  conversations: ConversationReader | undefined,
): void => {
  registerTool(
    'get_conversations',
    {
      title: 'Get Conversations',
      description: `Read a Ticket's Conversations, the Agent runs Tandembike started about it. Without conversationId, returns { conversations }, newest first, each with id, intent (start, triage, ask, merge, spec…), state (running, waiting, idle, interrupted or stopped), startedBy (user, autopilot or terminal), entryCount, createdAt and updatedAt. With conversationId, returns { conversation, entries, nextBefore }: a page of its transcript, newest first, each entry with id, role (user, autopilot, agent, tool, error, permission, question, widget, created or session), toolName, text, permission, question, widget and createdAt, leaving out fields that do not apply. text is cut to ${trimmedTextLength} characters, with truncated: true, unless full is set, which also adds each tool entry's toolInput. Page back by passing nextBefore as before; it is null on the last page. Read-only.`,
      inputSchema: {
        number: ticketNumber,
        conversationId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "The Conversation whose entries to read, one of this Ticket's. Leave out to list the Conversations.",
          ),
        before: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'Only entries older than this entry id: the previous page’s nextBefore.',
          ),
        since: z
          .string()
          .optional()
          .describe(
            'Only entries written at or after this ISO 8601 date-time with a time zone, such as 2026-11-09T10:00:00Z.',
          ),
        until: z
          .string()
          .optional()
          .describe(
            'Only entries written at or before this ISO 8601 date-time.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(maxEntriesLimit)
          .optional()
          .describe(
            `The most entries to return, at most ${maxEntriesLimit}. Defaults to ${defaultEntriesLimit}.`,
          ),
        full: z
          .boolean()
          .optional()
          .describe(
            "true returns each entry's whole text and a tool entry's input. Defaults to false: transcripts can be large.",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    ({ number, conversationId, ...query }) =>
      respond(() => {
        if (!conversations) {
          throw new NotFoundError('Conversations cannot be read here.');
        }
        return conversationId === undefined
          ? { conversations: conversations.ticketConversations(number) }
          : conversations.conversationEntries(number, conversationId, query);
      }),
  );
};
