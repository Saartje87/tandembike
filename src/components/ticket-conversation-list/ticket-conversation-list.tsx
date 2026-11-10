'use client';

import { Alert, Button, Heading, Stack, Tooltip } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { formatCost } from '../../app/lib/format-cost';
import type { Conversation } from '../../conversations/conversations';
import type { Footprint } from '../../footprint/footprint';
import {
  formatComparisons,
  formatFootprint,
} from '../../footprint/format-footprint';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import {
  intentNames,
  stateNames,
} from '../conversation-labels/conversation-labels';

export type TicketConversationListProps = {
  /** The Ticket's Conversations, newest first. */
  conversations: Conversation[];
  /** Their estimated Footprints by Conversation id; one left out is not measured (ADR 0050). */
  footprints?: Record<number, Footprint>;
};

const footprintLabel = (footprint: Footprint | undefined) =>
  footprint?.measured ? formatFootprint(footprint) : 'Footprint not measured';

/**
 * A compact list of a Ticket's Conversations with Agents: intent, state,
 * cost and Footprint, with its comparisons in a tooltip. A row opens the Conversation in the Conversation dialog, reopening it
 * first when the User closed it. Renders nothing for a Ticket without any.
 */
export const TicketConversationList: FC<TicketConversationListProps> = ({
  conversations,
  footprints = {},
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
            const footprint = footprints[conversation.id];
            const button = (
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
                {`${intentNames[conversation.intent]} · ${conversation.hidden ? 'closed' : stateNames[conversation.state]} · ${formatCost(conversation.costUsd)} · ${footprintLabel(footprint)}`}
              </Button>
            );
            return (
              <li key={conversation.id}>
                {footprint?.measured ? (
                  <Tooltip content={formatComparisons(footprint)}>
                    {button}
                  </Tooltip>
                ) : (
                  button
                )}
              </li>
            );
          })}
        </ul>
      </Stack>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
