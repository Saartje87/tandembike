'use client';

import {
  Alert,
  Box,
  Button,
  Heading,
  Inline,
  Stack,
  Text,
} from '@blockle/blocks';
import { type FC, type ReactNode, useState, useTransition } from 'react';

import {
  answerConversationPermission,
  replyToConversation,
  stopConversation,
} from '../../app/conversations/actions';
import { modeColors } from '../../app/lib/mode-colors';
import { ticketByNumberPath } from '../../app/lib/paths';
import type {
  ConversationIntent,
  ConversationState,
  PermissionStatus,
  TranscriptRole,
} from '../../conversations/conversation-state';
import type {
  Conversation,
  TranscriptEntry,
} from '../../conversations/conversations';
import { AppLink } from '../app-link/app-link';
import { MessageForm } from '../message-form/message-form';

export type ConversationWithTranscript = {
  conversation: Conversation;
  transcript: TranscriptEntry[];
};

export type TicketConversationsProps = {
  /** The Ticket's Conversations with their transcripts, newest first. */
  items: ConversationWithTranscript[];
  /** The Conversation to show open, when the parent picks it. */
  openId?: number | undefined;
  /** Called with the id of a Conversation the User picks from the list. */
  onOpen?: (conversationId: number) => void;
  /** Whether to list the Conversations above the open one; defaults to true. */
  showList?: boolean;
};

export const intentNames: Record<ConversationIntent, string> = {
  start: 'Start',
  triage: 'Triage',
  ask: 'Ask',
  new_ticket: 'New Ticket',
};

export const stateNames: Record<ConversationState, string> = {
  running: 'working',
  waiting: 'needs you',
  idle: 'waiting for you',
  interrupted: 'interrupted',
  stopped: 'stopped',
};

/** A Conversation's cost so far, in US dollars; under a cent, to 4 places. */
const formatCost = (costUsd: number) =>
  `$${costUsd > 0 && costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}`;

const speakerNames: Record<TranscriptRole, string> = {
  user: 'You',
  agent: 'Agent',
  tool: 'Tool',
  error: 'Error',
  permission: 'Permission',
  created: 'Created',
};

const permissionOutcomes: Record<
  Exclude<PermissionStatus, 'pending'>,
  string
> = {
  allowed: 'Allowed',
  denied: 'Denied',
  expired: 'Not answered',
};

/** Whether a run of the Conversation is alive, so it can be stopped. */
const hasRun = (state: ConversationState) =>
  state === 'running' || state === 'waiting' || state === 'idle';

/** Text with each `T12` linked to that Ticket. */
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

type EntryLineProps = { entry: TranscriptEntry };

/**
 * One transcript entry. A permission request still waiting shows Allow and
 * Deny; the run waits until the User picks one.
 */
const EntryLine: FC<EntryLineProps> = ({ entry }) => {
  const [pending, startAnswer] = useTransition();
  const [error, setError] = useState<string>();

  const answer = (allow: boolean) => () => {
    setError(undefined);
    startAnswer(async () => {
      const result = await answerConversationPermission({
        entryId: entry.id,
        allow,
      });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <Box
      asChild
      backgroundColor={entry.role === 'user' ? modeColors.sunken : undefined}
      borderRadius={2}
      paddingBlock={1}
      paddingInline={2}
    >
      <li>
        <Stack gap={1}>
          <Text
            fontSize="small"
            fontWeight="strong"
            color={entry.role === 'tool' ? 'muted' : undefined}
          >
            {speakerNames[entry.role]}
          </Text>
          <Text
            tag="p"
            fontSize={entry.role === 'tool' ? 'small' : undefined}
            color={entry.role === 'tool' ? 'muted' : undefined}
          >
            {entry.role === 'created'
              ? withTicketLinks(entry.text)
              : entry.text}
          </Text>
          {entry.permission === 'pending' && (
            <Inline gap={2}>
              <Button
                type="button"
                size="small"
                disabled={pending}
                onClick={answer(true)}
              >
                Allow
              </Button>
              <Button
                type="button"
                size="small"
                variant="outline"
                intent="danger"
                disabled={pending}
                onClick={answer(false)}
              >
                Deny
              </Button>
            </Inline>
          )}
          {entry.permission !== null && entry.permission !== 'pending' && (
            <Text fontSize="small" color="muted">
              {permissionOutcomes[entry.permission]}
            </Text>
          )}
          {error && <Alert intent="danger">{error}</Alert>}
        </Stack>
      </li>
    </Box>
  );
};

type StopButtonProps = { conversationId: number };

const StopButton: FC<StopButtonProps> = ({ conversationId }) => {
  const [pending, startStop] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <Stack gap={1}>
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
            const result = await stopConversation({ conversationId });
            if (!result.ok) {
              setError(result.error);
            }
          });
        }}
      >
        Stop
      </Button>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};

