'use client';

import {
  Alert,
  Button,
  Dialog,
  Heading,
  Inline,
  Stack,
  Text,
} from '@blockle/blocks';
import { type FC, useId, useState, useTransition } from 'react';

import { removeConversationWorktree } from '../../app/conversations/actions';
import { callAction } from '../../app/lib/call-action';
import type { Conversation } from '../../conversations/conversations';

export type ConversationWorktreeProps = {
  conversation: Pick<
    Conversation,
    'id' | 'worktreePath' | 'worktreeKept' | 'worktreeRemoved'
  >;
};

const keptReasons = {
  dirty: 'it has uncommitted changes',
  unpushed: 'it has commits that no remote branch contains',
};

/**
 * Where the Conversation's worktree is, while there is one. A worktree
 * Tandembike kept shows why, with a Remove worktree button that asks first
 * and then removes it if it is clean by then (ADR 0033).
 */
export const ConversationWorktree: FC<ConversationWorktreeProps> = ({
  conversation,
}) => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startRemove] = useTransition();
  const headingId = useId();
  const descriptionId = useId();

  if (conversation.worktreePath === null || conversation.worktreeRemoved) {
    return null;
  }
  const kept = conversation.worktreeKept;

  const close = () => {
    setOpen(false);
    setError(undefined);
  };

  const confirm = () => {
    setError(undefined);
    startRemove(async () => {
      const result = await callAction(
        () => removeConversationWorktree({ conversationId: conversation.id }),
        'The worktree could not be removed. Try again.',
      );
      if (result.ok) {
        close();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Stack gap={1}>
      <Text fontSize="small" color="muted">
        {`Worktree: ${conversation.worktreePath}`}
      </Text>
      {kept !== null && (
        <Inline gap={2} alignY="center">
          <Text fontSize="small" fontWeight="strong">
            {`Worktree kept: ${keptReasons[kept]}.`}
          </Text>
          <Button
            type="button"
            size="small"
            variant="outline"
            intent="danger"
            onClick={() => setOpen(true)}
          >
            Remove worktree
          </Button>
          <Dialog
            open={open}
            onRequestClose={close}
            aria-labelledby={headingId}
            aria-describedby={descriptionId}
          >
            {open && (
              <Stack gap={4}>
                <Heading id={headingId} level={2}>
                  Remove this worktree?
                </Heading>
                <Text id={descriptionId} tag="p">
                  {`Tandembike kept ${conversation.worktreePath} because ${keptReasons[kept]}. Removing it deletes the folder; the branch stays. If it still holds that work, it is not removed.`}
                </Text>
                {error && <Alert intent="danger">{error}</Alert>}
                <Inline gap={2}>
                  <Button
                    type="button"
                    intent="danger"
                    loading={pending}
                    disabled={pending}
                    onClick={confirm}
                  >
                    Remove worktree
                  </Button>
                  <Button type="button" variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                </Inline>
              </Stack>
            )}
          </Dialog>
        </Inline>
      )}
    </Stack>
  );
};
