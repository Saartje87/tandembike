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
  children: ReactNode;
};

/**
 * A History page of a Project, which is not a Board: its header with its
 * tabs, the History tab current, above `children`.
 */
export const ProjectFrame: FC<ProjectFrameProps> = ({
  project,
  cycles,
  children,
}) => (
  <Stack gap={4}>
    <ProjectHeader project={project}>
      <ProjectTabs projectId={project.id} cycles={cycles} current="history" />
    </ProjectHeader>
    {children}
  </Stack>
);
