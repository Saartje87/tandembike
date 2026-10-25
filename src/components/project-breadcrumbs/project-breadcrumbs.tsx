import { connection } from 'next/server';
import type { FC } from 'react';

import { projectsPath } from '../../app/lib/paths';
import { appTickets } from '../../tickets/app-tickets';
import { NotFoundError } from '../../tickets/errors';
import { Breadcrumbs } from '../breadcrumbs/breadcrumbs';
import { ProjectIcon } from '../project-icon/project-icon';

export type ProjectBreadcrumbsProps = {
  params: Promise<{ id: string }>;
};

/**
 * The trail to a Project's Board, for its Board and Ticket routes. An unknown
 * Project shows no trail; the page itself shows not-found.
 */
export const ProjectBreadcrumbs: FC<ProjectBreadcrumbsProps> = async ({
  params,
}) => {
  await connection();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) {
    return null;
  }
  try {
    const project = appTickets().getProject(id);
    return (
      <Breadcrumbs
        ancestors={[{ label: 'Projects', href: projectsPath() }]}
        current={project.name}
        currentIcon={<ProjectIcon project={project} size="small" />}
      />
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
};
