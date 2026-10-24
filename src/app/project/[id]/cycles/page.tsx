import type { Metadata } from 'next';
import type { FC } from 'react';

import { CycleHistory } from '../../../../components/cycle-history/cycle-history';
import { ProjectFrame } from '../../../../components/project-frame/project-frame';
import { appTickets } from '../../../../tickets/app-tickets';
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
  const cycles = appTickets().listCycles(project.id);
  return (
    <ProjectFrame project={project} cycles={cycles}>
      <CycleHistory cycles={cycles} />
    </ProjectFrame>
  );
};

export default CyclesPage;
