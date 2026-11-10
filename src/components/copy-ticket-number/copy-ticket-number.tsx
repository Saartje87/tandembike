'use client';

import { Button, Inline, Text, VisuallyHidden } from '@blockle/blocks';
import { type FC, type MouseEvent, useEffect, useState } from 'react';

import { Icon } from '../icon/icon';
import * as styles from './copy-ticket-number.css';

/** How long the confirmation shows. */
const confirmationMs = 2000;

type CopyState = 'idle' | 'copied' | 'failed';

/** What the button says after a copy, and what the live region announces. */
const outcomes = {
  copied: 'Copied',
  failed: "Couldn't copy",
} as const;

export type CopyTicketNumberProps = {
  number: number;
  /**
   * The number as plain muted mono text, for a Board row: an icon over it
   * confirms or refuses a copy, and a Cmd/Ctrl/Shift-click is left to the
   * row to select it.
   */
  quiet?: boolean;
};

/**
 * A Ticket's number, `T42`, as a button that copies it. A copy confirms in
 * place for a moment; a failed one says so until the next try, with the
 * number beside it to select by hand. A live region announces both. The
 * `quiet` variant shows an icon over the number instead of the words.
 */
export const CopyTicketNumber: FC<CopyTicketNumberProps> = ({
  number,
  quiet = false,
}) => {
  const text = `T${number}`;
  const [state, setState] = useState<CopyState>('idle');

  // The quiet variant's warning hides the number, so it times out too.
  useEffect(() => {
    if (state === 'idle' || (state === 'failed' && !quiet)) {
      return;
    }
    const timer = setTimeout(() => setState('idle'), confirmationMs);
    return () => clearTimeout(timer);
  }, [state, quiet]);

  const copy = async () => {
    setState('idle');
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      // No Clipboard API (an insecure context) or a refused write.
      setState('failed');
    }
  };

  const announcement = (
    <VisuallyHidden role="status">
      {state === 'idle' ? '' : `${outcomes[state]} ${text}`}
    </VisuallyHidden>
  );

  if (quiet) {
    const copyUnlessSelecting = (event: MouseEvent) => {
      // A select click belongs to the Board row around the button.
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      copy();
    };
    return (
      <>
        <button
          type="button"
          className={styles.quiet}
          aria-label={`Copy Ticket number ${text}`}
          onClick={copyUnlessSelecting}
        >
          <Text
            fontFamily="mono"
            fontSize="small"
            color="muted"
            className={
              state === 'idle'
                ? styles.stacked
                : `${styles.stacked} ${styles.hidden}`
            }
          >
            {text}
          </Text>
          {state !== 'idle' && (
            <Icon
              name={
                state === 'copied'
                  ? 'clipboard-document-check'
                  : 'exclamation-triangle'
              }
              size="small"
              className={styles.stacked}
            />
          )}
        </button>
        {announcement}
      </>
    );
  }

  return (
    <Inline gap={2} alignY="center">
      <Button
        type="button"
        variant="ghost"
        size="small"
        aria-label={`Copy Ticket number ${text}`}
        startSlot={
          state === 'copied' ? (
            <Icon name="clipboard-document-check" size="small" />
          ) : undefined
        }
        onClick={copy}
      >
        {state === 'idle' ? text : outcomes[state]}
      </Button>
      {state === 'failed' && (
        <Text fontSize="small" color="muted">
          {text}
        </Text>
      )}
      {announcement}
    </Inline>
  );
};
