'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, type FC, type ReactNode, use } from 'react';

import {
  type BoardFilter,
  boardFilterOf,
  conversationOnBoardPath,
} from '../../app/lib/paths';

/**
 * What the title fields of a Project's Board may do with an Agent:
 * - `default`: Enter creates through a Conversation, Mod+Enter plainly.
 * - `optional`: Enter creates plainly, Mod+Enter through a Conversation.
 */
export type ProjectAgentMode = 'default' | 'optional';

type ProjectAgentValue = {
  mode: ProjectAgentMode;
  /** Opens a Conversation in its drawer over the Board on screen. */
  openConversation: (id: number, fromTicket?: number) => void;
};

const ProjectAgentContext = createContext<ProjectAgentValue | null>(null);

/** The Agent options of the Board around the caller; `null` without any. */
export const useProjectAgent = (): ProjectAgentValue | null =>
  use(ProjectAgentContext);

export type ProjectAgentProviderProps = {
  mode: ProjectAgentMode;
  children: ReactNode;
};

/**
 * Tells the title fields below it that the Project has a repository path
 * and how Enter behaves (T588, T592), and how to open a Conversation over
 * the Board on screen, keeping its filter.
 */
export const ProjectAgentProvider: FC<ProjectAgentProviderProps> = ({
  mode,
  children,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const filter: BoardFilter = boardFilterOf(
    search.get('q') ?? undefined,
    search.getAll('label'),
  );
  const openConversation = (id: number, fromTicket?: number) => {
    router.push(conversationOnBoardPath(pathname, id, filter, fromTicket), {
      scroll: false,
    });
  };
  return (
    <ProjectAgentContext value={{ mode, openConversation }}>
      {children}
    </ProjectAgentContext>
  );
};
