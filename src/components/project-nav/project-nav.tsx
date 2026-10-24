'use client';

import { Box, Heading, Stack, Text } from '@blockle/blocks';
import { usePathname } from 'next/navigation';
import type { FC } from 'react';

import { projectIdFromPath, projectPath } from '../../app/lib/paths';
import type { Project } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { NewProjectDialog } from '../new-project-dialog/new-project-dialog';

export type ProjectNavProps = {
  projects: Project[];
};

export const ProjectNav: FC<ProjectNavProps> = ({ projects }) => {
  const currentId = projectIdFromPath(usePathname());

  return (
    <Box asChild padding={4}>
      <nav aria-labelledby="project-nav-heading">
        <Stack gap={4}>
          <Heading id="project-nav-heading" level={2} fontSize="medium">
            Projects
          </Heading>
          {projects.length > 0 ? (
            <Stack tag="ul" gap={2}>
              {projects.map((project) => (
                <li key={project.id}>
                  <AppLink
                    href={projectPath(project.id)}
                    variant="inherit"
                    aria-current={project.id === currentId ? 'page' : undefined}
                  >
                    {project.name}
                  </AppLink>
                </li>
              ))}
            </Stack>
          ) : (
            <Text tag="p" color="text-600" fontSize="small">
              No Projects yet.
            </Text>
          )}
          <NewProjectDialog />
        </Stack>
      </nav>
    </Box>
  );
};
