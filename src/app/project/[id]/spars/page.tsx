import { Stack } from '@blockle/blocks';
import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { PageLoading } from '../../../../components/page-loading/page-loading';
import { SparButton } from '../../../../components/spar-button/spar-button';
import { SparList } from '../../../../components/spar-list/spar-list';
import { appSpars } from '../../../../spars/app-spars';
import { appTickets } from '../../../../tickets/app-tickets';
import { loadProject, type ProjectPageProps } from '../project-data';

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const project = await loadProject(params);
  return { title: `Spars · ${project.name}` };
}

async function sparsTab(params: ProjectPageProps['params']) {
  const project = await loadProject(params);
  const canRun =
    appTickets('user').getProjectAgentSettings(project.id).repositoryPath !==
    null;
  return (
    <Stack gap={3}>
      {canRun && <SparButton projectId={project.id} />}
      <SparList spars={appSpars().listSpars(project.id)} />
    </Stack>
  );
}

/**
 * A Project's Spars tab: the Spar button and its Spars, each linking to its
 * own page. It streams in behind its own boundary, as the other tabs do.
 */
const SparsPage: FC<ProjectPageProps> = ({ params }) => (
  <Suspense fallback={<PageLoading />}>{sparsTab(params)}</Suspense>
);

export default SparsPage;
