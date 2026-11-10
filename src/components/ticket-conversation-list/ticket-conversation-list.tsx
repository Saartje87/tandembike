'use client';

import { Alert, Button, Heading, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { formatCost } from '../../app/lib/format-cost';
import type { Conversation } from '../../conversations/conversations';
import type { Footprint } from '../../footprint/footprint';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import {
  intentNames,
  stateNames,
} from '../conversation-labels/conversation-labels';
import { FootprintText } from '../footprint-text/footprint-text';

export type TicketConversationListProps = {
  /** The Ticket's Conversations, newest first. */
  conversations: Conversation[];
  /** Their estimated Footprints by Conversation id; one left out is not measured (ADR 0050). */
  footprints: Record<number, Footprint>;
};

/**
 * A compact list of a Ticket's Conversations with Agents: intent, state,
 * cost, and its Footprint with the comparisons in a tooltip. A row's button opens the
 * Conversation in the Conversation dialog, reopening it first when the User
 * closed it. Renders nothing for a Ticket without any.
 */
export const TicketConversationList: FC<TicketConversationListProps> = ({
  conversations,
  footprints,
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
          {conversations.map((conversation) => {
            return (
              <Inline asChild key={conversation.id} gap={1} alignY="center">
                <li>
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
                  <Text fontSize="small" color="muted" aria-hidden>
                    ·
                  </Text>
                  <FootprintText
                    footprint={
                      footprints[conversation.id] ?? { measured: false }
                    }
                  />
                </li>
              </Inline>
            );
          })}
        </ul>
      </Stack>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
