import { connection } from 'next/server';
import type { FC } from 'react';

import { ConversationDrawer } from '../../../../components/conversation-drawer/conversation-drawer';
import { appConversations } from '../../../../conversations/app-conversations';
import { NotFoundError } from '../../../../tickets/errors';
import {
  type BoardFilter,
  filteredBoardPath,
  noBoardFilter,
  ticketOnBoardPath,
} from '../../../lib/paths';

export type BoardConversationDrawerProps = {
  /** The Project whose Board it opens over. */
  projectId: number;
  id: number;
  /** The Board's own URL, without its filter. */
  boardPath: string;
  /** The Board's filter, kept when closing. */
  filter?: BoardFilter;
  /** The Epic whose drawer it replaced, for a link back. */
  fromTicket?: number;
};

/**
 * The drawer of the Conversation a Board's `?conversation=` opens (T592),
 * with its transcript. A Conversation that does not exist, or belongs to
 * another Project, shows nothing.
 */
export const BoardConversationDrawer: FC<
  BoardConversationDrawerProps
> = async ({
  projectId,
  id,
  boardPath,
  filter = noBoardFilter,
  fromTicket,
}) => {
  // Request-time data, so it streams after the Board inside its Suspense.
  await connection();
  const conversations = appConversations();
  try {
    const conversation = conversations.get(id);
    if (conversation.projectId !== projectId) {
      return null;
    }
    return (
      <ConversationDrawer
        item={{ conversation, transcript: conversations.transcript(id) }}
        boardPath={filteredBoardPath(boardPath, filter)}
        {...(fromTicket === undefined
          ? {}
          : {
              backTo: {
                number: fromTicket,
                href: ticketOnBoardPath(boardPath, fromTicket, filter),
              },
            })}
      />
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
};
