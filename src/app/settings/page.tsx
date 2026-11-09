import { Heading, Stack, Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { type FC, Suspense } from 'react';

import { MachineSettingsForm } from '../../components/machine-settings-form/machine-settings-form';
import { PageLoading } from '../../components/page-loading/page-loading';
import { appTickets } from '../../tickets/app-tickets';

export const metadata: Metadata = { title: 'Settings' };

const MachineSettings: FC = async () => {
  await connection();
  return (
    <MachineSettingsForm settings={appTickets('user').getMachineSettings()} />
  );
};

// The settings read the database at request time, so the form streams in
// behind a Suspense boundary (Cache Components).
const SettingsPage: FC = () => (
  <Stack gap={4}>
    <Stack gap={1}>
      <Heading level={1}>Settings</Heading>
      <Text tag="p" fontSize="small" color="muted">
        Limits for the whole machine. Only you can set these; Agents cannot read
        or change them.
      </Text>
    </Stack>
    <Suspense fallback={<PageLoading />}>
      <MachineSettings />
    </Suspense>
  </Stack>
);

export default SettingsPage;
