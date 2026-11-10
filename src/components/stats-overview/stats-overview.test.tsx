import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import type { ProjectStats, Stats } from '../../tickets/stats';
import {
  type FootprintsByProject,
  type RunStatsByProject,
  StatsOverview,
} from './stats-overview';

const renderStats = (
  stats: Stats,
  runStats: RunStatsByProject = {},
  footprints: FootprintsByProject = {},
) =>
  act(async () => {
    renderWithTheme(
      <StatsOverview
        stats={Promise.resolve(stats)}
        runStats={Promise.resolve(runStats)}
        footprints={Promise.resolve(footprints)}
      />,
    );
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

  it("shows each Stage's runs, results, cost and duration under its Project", async () => {
    await renderStats(stats, {
      1: [
        {
          stage: 'start',
          runs: 4,
          results: {
            completed: 2,
            pr_open: 1,
            needs_reply: 0,
            abandoned: 0,
            stopped: 0,
            failed_transient: 1,
            failed: 0,
          },
          totalCostUsd: 10,
          meanCostUsd: 2.5,
          meanDurationMs: 200_000,
        },
      ],
    });

    expect(
      screen.getByRole('heading', { level: 2, name: /Website/ }),
    ).toBeInTheDocument();
    expect(cellsOf('Start')).toEqual([
      '4',
      '2',
      '1',
      '0',
      '0',
      '0',
      '1',
      '0',
      '$10.00',
      '$2.50',
      '3m 20s',
    ]);
  });

  it('shows no run table for a Project without runs', async () => {
    await renderStats(stats, { 2: [] });

    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  describe('Footprint (T1177)', () => {
    const measured = (energyWh: number, co2eG: number) => ({
      measured: true as const,
      energyWh,
      co2eG,
      phoneCharges: 0,
      carKm: 0,
    });

    it("shows each Project's total and each Cycle's, as estimates, with the Conversations not measured", async () => {
      await renderStats(
        stats,
        {},
        {
          1: {
            total: { footprint: measured(2500, 1190), notMeasured: 3 },
            cycles: [
              {
                cycle: { id: 7, title: 'Launch' },
                footprint: measured(12, 5.7),
                notMeasured: 0,
              },
            ],
          },
        },
      );

      const section = screen.getByRole('table', { name: 'Website: Footprint' });
      expect(
        within(section)
          .getAllByRole('row')
          .map((row) => row.textContent),
      ).toEqual([
        'FootprintNot measured',
        'All time~2.5 kWh · ~1.2 kg CO₂e est.3',
        'Launch~12 Wh · ~5.7 g CO₂e est.',
      ]);
      expect(
        within(section).getByRole('link', { name: 'Launch' }),
      ).toHaveAttribute('href', '/project/1/cycle/7');
    });

    it('shows a dash for a total with nothing measured', async () => {
      await renderStats(
        stats,
        {},
        {
          1: {
            total: { footprint: { measured: false }, notMeasured: 2 },
            cycles: [],
          },
        },
      );

      expect(cellsOf('All time')).toEqual(['—', '2']);
    });

    it('shows no Footprint for a Project without Conversations', async () => {
      await renderStats(stats);

      expect(
        screen.queryByRole('table', { name: /Footprint/ }),
      ).not.toBeInTheDocument();
    });
  });
});
