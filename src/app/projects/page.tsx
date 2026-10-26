import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { FC } from 'react';

import { ProjectDirectory } from '../../components/project-directory/project-directory';
import { appTickets } from '../../tickets/app-tickets';

export const metadata: Metadata = { title: 'Projects' };

async function loadProjects() {
  await connection();
  return appTickets('user').listProjects();
}

// The promise is passed down unawaited so the uncached read suspends inside
// ProjectDirectory's boundary instead of the page itself (Cache Components).
const ProjectsPage: FC = () => <ProjectDirectory projects={loadProjects()} />;

export default ProjectsPage;
