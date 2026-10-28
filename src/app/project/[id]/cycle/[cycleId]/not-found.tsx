import { Heading, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

const CycleNotFound: FC = () => (
  <Stack gap={2}>
    <Heading level={1}>Cycle not found</Heading>
    <Text tag="p" color="muted">
      There is no Cycle at this address. It may have been discarded.
    </Text>
  </Stack>
);

export default CycleNotFound;
