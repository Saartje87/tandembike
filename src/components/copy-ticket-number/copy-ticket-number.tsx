'use client';

import { Button, Inline, Text, VisuallyHidden } from '@blockle/blocks';
import { type FC, type MouseEvent, useEffect, useState } from 'react';

import { Icon } from '../icon/icon';
import { keepDrawerOpen } from '../ticket-drawer/keep-drawer-open';

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
};

/**
 * A Ticket's number, `#42`, as a button that copies it. A copy confirms in
 * place for a moment; a failed one says so until the next try, with the
 * number beside it to select by hand. A live region announces both.
 */
export const CopyTicketNumber: FC<CopyTicketNumberProps> = ({ number }) => {
  const text = `#${number}`;
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state !== 'copied') {
      return;
    }
    const timer = setTimeout(() => setState('idle'), confirmationMs);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async (event: MouseEvent) => {
    // The click swaps the button's content, which can take its target out
    // of the drawer.
    keepDrawerOpen(event);
    setState('idle');
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      // No Clipboard API (an insecure context) or a refused write.
      setState('failed');
    }
  };

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
        <Text fontSize="small" color="text-600">
          {text}
        </Text>
      )}
      <VisuallyHidden role="status">
        {state === 'idle' ? '' : `${outcomes[state]} ${text}`}
      </VisuallyHidden>
    </Inline>
  );
};
