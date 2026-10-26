import { Stack } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import type { Cycle } from '../../tickets/cycles';
import type { Project } from '../../tickets/tickets';
import { ProjectHeader } from '../project-header/project-header';
import { ProjectTabs } from '../project-tabs/project-tabs';

export type ProjectFrameProps = {
  project: Project;
  /** The Project's Cycles, for its tabs. */
  cycles: Cycle[];
  /** The tab on screen. */
  current: 'history' | 'settings';
  children: ReactNode;
};

/**
 * A page of a Project that is not a Board, its History or its Settings:
 * its header with its tabs, `current` marked, above `children`.
 */
export const ProjectFrame: FC<ProjectFrameProps> = ({
  project,
  cycles,
  current,
  children,
}) => (
  <Stack gap={4}>
    <ProjectHeader project={project}>
      <ProjectTabs projectId={project.id} cycles={cycles} current={current} />
    </ProjectHeader>
    {children}
  </Stack>
);
