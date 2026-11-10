'use client';

import { Stack } from '@blockle/blocks';
import { type FC, useEffect, useRef } from 'react';

import type { TranscriptEntry } from '../../conversations/conversations';
import { ConversationMessage } from '../conversation-message/conversation-message';
import { ConversationToolSteps } from '../conversation-tool-steps/conversation-tool-steps';
import * as styles from './conversation-messages.css';

export type ConversationMessagesProps = { transcript: TranscriptEntry[] };

/** An entry of the chat: one message, or a run of consecutive tool calls. */
type ChatItem =
  | { kind: 'message'; entry: TranscriptEntry }
  | { kind: 'tools'; steps: TranscriptEntry[] };

/**
 * Groups each run of consecutive tool entries into one item (T1386); any
 * other entry ends a run and stands alone.
 */
function chatItems(transcript: TranscriptEntry[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const entry of transcript) {
    const last = items.at(-1);
    if (entry.role !== 'tool') {
      items.push({ kind: 'message', entry });
    } else if (last?.kind === 'tools') {
      last.steps.push(entry);
    } else {
      items.push({ kind: 'tools', steps: [entry] });
    }
  }
  return items;
}

/**
 * The scrolling message list of the chat, centred in its reading column while
 * the scroller spans the chat. Consecutive tool calls show as one group. It scrolls to the newest message when one
 * arrives.
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
        <ul aria-label="Transcript" className={styles.list}>
          {chatItems(transcript).map((item) =>
            item.kind === 'message' ? (
              <ConversationMessage key={item.entry.id} entry={item.entry} />
            ) : (
              // Keyed by its first step, so an open group stays open as
              // steps are appended to it.
              <ConversationToolSteps
                key={item.steps[0].id}
                steps={item.steps}
              />
            ),
          )}
        </ul>
      </Stack>
    </div>
  );
};
