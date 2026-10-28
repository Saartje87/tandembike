import { Heading, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

const ProjectNotFound: FC = () => (
  <Stack gap={2}>
    <Heading level={1}>Project not found</Heading>
    <Text tag="p" color="muted">
      There is no Project at this address. Pick one from the menu.
    </Text>
  </Stack>
);

export default ProjectNotFound;
