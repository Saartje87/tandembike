'use client';

import { Alert, Button, Inline, Stack } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { refusalReason } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { sendSparTurn } from '../../app/spars/actions';
import { sparMoves } from '../../spars/spar-moves';

export type SparTurnBarProps = {
  sparId: number;
};

/**
 * The button bar above a Spar's message field: each button sends its move
 * in one click, as a message the transcript shows, with what changed on the
 * Canvas. Your move hands the turn over with only those changes.
 */
export const SparTurnBar: FC<SparTurnBarProps> = ({ sparId }) => {
  const [pending, startSend] = useTransition();
  const [error, setError] = useState<string>();

  const send = (message: string) => () => {
    setError(undefined);
    startSend(async () => {
      const result = await callAction(
        () => sendSparTurn({ sparId, text: message }),
        'The message could not be sent. Try again.',
      );
      setError(refusalReason(result));
    });
  };

  return (
    <Stack gap={1}>
      <Inline gap={1} flexWrap="wrap" role="group" aria-label="Moves">
        {sparMoves.map(({ label, message }) => (
          <Button
            key={label}
            type="button"
            size="small"
            variant="outline"
            disabled={pending}
            onClick={send(message)}
          >
            {label}
          </Button>
        ))}
      </Inline>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
