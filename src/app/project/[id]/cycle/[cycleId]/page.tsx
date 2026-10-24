import type { Metadata } from 'next';
import type { FC } from 'react';

import { ProjectBoard } from '../../project-board';
import { type CyclePageProps, loadProjectCycle } from '../../project-data';

export async function generateMetadata({
  params,
}: CyclePageProps): Promise<Metadata> {
  const { project, cycle } = await loadProjectCycle(params);
  return { title: `${cycle.title} · ${project.name}` };
}

/** One of a Project's Cycles, as a tab of the Project. */
const CyclePage: FC<CyclePageProps> = async ({ params }) => {
  const { project, cycle } = await loadProjectCycle(params);
  return <ProjectBoard project={project} tab={cycle} />;
};

export default CyclePage;
