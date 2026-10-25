import type { Metadata } from 'next';
import type { FC } from 'react';

import { openTicketNumber } from '../../lib/paths';
import { ProjectBoard } from './project-board/project-board';
import {
  type BacklogPageProps,
  boardPageTitle,
  loadProject,
} from './project-data';

export async function generateMetadata({
  params,
  searchParams,
}: BacklogPageProps): Promise<Metadata> {
  const project = await loadProject(params);
  return {
    title: await boardPageTitle(project.name, project.id, searchParams),
  };
}

/** A Project's Backlog tab, with the Ticket `?ticket=` opens in a drawer. */
const ProjectPage: FC<BacklogPageProps> = async ({ params, searchParams }) => {
  const project = await loadProject(params);
  return (
    <ProjectBoard
      project={project}
      tab="backlog"
      openTicket={openTicketNumber((await searchParams).ticket)}
    />
  );
};

export default ProjectPage;
