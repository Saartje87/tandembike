import { Heading, Inline, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import type { Project } from '../../tickets/tickets';
import { RestoreProjectButton } from '../restore-project-button/restore-project-button';

export type ArchivedProjectNoticeProps = {
  project: Project;
};

/**
 * What an archived Project's pages show in place of its header, tabs and
 * their content: its name, that it is archived, and Restore.
 */
export const ArchivedProjectNotice: FC<ArchivedProjectNoticeProps> = ({
  project,
}) => (
  <Stack gap={4} alignX="start">
    <Inline gap={2} alignY="center">
      <Heading level={1}>{project.name}</Heading>
      <Text fontSize="small" fontWeight="strong" color="muted">
        Archived
      </Text>
    </Inline>
    <Text tag="p">
      Its Board and Tickets are hidden and read-only until you restore it.
    </Text>
    <RestoreProjectButton project={project} />
  </Stack>
);
