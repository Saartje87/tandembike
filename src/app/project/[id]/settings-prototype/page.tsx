import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { PageLoading } from '../../../../components/page-loading/page-loading';
import { SettingsPrototype } from './settings-prototype';

// PROTOTYPE (T1431): throwaway route for Epic T1430. Delete once the User has
// picked a layout. Fake data, no server wiring.
export const metadata: Metadata = { title: 'Settings prototype' };

const SettingsPrototypePage: FC = () => (
  <Suspense fallback={<PageLoading />}>
    <SettingsPrototype />
  </Suspense>
);

export default SettingsPrototypePage;
