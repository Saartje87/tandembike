import { Heading, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, Suspense, use } from 'react';

import { projectPath } from '../../app/lib/paths';
import type { Project } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { RestoreProjectButton } from '../restore-project-button/restore-project-button';

export type ArchivedProjectDirectoryProps = {
  /** Every Project; only the archived ones are listed. */
  projects: Promise<Project[]>;
};

type ArchivedProjectListProps = ArchivedProjectDirectoryProps;

const ArchivedProjectList: FC<ArchivedProjectListProps> = ({
  projects: pending,
}) => {
  const archived = use(pending).filter((project) => project.archived);

  return archived.length > 0 ? (
    <Stack tag="ul" gap={2} aria-label="Archived Projects">
      {archived.map((project) => (
        <li key={project.id}>
          <Inline gap={3} alignY="center">
            <AppLink href={projectPath(project.id)} variant="inherit">
              {project.name}
            </AppLink>
            <RestoreProjectButton project={project} />
          </Inline>
        </li>
      ))}
    </Stack>
  ) : (
    <Text tag="p" color="muted">
      No archived Projects.
    </Text>
  );
};

/** The archived Projects, oldest first, each with Restore. */
export const ArchivedProjectDirectory: FC<ArchivedProjectDirectoryProps> = ({
  projects,
}) => (
  <Stack gap={4}>
    <Heading level={1}>Archived Projects</Heading>
    <Suspense fallback={null}>
      <ArchivedProjectList projects={projects} />
    </Suspense>
  </Stack>
);
