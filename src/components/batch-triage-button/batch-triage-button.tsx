'use client';

import { Alert, Button, Stack } from '@blockle/blocks';
import type { FC } from 'react';
import { useForm } from 'react-hook-form';

import { startBatchTriage } from '../../app/conversations/actions';
import { callAction } from '../../app/lib/call-action';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';

export type BatchTriageButtonProps = {
  projectId: number;
  /** The Board: a Cycle's id, or null for the Backlog. */
  cycleId: number | null;
  /** How many of the Board's Tickets a Batch triage would list now. */
  count: number;
  /** The Batch triage open for the Board, if any. */
  openId: number | null;
};

/**
 * Triage N (T1318): starts a Batch triage of the Board's N Triage-eligible
 * Tickets and opens its Conversation. With one open for the Board it opens
 * that one instead; with nothing to triage and none open it is hidden
 * (ADR 0047).
 */
export const BatchTriageButton: FC<BatchTriageButtonProps> = ({
  projectId,
  cycleId,
  count,
  openId,
}) => {
  const dialog = useConversationDialog();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    setError,
  } = useForm();
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async () => {
    if (openId !== null) {
      dialog.open(openId);
      return;
    }
    const result = await callAction(
      () => startBatchTriage({ projectId, cycleId }),
      'The Batch triage could not be started. Try again.',
    );
    if (!result.ok) {
      setError('root.server', { message: result.error });
      return;
    }
    dialog.open(result.conversation.id);
  });

  if (openId === null && count === 0) {
    return null;
  }

  return (
    <form aria-label="Batch triage" onSubmit={submit}>
      <Stack gap={2}>
        <div>
          <Button
            type="submit"
            size="small"
            variant="outline"
            loading={isSubmitting}
          >
            {openId === null ? `Triage ${count}` : 'Open Batch triage'}
          </Button>
        </div>
        {serverError && <Alert intent="danger">{serverError}</Alert>}
      </Stack>
    </form>
  );
};
