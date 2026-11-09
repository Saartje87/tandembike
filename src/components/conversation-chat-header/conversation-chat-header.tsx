'use client';

import { Alert, Button, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { stopConversation } from '../../app/conversations/actions';
import { callAction } from '../../app/lib/call-action';
import { formatCost } from '../../app/lib/format-cost';
import { isTerminal } from '../../conversations/conversation-state';
import type { Conversation } from '../../conversations/conversations';
import {
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
  const [copied, setCopied] = useState(false);
  const resumeCommand = `tandembike resume ${conversation.id}`;
  // Continue in terminal hands a UI Conversation's SDK session to `claude`.
  const canContinue =
    !isTerminal(conversation) && conversation.sdkSessionId !== null;

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
              // Tandembike sees no cost of an interactive session, but keeps
              // what a UI run spent before the hand-off (ADR 0039).
              ...(isTerminal(conversation) && conversation.costUsd <= 0
                ? []
                : [formatCost(conversation.costUsd)]),
            ].join(', ')}
          </Text>
          <Text fontSize="small" color="muted">
            {`Started by ${starterNames[conversation.startedBy]}`}
          </Text>
        </Stack>
        {canContinue && (
          <Button
            type="button"
            size="small"
            variant="outline"
            onClick={async () => {
              setError(undefined);
              try {
                await navigator.clipboard.writeText(resumeCommand);
                setCopied(true);
              } catch {
                setCopied(false);
                setError(`Could not copy. Run: ${resumeCommand}`);
              }
            }}
          >
            Continue in terminal
          </Button>
        )}
        {hasRun(conversation.state) && !isTerminal(conversation) && (
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
                const result = await callAction(
                  () => stopConversation({ conversationId: conversation.id }),
                  'The run could not be stopped. Try again.',
                );
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
      {copied && canContinue && (
        <Text fontSize="small" color="muted" role="status">
          {`Copied: ${resumeCommand}`}
        </Text>
      )}
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
