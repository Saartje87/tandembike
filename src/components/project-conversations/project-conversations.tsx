'use client';

import { Button, Popover, Stack, Text } from '@blockle/blocks';
import { usePathname, useSearchParams } from 'next/navigation';
import { type FC, useRef, useState } from 'react';

import {
  boardFilterOf,
  conversationOnBoardPath,
  projectPath,
} from '../../app/lib/paths';
import type {
  ConversationIntent,
  ConversationState,
} from '../../conversations/conversation-state';
import { AppLink } from '../app-link/app-link';
import {
  intentNames,
  stateNames,
} from '../ticket-conversations/ticket-conversations';

export type ProjectConversationItem = {
  id: number;
  intent: ConversationIntent;
  state: ConversationState;
  /** The User's first message. */
  title: string;
};

export type ProjectConversationsProps = {
  projectId: number;
  /** The Project's open Conversations, newest first. */
  items: ProjectConversationItem[];
};

/** The Board on screen: the Backlog or a Cycle tab, else the Backlog. */
const boardPathOfPathname = (pathname: string, projectId: number): string =>
  new RegExp(`^${projectPath(projectId)}(/cycle/\\d+)?$`).test(pathname)
    ? pathname
    : projectPath(projectId);

/**
 * The Conversations button in a Project's header: the count of its open
 * Conversations (those about no Ticket that the User has not closed), and a
 * list that opens one over the Board on screen.
 */
export const ProjectConversations: FC<ProjectConversationsProps> = ({
  projectId,
  items,
}) => {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();
  const onBoard = boardPathOfPathname(pathname, projectId);
  const filter =
    onBoard === pathname
      ? boardFilterOf(search.get('q') ?? undefined, search.getAll('label'))
      : undefined;
  const label =
    items.length === 0 ? 'Conversations' : `Conversations (${items.length})`;

  return (
    <>
      <Button
        ref={anchor}
        type="button"
        variant="ghost"
        size="small"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </Button>
      <Popover
        anchorElement={anchor}
        open={open}
        placement="bottom-end"
        onRequestClose={() => setOpen(false)}
        role="dialog"
        aria-label="Conversations"
      >
        <Stack gap={2} padding={3}>
          {items.length === 0 ? (
            <Text color="muted">No open Conversations.</Text>
          ) : (
            <Stack gap={1} listStyle="none" role="list" asChild>
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <AppLink
                      href={conversationOnBoardPath(onBoard, item.id, filter)}
                      scroll={false}
                      onClick={() => setOpen(false)}
                    >
                      {`${item.title} · ${intentNames[item.intent]}, ${stateNames[item.state]}`}
                    </AppLink>
                  </li>
                ))}
              </ul>
            </Stack>
          )}
        </Stack>
      </Popover>
    </>
  );
};
