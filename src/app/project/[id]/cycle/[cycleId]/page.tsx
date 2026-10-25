import type { Metadata } from 'next';
import type { FC } from 'react';

import { openTicketNumber } from '../../../../lib/paths';
import { ProjectBoard } from '../../project-board/project-board';
import {
  boardPageTitle,
  type CyclePageProps,
  loadProjectCycle,
} from '../../project-data';

export async function generateMetadata({
  params,
  searchParams,
}: CyclePageProps): Promise<Metadata> {
  const { project, cycle } = await loadProjectCycle(params);
  return {
    title: await boardPageTitle(
      `${cycle.title} · ${project.name}`,
      project.id,
      searchParams,
    ),
  };
}

/**
 * One of a Project's Cycles, as a tab of the Project, with the Ticket
 * `?ticket=` opens in a drawer.
 */
const CyclePage: FC<CyclePageProps> = async ({ params, searchParams }) => {
  const { project, cycle } = await loadProjectCycle(params);
  return (
    <ProjectBoard
      project={project}
      tab={cycle}
      openTicket={openTicketNumber((await searchParams).ticket)}
    />
  );
};

export default CyclePage;
