'use client';

import { Alert, Button, Stack } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { rootRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { closeSpar, reopenSpar } from '../../app/spars/actions';

export type SparCloseButtonProps = {
  sparId: number;
  closed: boolean;
  /** Close was asked and its Summarise turn has not ended yet. */
  closing: boolean;
};

/**
 * Close, or Reopen once closed. Close sends a final Summarise and makes the
 * Spar read-only when that turn ends; Reopen makes it editable again, and the
 * next reply resumes its run.
 */
export const SparCloseButton: FC<SparCloseButtonProps> = ({
  sparId,
  closed,
  closing,
}) => {
  const [pending, startChange] = useTransition();
  const [error, setError] = useState<string>();

  const change = () => {
    setError(undefined);
    startChange(async () => {
      const result = await callAction(
        () => (closed ? reopenSpar({ sparId }) : closeSpar({ sparId })),
        'The Spar could not be changed. Try again.',
      );
      setError(rootRefusal(result));
    });
  };

  return (
    <Stack gap={1}>
      <div>
        <Button
          type="button"
          size="small"
          variant="outline"
          loading={pending}
          disabled={pending || closing}
          onClick={change}
        >
          {closed ? 'Reopen' : closing ? 'Closing…' : 'Close'}
        </Button>
      </div>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
