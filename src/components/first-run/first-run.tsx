import { Heading, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { NewProjectForm } from '../new-project-form/new-project-form';

export const FirstRun: FC = () => (
  <section aria-labelledby="first-run-heading">
    <Stack gap={4}>
      <Stack gap={2}>
        <Heading id="first-run-heading" level={1}>
          Create your first Project
        </Heading>
        <Text tag="p" color="text-600">
          A Project groups related Tickets. Give it a name to get started.
        </Text>
      </Stack>
      <NewProjectForm />
    </Stack>
  </section>
);
