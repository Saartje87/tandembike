'use client';

import { Box, Heading, Inline, Stack } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import { projectSettingsSectionPath } from '../../app/lib/paths';
import type { Project } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { Icon } from '../icon/icon';
import { tintBackground } from '../palette/palette.css';
import { ProjectIcon } from '../project-icon/project-icon';

export type ProjectHeaderProps = {
  project: Project;
  /** Shown under the name, inside the band: the Project's tabs. */
  children?: ReactNode;
};

/**
 * A Project's header above each of its tabs: its icon and name, a link to
 * its Settings, where they are edited (ADR 0053), and `children`, on a soft
 * band of its colour when it has one. Its padding does not depend on the
 * colour.
 */
export const ProjectHeader: FC<ProjectHeaderProps> = ({
  project,
  children,
}) => (
  <Box
    asChild
    borderRadius={3}
    paddingBlock={2}
    paddingInline={3}
    className={project.color ? tintBackground[project.color] : undefined}
  >
    <section aria-label={project.name} data-color={project.color ?? undefined}>
      <Stack gap={4}>
        <Inline gap={2} alignY="center" flexWrap="nowrap">
          <ProjectIcon project={project} />
          <Heading level={1}>{project.name}</Heading>
          <AppLink
            href={projectSettingsSectionPath(project.id, 'general')}
            aria-label="Project settings"
            title="Project settings"
          >
            <Icon name="cog-6-tooth" size="small" />
          </AppLink>
        </Inline>
        {children}
      </Stack>
    </section>
  </Box>
);
