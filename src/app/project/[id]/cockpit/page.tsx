import { redirect } from 'next/navigation';
import type { FC } from 'react';

import { appTickets } from '../../../../tickets/app-tickets';
import { cyclePath, projectPath } from '../../../lib/paths';
import { loadProject, type ProjectPageProps } from '../project-data';

/**
 * The retired address of the Project's one-column view, which was once a tab
 * of its own (see _Avoid_ under Board in `GLOSSARY.md`). Old links still land
 * on the Active Cycle's Board, or on the Backlog's when there is no Active
 * Cycle.
 */
const RetiredCockpitAddress: FC<ProjectPageProps> = async ({ params }) => {
  const project = await loadProject(params);
  const active = appTickets('user').activeCycle(project.id);
  redirect(active ? cyclePath(project.id, active.id) : projectPath(project.id));
};

export default RetiredCockpitAddress;
