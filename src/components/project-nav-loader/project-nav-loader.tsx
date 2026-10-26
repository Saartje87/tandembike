import { connection } from 'next/server';
import type { FC } from 'react';

import { appTickets } from '../../tickets/app-tickets';
import { ProjectNav } from '../project-nav/project-nav';

/** Loads the Projects at request time for the side navigation. */
export const ProjectNavLoader: FC = async () => {
  await connection();
  return <ProjectNav projects={appTickets('user').listProjects()} />;
};
