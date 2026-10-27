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
 * streams in behind its own boundary (Cache Components, T221), under the
 * Project's layout, which keeps the header and tabs on screen (T239).
 */
const ProjectPage: FC<BacklogPageProps> = ({ params, searchParams }) => (
  <Suspense fallback={<PageLoading />}>
    {backlogTab(params, searchParams)}
  </Suspense>
);

export default ProjectPage;
