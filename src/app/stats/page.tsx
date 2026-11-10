import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { FC } from 'react';

import { StatsOverview } from '../../components/stats-overview/stats-overview';
import { appConversations } from '../../conversations/app-conversations';
import { projectFootprints } from '../../footprint/app-footprint';
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

/** Each Project's total Footprint, all time and per Cycle, by Project id (ADR 0050). */
async function loadFootprints(stats: ReturnType<typeof loadStats>) {
  const { projects } = await stats;
  return Object.fromEntries(
    projects.flatMap(({ project }) => {
      const footprints = projectFootprints(project.id);
      return footprints ? [[project.id, footprints]] : [];
    }),
  );
}

// The promise is passed down unawaited so the uncached read suspends inside
// StatsOverview's boundary instead of the page itself (Cache Components).
// `LiveUpdates` refetches the page on every change, which keeps it current.
const StatsPage: FC = () => {
  const stats = loadStats();
  return (
    <StatsOverview
      stats={stats}
      runStats={loadRunStats(stats)}
      footprints={loadFootprints(stats)}
    />
  );
};

export default StatsPage;
