import type { Metadata } from 'next';
import type { FC } from 'react';

import { Board } from '../../../components/board/board';
import { ProjectTabs } from '../../../components/project-tabs/project-tabs';
import { appTickets } from '../../../tickets/app-tickets';
import { loadProject, type ProjectPageProps } from './project-data';

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const project = await loadProject(params);
  return { title: project.name };
}

/** A Project's Backlog tab. */
const ProjectPage: FC<ProjectPageProps> = async ({ params }) => {
  const project = await loadProject(params);
  const tickets = appTickets();
  return (
    <Board
      project={project}
      tickets={tickets.listTickets({
        projectId: project.id,
        includeArchived: true,
      })}
      header={
        <ProjectTabs
          projectId={project.id}
          cycles={tickets.listCycles(project.id)}
          current="backlog"
        />
      }
    />
  );
};

export default ProjectPage;
