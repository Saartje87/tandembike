import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import type { ProjectStats, Stats } from '../../tickets/stats';
import { StatsOverview } from './stats-overview';

const renderStats = (stats: Stats) =>
  act(async () => {
    renderWithTheme(<StatsOverview stats={Promise.resolve(stats)} />);
  });

const projectStats = (
  id: number,
  name: string,
  figures: Partial<ProjectStats> = {},
): ProjectStats => ({
  project: {
    id,
    name,
    color: null,
    icon: null,
    archived: false,
    createdAt: new Date('2026-01-01'),
  },
  todo: 0,
  inProgress: 0,
  blocked: 0,
  claimed: 0,
  activeCycle: null,
  doneLast7Days: 0,
  ...figures,
});

const stats: Stats = {
  projects: [
    projectStats(1, 'Website', {
      todo: 4,
      inProgress: 2,
      blocked: 1,
      claimed: 3,
      activeCycle: { id: 7, title: 'Launch', done: 5, total: 8 },
      doneLast7Days: 6,
    }),
    projectStats(2, 'API'),
  ],
  total: {
    todo: 4,
    inProgress: 2,
    blocked: 1,
    claimed: 3,
    doneLast7Days: 6,
    activeCycles: 1,
  },
};

/** The text of each cell in the row headed `name`, after its header. */
const cellsOf = (name: string) => {
  const header = screen.getByRole('rowheader', { name });
  const row = header.closest('tr');
  if (!row) {
    throw new Error(`No row for ${name}`);
  }
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);
};

describe('StatsOverview', () => {
  it('heads the page Stats and labels each column', async () => {
    await renderStats(stats);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Stats' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual([
      'Project',
      'Todo',
      'In progress',
      'Blocked',
      'Claimed',
      'Active Cycle',
      'Done, last 7 days',
    ]);
  });

  it("shows each Project's figures, linking to its Board", async () => {
    await renderStats(stats);

    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute(
      'href',
      '/project/1',
    );
    expect(cellsOf('Website')).toEqual(['4', '2', '1', '3', 'Launch 5/8', '6']);
  });

  it('links the Active Cycle to its Board', async () => {
    await renderStats(stats);

    expect(screen.getByRole('link', { name: 'Launch' })).toHaveAttribute(
      'href',
      '/project/1/cycle/7',
    );
  });

  it('shows a dash for a Project without an Active Cycle', async () => {
    await renderStats(stats);

    expect(cellsOf('API')).toEqual(['0', '0', '0', '0', '—', '0']);
  });

  it('ends with a Total row counting the Active Cycles', async () => {
    await renderStats(stats);

    expect(cellsOf('Total')).toEqual(['4', '2', '1', '3', '1 active', '6']);
  });

  it('says so when there are no Projects', async () => {
    await renderStats({ projects: [], total: stats.total });

    expect(screen.getByText('No Projects yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
