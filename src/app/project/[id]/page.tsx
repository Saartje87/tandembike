import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { PageLoading } from '../../../components/page-loading/page-loading';
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

async function backlogTab(
  params: BacklogPageProps['params'],
  searchParams: BacklogPageProps['searchParams'],
) {
  const project = await loadProject(params);
  return (
    <ProjectBoard
      project={project}
      tab="backlog"
      openTicket={openTicketNumber((await searchParams).ticket)}
    />
  );
}

/**
 * A Project's Backlog tab, with the Ticket `?ticket=` opens in a drawer. It
 * streams in behind its own boundary: `loading.tsx` is already on screen when
 * switching from another of the Project's tabs (Cache Components, T221).
 */
const ProjectPage: FC<BacklogPageProps> = ({ params, searchParams }) => (
  <Suspense fallback={<PageLoading />}>
    {backlogTab(params, searchParams)}
  </Suspense>
);

export default ProjectPage;
