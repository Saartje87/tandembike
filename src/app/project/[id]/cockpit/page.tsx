import { redirect } from 'next/navigation';
import type { FC } from 'react';

import { appTickets } from '../../../../tickets/app-tickets';
import { cyclePath, projectPath } from '../../../lib/paths';
import { loadProject, type ProjectPageProps } from '../project-data';

/**
 * The Cockpit tab's old address: the Active Cycle's Board is the Cockpit
 * now, so it redirects there, or to the Backlog when there is no Active
 * Cycle.
 */
const CockpitPage: FC<ProjectPageProps> = async ({ params }) => {
  const project = await loadProject(params);
  const active = appTickets('user')
    .listCycles(project.id)
    .find(({ state }) => state === 'Active');
  redirect(active ? cyclePath(project.id, active.id) : projectPath(project.id));
};

export default CockpitPage;
