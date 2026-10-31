import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { PageLoading } from '../../../../../components/page-loading/page-loading';
import { boardFilterOf, openTicketNumber } from '../../../../lib/paths';
import { ProjectBoard } from '../../project-board/project-board';
import {
  boardPageTitle,
  type CyclePageProps,
  loadProjectCycle,
  openedConversation,
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

async function cycleTab(
  params: CyclePageProps['params'],
  searchParams: CyclePageProps['searchParams'],
) {
  const { project, cycle } = await loadProjectCycle(params);
  const { ticket, conversation, from, q, label } = await searchParams;
  return (
    <ProjectBoard
      project={project}
      tab={cycle}
      openTicket={openTicketNumber(ticket)}
      {...openedConversation(conversation, from)}
      filter={boardFilterOf(q, label)}
    />
  );
}

/**
 * One of a Project's Cycles, as a tab of the Project, with the Ticket
 * `?ticket=` opens in a drawer. It streams in behind its own boundary, as
 * the Backlog tab does.
 */
const CyclePage: FC<CyclePageProps> = ({ params, searchParams }) => (
  <Suspense fallback={<PageLoading />}>
    {cycleTab(params, searchParams)}
  </Suspense>
);

export default CyclePage;
