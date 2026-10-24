import type { Metadata } from 'next';
import type { FC } from 'react';

import { CycleHistory } from '../../../../components/cycle-history/cycle-history';
import { appTickets } from '../../../../tickets/app-tickets';
import { ProjectFrame } from '../project-board';
import { loadProject, type ProjectPageProps } from '../project-data';

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const project = await loadProject(params);
  return { title: `History · ${project.name}` };
}

/** A Project's History tab: its archived Cycles. */
const CyclesPage: FC<ProjectPageProps> = async ({ params }) => {
  const project = await loadProject(params);
  return (
    <ProjectFrame project={project} current="history">
      <CycleHistory cycles={appTickets().listCycles(project.id)} />
    </ProjectFrame>
  );
};

export default CyclesPage;
