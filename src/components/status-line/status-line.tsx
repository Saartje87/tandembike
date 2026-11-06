'use client';

import { Inline, Text, Tooltip } from '@blockle/blocks';
import type { FC } from 'react';

import type { LiveConversation } from '../../conversations/conversation-activity';
import { formatElapsed } from './format-elapsed';
import * as styles from './status-line.css';
import { useNow } from './use-now';

export type StatusLineProps = {
  /** The live Conversation whose latest line and run start it shows. */
  live: Pick<LiveConversation, 'line' | 'since'>;
};

/**
 * One line saying what a live Conversation is doing now, cut to the width of
 * its card with the full text as a tooltip, and how long the run has been
 * going, which counts on once a minute.
 */
export const StatusLine: FC<StatusLineProps> = ({ live }) => {
  const now = useNow();

  return (
    <Inline gap={2} alignY="center" flexWrap="nowrap">
      {/* Tooltip ignores a className, so the shrinkable class is on the Text. */}
      <Tooltip content={live.line}>
        <Text truncate fontSize="xsmall" color="muted" className={styles.line}>
          {live.line}
        </Text>
      </Tooltip>
      <Text fontSize="xsmall" color="muted" className={styles.elapsed}>
        {formatElapsed(now - new Date(live.since).getTime())}
      </Text>
    </Inline>
  );
};
