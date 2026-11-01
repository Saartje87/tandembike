'use client';

import { Alert, Button, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { stopConversation } from '../../app/conversations/actions';
import type { Conversation } from '../../conversations/conversations';
import {
  formatCost,
  hasRun,
  intentNames,
  stateNames,
} from '../conversation-labels/conversation-labels';

export type ConversationChatHeaderProps = {
  conversation: Conversation;
  /** What the Conversation is about: its Ticket, or its Project. */
  title: string;
};

/** The chat's header: its Ticket or Project, intent, state and cost, and Stop while a run is alive. */
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
            {`${intentNames[conversation.intent]}, ${stateNames[conversation.state]}, ${formatCost(conversation.costUsd)}`}
          </Text>
        </Stack>
        {hasRun(conversation.state) && (
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
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
