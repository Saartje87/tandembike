import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { FC } from 'react';

import { StatsOverview } from '../../components/stats-overview/stats-overview';
import { appTickets } from '../../tickets/app-tickets';

export const metadata: Metadata = { title: 'Stats' };

async function loadStats() {
  await connection();
  return appTickets('user').getStats();
}

// The promise is passed down unawaited so the uncached read suspends inside
// StatsOverview's boundary instead of the page itself (Cache Components).
// `LiveUpdates` refetches the page on every change, which keeps it current.
const StatsPage: FC = () => <StatsOverview stats={loadStats()} />;

export default StatsPage;
