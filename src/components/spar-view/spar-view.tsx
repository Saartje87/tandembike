'use client';

import { Button, Inline, Stack } from '@blockle/blocks';
import { type FC, type ReactNode, useState } from 'react';

import { sendSparTurn } from '../../app/spars/actions';
import { ConversationChat } from '../conversation-chat/conversation-chat';
import type { ConversationWithTranscript } from '../conversation-labels/conversation-labels';
import { SparTurnBar } from '../spar-turn-bar/spar-turn-bar';
import * as styles from './spar-view.css';

export type SparViewProps = {
  sparId: number;
  /** The Spar's Conversation and its transcript. */
  item: ConversationWithTranscript;
  /** What the chat header says the Spar is about. */
  title: string;
  /** The Canvas, in the side region. */
  canvas: ReactNode;
  /** The Write-up, below the Canvas. */
  writeUp: ReactNode;
  /** A closed Spar: the chat takes no replies. */
  closed?: boolean;
};

type Region = 'chat' | 'canvas' | 'writeUp';

const regionNames: Record<Region, string> = {
  chat: 'Chat',
  canvas: 'Canvas',
  writeUp: 'Write-up',
};

/**
 * A Spar's page (GLOSSARY: Spar): the chat on the left, the Canvas with the
 * Write-up below it on the right. At narrow widths it is one column, and a
 * switcher shows the Chat, the Canvas or the Write-up.
 */
export const SparView: FC<SparViewProps> = ({
  sparId,
  item,
  title,
  canvas,
  writeUp,
  closed = false,
}) => {
  const [shown, setShown] = useState<Region>('chat');
  const shownFlag = (region: Region) => String(shown === region);

  return (
    <Stack gap={3}>
      <Inline
        gap={1}
        className={styles.switcher}
        role="group"
        aria-label="Show"
      >
        {(Object.keys(regionNames) as Region[]).map((region) => (
          <Button
            key={region}
            type="button"
            size="small"
            variant={shown === region ? 'solid' : 'ghost'}
            aria-pressed={shown === region}
            onClick={() => setShown(region)}
          >
            {regionNames[region]}
          </Button>
        ))}
      </Inline>
      <div className={styles.layout}>
        <section
          aria-label="Chat"
          className={`${styles.region} ${styles.chat}`}
          data-shown={shownFlag('chat')}
        >
          <ConversationChat
            item={item}
            title={title}
            // Every message carries what changed on the Canvas.
            onReply={(text) => sendSparTurn({ sparId, text })}
            beforeReply={<SparTurnBar sparId={sparId} />}
            {...(closed
              ? { closedReason: 'This Spar is closed. Reopen it to reply.' }
              : {})}
          />
        </section>
        <Stack gap={4}>
          <section
            aria-label="Canvas"
            className={styles.region}
            data-shown={shownFlag('canvas')}
          >
            {canvas}
          </section>
          <section
            aria-label="Write-up"
            className={styles.region}
            data-shown={shownFlag('writeUp')}
          >
            {writeUp}
          </section>
        </Stack>
      </div>
    </Stack>
  );
};
