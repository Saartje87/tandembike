'use client';

import { Alert, Button, Heading, Stack } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import type { Conversation } from '../../conversations/conversations';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import {
  formatCost,
  intentNames,
  stateNames,
} from '../conversation-transcript/conversation-transcript';

export type TicketConversationListProps = {
  /** The Ticket's Conversations, newest first. */
  conversations: Conversation[];
};

/**
 * A compact list of a Ticket's Conversations with Agents: intent, state and
 * cost. A row opens the Conversation in the Conversation dialog, reopening it
 * first when the User closed it. Renders nothing for a Ticket without any.
 */
export const TicketConversationList: FC<TicketConversationListProps> = ({
  conversations,
}) => {
  const dialog = useConversationDialog();
  const [, startOpen] = useTransition();
  const [error, setError] = useState<string>();

  if (conversations.length === 0) {
    return null;
  }

  return (
    <Stack gap={2}>
      <Heading level={3} fontSize="medium">
        Conversations
      </Heading>
      <Stack gap={1} listStyle="none" role="list" asChild>
        <ul aria-label="Conversations">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Button
                type="button"
                size="small"
                variant="ghost"
                onClick={() => {
                  setError(undefined);
                  startOpen(async () => {
                    setError(await dialog.reopenAndOpen(conversation));
                  });
                }}
              >
                {`${intentNames[conversation.intent]} · ${conversation.hidden ? 'closed' : stateNames[conversation.state]} · ${formatCost(conversation.costUsd)}`}
              </Button>
            </li>
          ))}
        </ul>
      </Stack>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
