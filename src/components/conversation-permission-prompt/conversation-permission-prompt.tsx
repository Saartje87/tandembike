'use client';

import { Alert, Button, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { answerConversationPermission } from '../../app/conversations/actions';
import type { PermissionAnswer } from '../../conversations/agent-runner';
import type { PermissionStatus } from '../../conversations/conversation-state';

export type ConversationPermissionPromptProps = {
  entryId: number;
  permission: PermissionStatus;
  /** The allow rules the run proposed; none (null) hides Always allow. */
  rules: string[] | null;
};

const outcomes: Record<Exclude<PermissionStatus, 'pending'>, string> = {
  allowed: 'Allowed',
  'always-allowed': 'Always allowed',
  denied: 'Denied',
  expired: 'Not answered',
};

/**
 * What a permission request says below its text, inline in the chat: Allow,
 * Always allow (when the run proposed rules) and Deny while the run waits on
 * it, then the outcome. The run waits until the User picks one.
 */
export const ConversationPermissionPrompt: FC<
  ConversationPermissionPromptProps
> = ({ entryId, permission, rules }) => {
  const [pending, startAnswer] = useTransition();
  const [error, setError] = useState<string>();

  const answerWith = (answer: PermissionAnswer) => () => {
    setError(undefined);
    startAnswer(async () => {
      const result = await answerConversationPermission({ entryId, answer });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  const ruleList = rules?.length ? rules : null;
  const ruleText = ruleList && (
    <Text tag="code" fontFamily="mono">
      {ruleList.join(', ')}
    </Text>
  );

  if (permission !== 'pending') {
    return (
      <Text fontSize="small" color="muted">
        {outcomes[permission]}
        {permission === 'always-allowed' && ruleText && <> {ruleText}</>}
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
          onClick={answerWith('allow')}
        >
          Allow
        </Button>
        {ruleText && (
          <Button
            type="button"
            size="small"
            variant="outline"
            disabled={pending}
            onClick={answerWith('allow-always')}
          >
            Always allow {ruleText}
          </Button>
        )}
        <Button
          type="button"
          size="small"
          variant="outline"
          intent="danger"
          disabled={pending}
          onClick={answerWith('deny')}
        >
          Deny
        </Button>
      </Inline>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
