import type { Metadata } from 'next';
import type { FC } from 'react';

import { ProjectBoard } from './project-board';
import { loadProject, type ProjectPageProps } from './project-data';

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const project = await loadProject(params);
  return { title: project.name };
}

/** A Project's Backlog tab. */
const ProjectPage: FC<ProjectPageProps> = async ({ params }) => {
  const project = await loadProject(params);
  return <ProjectBoard project={project} tab="backlog" />;
};

export default ProjectPage;
