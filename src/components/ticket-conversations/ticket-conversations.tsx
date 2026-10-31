'use client';

import {
  Alert,
  Box,
  Button,
  Heading,
  Inline,
  Label,
  Stack,
  Text,
  Textarea,
} from '@blockle/blocks';
import { type FC, useId, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import {
  answerConversationPermission,
  replyToConversation,
  stopConversation,
} from '../../app/conversations/actions';
import { modeColors } from '../../app/lib/mode-colors';
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
import { FieldError } from '../field-error/field-error';

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
};

const intentNames: Record<ConversationIntent, string> = {
  start: 'Start',
  triage: 'Triage',
  ask: 'Ask',
};

const stateNames: Record<ConversationState, string> = {
  running: 'working',
  waiting: 'needs you',
  idle: 'waiting for you',
  interrupted: 'interrupted',
  stopped: 'stopped',
};

const speakerNames: Record<TranscriptRole, string> = {
  user: 'You',
  agent: 'Agent',
  tool: 'Tool',
  error: 'Error',
  permission: 'Permission',
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
            {entry.text}
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

type ReplyFormProps = { conversationId: number };

/** The reply field. A refused reply keeps its text and shows the reason. */
const ReplyForm: FC<ReplyFormProps> = ({ conversationId }) => {
  const inputId = useId();
  const errorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    watch,
  } = useForm<{ text: string }>({
    defaultValues: { text: '' },
    reValidateMode: 'onSubmit',
  });
  const fieldError = errors.text?.message;
  const error = errors.root?.server?.message;

  const submit = handleSubmit(async ({ text }) => {
    const result = await replyToConversation({ conversationId, text });
    if (!result.ok) {
      const reason = result.fieldErrors?.text;
      if (reason) {
        setError('text', { type: 'server', message: reason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    reset();
  });

  return (
    <form
      onSubmit={(event) => {
        if (isSubmitting) {
          event.preventDefault();
          return;
        }
        submit(event);
      }}
    >
      <Stack gap={1}>
        <Label htmlFor={inputId}>Reply</Label>
        <Textarea
          {...register('text')}
          id={inputId}
          rows={3}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
        />
        <FieldError id={errorId} reason={fieldError} />
        {error && <Alert intent="danger">{error}</Alert>}
        <Inline gap={2}>
          <Button
            type="submit"
            size="small"
            loading={isSubmitting}
            disabled={isSubmitting || watch('text').trim() === ''}
          >
            Send
          </Button>
        </Inline>
      </Stack>
    </form>
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
      <Heading level={3} fontSize="medium">
        Conversations
      </Heading>
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
                {`${intentNames[item.conversation.intent]} · ${stateNames[item.conversation.state]}`}
              </Button>
            </li>
          ))}
        </ul>
      </Stack>
      <Inline gap={2} alignY="center" justifyContent="space-between">
        <Text fontSize="small" color="muted">
          {`${intentNames[conversation.intent]}, ${stateNames[conversation.state]}`}
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
        <ReplyForm key={conversation.id} conversationId={conversation.id} />
      )}
    </Stack>
  );
};
