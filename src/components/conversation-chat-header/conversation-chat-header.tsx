'use client';

import { Alert, Button, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { stopConversation } from '../../app/conversations/actions';
import type { Conversation } from '../../conversations/conversations';
import {
  formatCost,
  hasRun,
  intentNames,
  starterNames,
  stateNames,
} from '../conversation-labels/conversation-labels';
import { ConversationWorktree } from '../conversation-worktree/conversation-worktree';

export type ConversationChatHeaderProps = {
  conversation: Conversation;
  /** What the Conversation is about: its Ticket, or its Project. */
  title: string;
};

/** The chat's header: its Ticket or Project, intent, state and cost, and Stop while a run is alive (a Terminal Conversation has no Stop). */
export const ConversationChatHeader: FC<ConversationChatHeaderProps> = ({
  conversation,
  title,
}) => {
  const [pending, startStop] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <Stack gap={1}>
      <Inline
        gap={2}
        alignY="center"
        justifyContent="space-between"
        flexWrap="nowrap"
      >
        <Stack gap={0}>
          <Text fontWeight="strong">{title}</Text>
          <Text fontSize="small" color="muted">
            {[
              intentNames[conversation.intent],
              stateNames[conversation.state],
              // Tandembike sees no cost of an interactive session (ADR 0039).
              ...(conversation.startedBy === 'terminal'
                ? []
                : [formatCost(conversation.costUsd)]),
            ].join(', ')}
          </Text>
          <Text fontSize="small" color="muted">
            {`Started by ${starterNames[conversation.startedBy]}`}
          </Text>
        </Stack>
        {hasRun(conversation.state) &&
          conversation.startedBy !== 'terminal' && (
            <Button
              type="button"
              size="small"
              variant="outline"
              intent="danger"
              loading={pending}
              disabled={pending}
              onClick={() => {
                setError(undefined);
                startStop(async () => {
                  const result = await stopConversation({
                    conversationId: conversation.id,
                  });
                  if (!result.ok) {
                    setError(result.error);
                  }
                });
              }}
            >
              Stop
            </Button>
          )}
      </Inline>
      <ConversationWorktree conversation={conversation} />
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
