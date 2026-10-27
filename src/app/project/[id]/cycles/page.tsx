import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { CycleHistory } from '../../../../components/cycle-history/cycle-history';
import { PageLoading } from '../../../../components/page-loading/page-loading';
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
  return <CycleHistory cycles={appTickets('user').listCycles(project.id)} />;
}

/**
 * A Project's History tab: its archived Cycles, under the Project's layout.
 * It streams in behind its own boundary, as the Backlog tab does.
 */
const CyclesPage: FC<ProjectPageProps> = ({ params }) => (
  <Suspense fallback={<PageLoading />}>{historyTab(params)}</Suspense>
);

export default CyclesPage;
