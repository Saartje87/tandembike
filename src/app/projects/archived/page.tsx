import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { FC } from 'react';

import { ArchivedProjectDirectory } from '../../../components/archived-project-directory/archived-project-directory';
import { appTickets } from '../../../tickets/app-tickets';

export const metadata: Metadata = { title: 'Archived Projects' };

async function loadProjects() {
  await connection();
  return appTickets().listProjects();
}

// Unawaited, as on the Projects page, so the read suspends inside the list.
const ArchivedProjectsPage: FC = () => (
  <ArchivedProjectDirectory projects={loadProjects()} />
);

export default ArchivedProjectsPage;
