'use client';

import { createContext, type FC, type ReactNode, use } from 'react';

/**
 * What the title fields of a Project's Board may do with an Agent:
 * - `default`: Enter creates through a Conversation, Mod+Enter plainly.
 * - `optional`: Enter creates plainly, Mod+Enter through a Conversation.
 */
export type ProjectAgentMode = 'default' | 'optional';

type ProjectAgentValue = {
  mode: ProjectAgentMode;
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
 * and how Enter behaves (T588, T592). A Conversation they start opens in the
 * Conversation dialog (T608).
 */
export const ProjectAgentProvider: FC<ProjectAgentProviderProps> = ({
  mode,
  children,
}) => <ProjectAgentContext value={{ mode }}>{children}</ProjectAgentContext>;
