import { Heading, Stack, Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { type FC, Suspense } from 'react';

import { FootprintFactorsForm } from '../../components/footprint-factors-form/footprint-factors-form';
import { MachineSettingsForm } from '../../components/machine-settings-form/machine-settings-form';
import { PageLoading } from '../../components/page-loading/page-loading';
import { appSettings } from '../../settings/app-settings';
import { appTickets } from '../../tickets/app-tickets';

export const metadata: Metadata = { title: 'Settings' };

const MachineSettingsSection: FC = async () => {
  await connection();
  return (
    <MachineSettingsForm settings={appTickets('user').getMachineSettings()} />
  );
};

const FootprintSection: FC = async () => {
  await connection();
  return <FootprintFactorsForm factors={appSettings().getFootprintFactors()} />;
};

// The settings read the database at request time, so the form streams in
// behind a Suspense boundary (Cache Components).
const SettingsPage: FC = () => (
  <Stack gap={6}>
    <Stack gap={1}>
      <Heading level={1}>Settings</Heading>
      <Text tag="p" fontSize="small" color="muted">
        Settings for the whole machine. Only you can set these; Agents cannot
        read or change them.
      </Text>
    </Stack>
    <Stack gap={3}>
      <Heading level={2}>Limits</Heading>
      <Suspense fallback={<PageLoading />}>
        <MachineSettingsSection />
      </Suspense>
    </Stack>
    <Stack gap={3}>
      <Heading level={2}>Footprint</Heading>
      <Suspense fallback={<PageLoading />}>
        <FootprintSection />
      </Suspense>
    </Stack>
  </Stack>
);

export default SettingsPage;
