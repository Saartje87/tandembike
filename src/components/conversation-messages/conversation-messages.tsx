'use client';

import { Stack } from '@blockle/blocks';
import { type FC, useEffect, useRef } from 'react';

import type { TranscriptEntry } from '../../conversations/conversations';
import { ConversationMessage } from '../conversation-message/conversation-message';
import * as styles from './conversation-messages.css';

export type ConversationMessagesProps = { transcript: TranscriptEntry[] };

/**
 * The scrolling message list of the chat. It scrolls to the newest message
 * when one arrives.
 */
export const ConversationMessages: FC<ConversationMessagesProps> = ({
  transcript,
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const newest = transcript.at(-1)?.id;

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new newest message is the trigger to scroll.
  useEffect(() => {
    const element = scroller.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [newest]);

  return (
    <div ref={scroller} className={styles.scroller}>
      <Stack gap={2} listStyle="none" role="list" asChild>
        <ul aria-label="Transcript">
          {transcript.map((entry) => (
            <ConversationMessage key={entry.id} entry={entry} />
          ))}
        </ul>
      </Stack>
    </div>
  );
};
