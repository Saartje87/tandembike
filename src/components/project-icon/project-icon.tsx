'use client';

import { Box } from '@blockle/blocks';
import type { FC } from 'react';

import type { Project } from '../../tickets/tickets';
import { Icon, type IconName, type IconProps } from '../icon/icon';
import { strongColor } from '../palette/palette.css';

export type ProjectIconProps = {
  project: Pick<Project, 'color' | 'icon'>;
  size?: IconProps['size'];
};

/**
 * A Project's icon drawn in its colour's strong shade, or a folder, in the
 * surrounding text colour when it has no colour. Decorative.
 */
export const ProjectIcon: FC<ProjectIconProps> = ({ project, size }) => {
  // A Project icon is always one the app has an asset for.
  const name: IconName = project.icon ?? 'folder';

  return (
    <Box
      asChild
      display="inline-flex"
      className={project.color ? strongColor[project.color] : undefined}
    >
      <span data-color={project.color ?? undefined}>
        <Icon name={name} size={size} />
      </span>
    </Box>
  );
};
