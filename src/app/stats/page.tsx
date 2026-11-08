import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { FC } from 'react';

import { StatsOverview } from '../../components/stats-overview/stats-overview';
import { appConversations } from '../../conversations/app-conversations';
import { appTickets } from '../../tickets/app-tickets';

export const metadata: Metadata = { title: 'Stats' };

async function loadStats() {
  await connection();
  return appTickets('user').getStats();
}

/** Each Project's per-Stage run stats, by Project id. */
async function loadRunStats(stats: ReturnType<typeof loadStats>) {
  const { projects } = await stats;
  const conversations = appConversations();
  return Object.fromEntries(
    projects.map(({ project }) => [
      project.id,
      conversations.runStats(project.id),
    ]),
  );
}

// The promise is passed down unawaited so the uncached read suspends inside
// StatsOverview's boundary instead of the page itself (Cache Components).
// `LiveUpdates` refetches the page on every change, which keeps it current.
const StatsPage: FC = () => {
  const stats = loadStats();
  return <StatsOverview stats={stats} runStats={loadRunStats(stats)} />;
};

export default StatsPage;
