'use client';

import { Alert, Box, Stack, Text } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { modeColors } from '../../app/lib/mode-colors';
import { ticketByNumberPath } from '../../app/lib/paths';
import type { TranscriptEntry } from '../../conversations/conversations';
import { AppLink } from '../app-link/app-link';
import { ConversationPermissionPrompt } from '../conversation-permission-prompt/conversation-permission-prompt';
import { ConversationQuestionForm } from '../conversation-question-form/conversation-question-form';
import { Markdown } from '../markdown/markdown';
import * as styles from './conversation-message.css';

export type ConversationMessageProps = { entry: TranscriptEntry };

/** Text with each `T12` linked to that Ticket, such as those an Agent created. */
const withTicketLinks = (text: string): ReactNode[] =>
  text.split(/\b(T[1-9]\d*)\b/).map((part, index) =>
    index % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
      <AppLink key={index} href={ticketByNumberPath(Number(part.slice(1)))}>
        {part}
      </AppLink>
    ) : (
      part
    ),
  );

/**
 * One transcript entry as a chat message: the User's on the right, the
 * Agent's, an error and a permission request on the left, and a tool call as a
 * muted, compact line.
 */
export const ConversationMessage: FC<ConversationMessageProps> = ({
  entry,
}) => {
  if (entry.role === 'tool') {
    return (
      <Box asChild alignSelf="flex-start" className={styles.bubble}>
        <li data-side="start">
          <Text tag="p" fontSize="small" color="muted">
            {withTicketLinks(entry.text)}
          </Text>
        </li>
      </Box>
    );
  }

  if (entry.role === 'error') {
    return (
      <Box asChild alignSelf="flex-start" className={styles.bubble}>
        <li data-side="start">
          <Alert intent="danger">{withTicketLinks(entry.text)}</Alert>
        </li>
      </Box>
    );
  }

  const fromUser = entry.role === 'user';
  return (
    <Box
      asChild
      alignSelf={fromUser ? 'flex-end' : 'flex-start'}
      backgroundColor={fromUser ? modeColors.primarySubtle : modeColors.sunken}
      borderRadius={3}
      paddingBlock={1}
      paddingInline={3}
      className={styles.bubble}
    >
      <li data-side={fromUser ? 'end' : 'start'}>
        <Stack gap={1}>
          <Text fontSize="small" fontWeight="strong" color="muted">
            {fromUser
              ? 'You'
              : entry.role === 'agent'
                ? 'Agent'
                : entry.role === 'question'
                  ? 'Question'
                  : 'Permission'}
          </Text>
          {entry.question !== null ? (
            <ConversationQuestionForm
              entryId={entry.id}
              question={entry.question}
            />
          ) : entry.role === 'agent' || entry.role === 'user' ? (
            <Markdown headingLevel={4} breaks>
              {entry.text}
            </Markdown>
          ) : (
            <Text tag="p">{withTicketLinks(entry.text)}</Text>
          )}
          {entry.permission !== null && (
            <ConversationPermissionPrompt
              entryId={entry.id}
              permission={entry.permission}
            />
          )}
        </Stack>
      </li>
    </Box>
  );
};
