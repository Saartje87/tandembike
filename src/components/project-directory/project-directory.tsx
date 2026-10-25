import { Heading, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, Suspense, use } from 'react';

import { archivedProjectsPath, projectPath } from '../../app/lib/paths';
import type { Project } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { ArchiveProjectButton } from '../archive-project-button/archive-project-button';
import { NewProjectDialog } from '../new-project-dialog/new-project-dialog';
import { ProjectIcon } from '../project-icon/project-icon';

export type ProjectDirectoryProps = {
  projects: Promise<Project[]>;
};

type ProjectListProps = ProjectDirectoryProps;

/** The active Projects, each with Archive, and a link to the archived ones. */
const ProjectList: FC<ProjectListProps> = ({ projects: pending }) => {
  const projects = use(pending);
  const active = projects.filter((project) => !project.archived);
  const archivedCount = projects.length - active.length;

  return (
    <Stack gap={4}>
      {active.length > 0 ? (
        <Stack tag="ul" gap={2} aria-label="Projects">
          {active.map((project) => (
            <li key={project.id}>
              <Inline gap={3} alignY="center">
                <AppLink href={projectPath(project.id)} variant="inherit">
                  <Inline gap={2} alignY="center" flexWrap="nowrap">
                    <ProjectIcon project={project} size="small" />
                    {project.name}
                  </Inline>
                </AppLink>
                <ArchiveProjectButton project={project} />
              </Inline>
            </li>
          ))}
        </Stack>
      ) : (
        <Text tag="p" color="text-600">
          No Projects yet.
        </Text>
      )}
      {archivedCount > 0 && (
        <AppLink href={archivedProjectsPath()}>
          Archived Projects ({archivedCount})
        </AppLink>
      )}
    </Stack>
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