/**
 * A Ticket's Conversations with Agents (ADR 0019): a list of them, newest
 * first, with the newest open. The open one shows its transcript, which the
 * drawer refreshes while the run works, a reply field, Stop, and Allow and
 * Deny for each permission request the run waits on. Renders nothing for a
 * Ticket without Conversations.
 */
export const TicketConversations: FC<TicketConversationsProps> = ({
  items,
  openId,
  onOpen,
  showList = true,
}) => {
  const [pickedId, setPickedId] = useState<number>();

  if (items.length === 0) {
    return null;
  }
  const open =
    items.find((item) => item.conversation.id === (openId ?? pickedId)) ??
    items[0];
  const { conversation, transcript } = open;

  return (
    <Stack gap={2}>
      {showList && (
        <Heading level={3} fontSize="medium">
          Conversations
        </Heading>
      )}
      {showList && (
        <Stack gap={1} listStyle="none" role="list" asChild>
          <ul aria-label="Conversations">
            {items.map((item) => (
              <li key={item.conversation.id}>
                <Button
                  type="button"
                  size="small"
                  variant={
                    item.conversation.id === conversation.id ? 'solid' : 'ghost'
                  }
                  aria-pressed={item.conversation.id === conversation.id}
                  onClick={() => {
                    setPickedId(item.conversation.id);
                    onOpen?.(item.conversation.id);
                  }}
                >
                  {`${intentNames[item.conversation.intent]} · ${stateNames[item.conversation.state]} · ${formatCost(item.conversation.costUsd)}`}
                </Button>
              </li>
            ))}
          </ul>
        </Stack>
      )}
      <Inline gap={2} alignY="center" justifyContent="space-between">
        <Text fontSize="small" color="muted">
          {`${intentNames[conversation.intent]}, ${stateNames[conversation.state]}, ${formatCost(conversation.costUsd)}`}
        </Text>
        {hasRun(conversation.state) && (
          <StopButton conversationId={conversation.id} />
        )}
      </Inline>
      <Stack gap={1} listStyle="none" role="list" asChild>
        <ul aria-label="Transcript">
          {transcript.map((entry) => (
            <EntryLine key={entry.id} entry={entry} />
          ))}
        </ul>
      </Stack>
      {conversation.state === 'interrupted' && (
        <Alert intent="warning">
          This Conversation was interrupted. Reply to resume it.
        </Alert>
      )}
      {conversation.state === 'stopped' ? (
        <Text tag="p" color="muted">
          This Conversation was stopped. Start a new one.
        </Text>
      ) : (
        <MessageForm
          key={conversation.id}
          label="Reply"
          onSend={async (text) => {
            const result = await replyToConversation({
              conversationId: conversation.id,
              text,
            });
            return result.ok
              ? { ok: true }
              : {
                  ok: false,
                  error: result.error,
                  reason: result.fieldErrors?.text,
                };
          }}
        />
      )}
    </Stack>
  );
};
