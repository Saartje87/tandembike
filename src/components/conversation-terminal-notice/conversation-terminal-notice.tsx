'use client';

import { Alert, Button, Inline, Stack } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { closeConversation } from '../../app/conversations/actions';
import { callAction } from '../../app/lib/call-action';
import type { Conversation } from '../../conversations/conversations';

export type ConversationTerminalNoticeProps = {
  conversation: Conversation;
};

/**
 * What takes the place of the reply box for a Terminal Conversation
 * (ADR 0039): the User answers in the terminal while it runs, and can Close it
 * once the session has ended.
 */
export const ConversationTerminalNotice: FC<
  ConversationTerminalNoticeProps
> = ({ conversation }) => {
  const [pending, startClose] = useTransition();
  const [error, setError] = useState<string>();

  if (conversation.state !== 'stopped') {
    return <Alert intent="info">Running in a terminal</Alert>;
  }

  return (
    <Stack gap={1}>
      <Inline gap={2} alignY="center" justifyContent="space-between">
        <Alert intent="info">The terminal session ended.</Alert>
        <Button
          type="button"
          size="small"
          variant="outline"
          loading={pending}
          disabled={pending}
          onClick={() => {
            setError(undefined);
            startClose(async () => {
              const result = await callAction(
                () => closeConversation({ conversationId: conversation.id }),
                'The Conversation could not be closed. Try again.',
              );
              if (!result.ok) {
                setError(result.error);
              }
            });
          }}
        >
          Close
        </Button>
      </Inline>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
