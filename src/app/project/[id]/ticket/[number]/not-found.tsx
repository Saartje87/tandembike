import { Heading, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

const TicketNotFound: FC = () => (
  <Stack gap={2}>
    <Heading level={1}>Ticket not found</Heading>
    <Text tag="p" color="text-600">
      There is no Ticket in this Project with this number. Check the link and
      try again.
    </Text>
  </Stack>
);

export default TicketNotFound;
