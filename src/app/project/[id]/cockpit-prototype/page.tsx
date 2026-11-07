// PROTOTYPE (T1103), throwaway route: /project/<id>/cockpit-prototype
// ?variant=A|B|C&scenario=busy|quiet|permission|over-ceiling|cycle-done|no-cycle
// Deleted by T1104.

import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { PageLoading } from '../../../../components/page-loading/page-loading';
import { CockpitPrototype } from './cockpit-prototype';

type CockpitPrototypePageProps = {
  searchParams: Promise<{ variant?: string; scenario?: string }>;
};

export const metadata: Metadata = { title: 'Cockpit prototype' };

async function prototype(
  searchParams: CockpitPrototypePageProps['searchParams'],
) {
  const { variant, scenario } = await searchParams;
  return <CockpitPrototype variant={variant} scenario={scenario} />;
}

const CockpitPrototypePage: FC<CockpitPrototypePageProps> = ({
  searchParams,
}) => <Suspense fallback={<PageLoading />}>{prototype(searchParams)}</Suspense>;

export default CockpitPrototypePage;
