import { Heading, Stack, Text } from '@blockle/blocks';
import { type FC, Suspense, use } from 'react';

import { projectPath } from '../../app/lib/paths';
import type { Project } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { NewProjectDialog } from '../new-project-dialog/new-project-dialog';

export type ProjectDirectoryProps = {
  projects: Promise<Project[]>;
};

type ProjectListProps = ProjectDirectoryProps;

const ProjectList: FC<ProjectListProps> = ({ projects: pending }) => {
  const projects = use(pending);

  return projects.length > 0 ? (
    <Stack tag="ul" gap={2} aria-label="Projects">
      {projects.map((project) => (
        <li key={project.id}>
          <AppLink href={projectPath(project.id)} variant="inherit">
            {project.name}
          </AppLink>
        </li>
      ))}
    </Stack>
  ) : (
    <Text tag="p" color="text-600">
      No Projects yet.
    </Text>
  );
};

export const ProjectDirectory: FC<ProjectDirectoryProps> = ({ projects }) => (
  <Stack gap={4}>
    <Heading level={1}>Projects</Heading>
    <Suspense fallback={null}>
      <ProjectList projects={projects} />
    </Suspense>
    <NewProjectDialog />
  </Stack>
);
