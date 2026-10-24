import { Stack } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import type { Cycle } from '../../tickets/cycles';
import type { Project } from '../../tickets/tickets';
import { ProjectTabs } from '../project-tabs/project-tabs';
import { RenameProjectInlineEdit } from '../rename-project-inline-edit/rename-project-inline-edit';

export type ProjectFrameProps = {
  project: Project;
  /** The Project's Cycles, for its tabs. */
  cycles: Cycle[];
  children: ReactNode;
};

/**
 * A History page of a Project, which is not a Board: its name and tabs,
 * with the History tab current, above `children`.
 */
export const ProjectFrame: FC<ProjectFrameProps> = ({
  project,
  cycles,
  children,
}) => (
  <Stack gap={4}>
    <RenameProjectInlineEdit key={project.id} project={project} />
    <ProjectTabs projectId={project.id} cycles={cycles} current="history" />
    {children}
  </Stack>
);
