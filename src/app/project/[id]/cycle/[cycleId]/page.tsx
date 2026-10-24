import type { Metadata } from 'next';
import type { FC } from 'react';

import { Board } from '../../../../../components/board/board';
import { CycleHeader } from '../../../../../components/cycle-header/cycle-header';
import { ProjectTabs } from '../../../../../components/project-tabs/project-tabs';
import { appTickets } from '../../../../../tickets/app-tickets';
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
  return (
    <Board
      project={project}
      tickets={[]}
      header={
        <>
          <ProjectTabs
            projectId={project.id}
            cycles={appTickets().listCycles(project.id)}
            current={cycle.id}
          />
          <CycleHeader key={cycle.id} cycle={cycle} />
        </>
      }
    />
  );
};

export default CyclePage;
