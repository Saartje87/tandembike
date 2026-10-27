import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { ArchivedProjectNotice } from '../../../../components/archived-project-notice/archived-project-notice';
import { CycleHistory } from '../../../../components/cycle-history/cycle-history';
import { PageLoading } from '../../../../components/page-loading/page-loading';
import { ProjectFrame } from '../../../../components/project-frame/project-frame';
import { appTickets } from '../../../../tickets/app-tickets';
import { loadProject, type ProjectPageProps } from '../project-data';

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const project = await loadProject(params);
  return { title: `History · ${project.name}` };
}

async function historyTab(params: ProjectPageProps['params']) {
  const project = await loadProject(params);
  if (project.archived) {
    return <ArchivedProjectNotice project={project} />;
  }
  const cycles = appTickets('user').listCycles(project.id);
  return (
    <ProjectFrame project={project} cycles={cycles} current="history">
      <CycleHistory cycles={cycles} />
    </ProjectFrame>
  );
}

/**
 * A Project's History tab: its archived Cycles. It streams in behind its own
 * boundary, as the Backlog tab does.
 */
const CyclesPage: FC<ProjectPageProps> = ({ params }) => (
  <Suspense fallback={<PageLoading />}>{historyTab(params)}</Suspense>
);

export default CyclesPage;
