import { Heading, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

const TicketNotFound: FC = () => (
  <Stack gap={2}>
    <Heading level={1}>Ticket not found</Heading>
    <Text tag="p" color="text-600">
      There is no Ticket with this number. Check the link, or pick a Project
      from the menu.
    </Text>
  </Stack>
);

export default TicketNotFound;
