import { Box, Heading, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, Suspense, use } from 'react';

import { cyclePath, projectPath } from '../../app/lib/paths';
import type { ProjectStats, Stats, StatsTotal } from '../../tickets/stats';
import { AppLink } from '../app-link/app-link';
import { ProjectIcon } from '../project-icon/project-icon';
import * as styles from './stats-overview.css';

export type StatsOverviewProps = {
  stats: Promise<Stats>;
};

type StatsTableProps = StatsOverviewProps;

type CountCellsProps = {
  counts: Pick<StatsTotal, 'todo' | 'inProgress' | 'blocked' | 'claimed'>;
};

type ActiveCycleCellProps = Pick<ProjectStats, 'activeCycle'> & {
  projectId: number;
};

const CountCells: FC<CountCellsProps> = ({ counts }) => (
  <>
    <td>{counts.todo}</td>
    <td>{counts.inProgress}</td>
    <td>{counts.blocked}</td>
    <td>{counts.claimed}</td>
  </>
);

/** The Active Cycle's name, linking to its Board, and its Done/total. */
const ActiveCycleCell: FC<ActiveCycleCellProps> = ({
  projectId,
  activeCycle,
}) => (
  <td className={styles.startCell}>
    {activeCycle ? (
      <>
        <AppLink href={cyclePath(projectId, activeCycle.id)}>
          {activeCycle.title}
        </AppLink>{' '}
        <Text color="muted">
          {activeCycle.done}/{activeCycle.total}
        </Text>
      </>
    ) : (
      <Text color="muted">—</Text>
    )}
  </td>
);

/** One row per Project, then a Total row; or a note when there are none. */
const StatsTable: FC<StatsTableProps> = ({ stats: pending }) => {
  const { projects, total } = use(pending);

  if (projects.length === 0) {
    return (
      <Text tag="p" color="muted">
        No Projects yet.
      </Text>
    );
  }

  return (
    // A wide table scrolls on its own on a narrow screen, not the page.
    <Box overflowInline="auto">
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.startCell}>
              Project
            </th>
            <th scope="col">Todo</th>
            <th scope="col">In progress</th>
            <th scope="col">Blocked</th>
            <th scope="col">Claimed</th>
            <th scope="col" className={styles.startCell}>
              Active Cycle
            </th>
            <th scope="col">Done, last 7 days</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(
            ({ project, activeCycle, doneLast7Days, ...counts }) => (
              <tr key={project.id}>
                <th scope="row" className={styles.startCell}>
                  <AppLink href={projectPath(project.id)} intent="inherit">
                    <Inline gap={2} alignY="center" flexWrap="nowrap">
                      <ProjectIcon project={project} size="small" />
                      {project.name}
                    </Inline>
                  </AppLink>
                </th>
                <CountCells counts={counts} />
                <ActiveCycleCell
                  projectId={project.id}
                  activeCycle={activeCycle}
                />
                <td>{doneLast7Days}</td>
              </tr>
            ),
          )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={styles.startCell}>
              Total
            </th>
            <CountCells counts={total} />
            <td>{total.activeCycles} active</td>
            <td>{total.doneLast7Days}</td>
          </tr>
        </tfoot>
      </table>
    </Box>
  );
};

/**
 * The Stats page (see `GLOSSARY.md`): every non-archived Project's figures
 * side by side, with a Total row. The Total's Active Cycle cell counts the
 * Projects with one, since each Cycle has its own goal.
 */
export const StatsOverview: FC<StatsOverviewProps> = ({ stats }) => (
  <Stack gap={4}>
    <Heading level={1}>Stats</Heading>
    <Suspense fallback={null}>
      <StatsTable stats={stats} />
    </Suspense>
  </Stack>
);
