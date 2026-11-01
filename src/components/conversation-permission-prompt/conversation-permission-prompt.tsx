'use client';

import { Alert, Button, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { answerConversationPermission } from '../../app/conversations/actions';
import type { PermissionStatus } from '../../conversations/conversation-state';

export type ConversationPermissionPromptProps = {
  entryId: number;
  permission: PermissionStatus;
};

const outcomes: Record<Exclude<PermissionStatus, 'pending'>, string> = {
  allowed: 'Allowed',
  denied: 'Denied',
  expired: 'Not answered',
};

/**
 * What a permission request says below its text, inline in the chat: Allow and
 * Deny while the run waits on it, then the outcome. The run waits until the
 * User picks one.
 */
export const ConversationPermissionPrompt: FC<
  ConversationPermissionPromptProps
> = ({ entryId, permission }) => {
  const [pending, startAnswer] = useTransition();
  const [error, setError] = useState<string>();

  const answer = (allow: boolean) => () => {
    setError(undefined);
    startAnswer(async () => {
      const result = await answerConversationPermission({ entryId, allow });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  if (permission !== 'pending') {
    return (
      <Text fontSize="small" color="muted">
        {outcomes[permission]}
      </Text>
    );
  }
  return (
    <Stack gap={1}>
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
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
