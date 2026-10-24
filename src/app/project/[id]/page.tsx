import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { FC } from 'react';

import { Board } from '../../../components/board/board';
import { appTickets } from '../../../tickets/app-tickets';
import { NotFoundError } from '../../../tickets/errors';

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

/** The Project for the `[id]` segment, or the not-found page. */
async function loadProject(params: ProjectPageProps['params']) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) {
    notFound();
  }
  try {
    return appTickets().getProject(id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const project = await loadProject(params);
  return { title: project.name };
}

const ProjectPage: FC<ProjectPageProps> = async ({ params }) => {
  const project = await loadProject(params);
  const tickets = appTickets().listTickets({
    projectId: project.id,
    includeArchived: true,
  });
  return <Board project={project} tickets={tickets} />;
};

export default ProjectPage;
