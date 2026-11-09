import { Box, Heading, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, Suspense, use } from 'react';

import { cyclePath, projectPath } from '../../app/lib/paths';
import type { StageRunStats } from '../../conversations/conversations';
import { runResults } from '../../conversations/run-outcome';
import type { ProjectStats, Stats, StatsTotal } from '../../tickets/stats';
import { AppLink } from '../app-link/app-link';
import { ProjectIcon } from '../project-icon/project-icon';
import * as styles from './stats-overview.css';

/** Each Project's run stats per Stage, by Project id. */
export type RunStatsByProject = Record<number, StageRunStats[]>;

export type StatsOverviewProps = {
  stats: Promise<Stats>;
  runStats: Promise<RunStatsByProject>;
};

type StatsTableProps = StatsOverviewProps;

type RunStatsTableProps = {
  stages: StageRunStats[];
};

const resultLabels = {
  completed: 'Completed',
  pr_open: 'PR open',
  needs_reply: 'Needs reply',
  abandoned: 'Abandoned',
  stopped: 'Stopped',
  failed_transient: 'Failed, transient',
  failed: 'Failed',
} as const;

const stageLabels = {
  start: 'Start',
  triage: 'Triage',
  ask: 'Ask',
  new_ticket: 'New Ticket',
  setup: 'Setup',
  retro: 'Retro',
  merge: 'Merge',
  spec: 'Spec',
  plan: 'Plan',
} as const;

const dollars = (usd: number) => `$${usd.toFixed(2)}`;

/** A duration in whole minutes and seconds, such as `3m 20s`. */
const duration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

/** One row per Stage with runs in the last 30 days. */
const RunStatsTable: FC<RunStatsTableProps> = ({ stages }) => (
  <Box overflowInline="auto">
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col" className={styles.startCell}>
            Stage
          </th>
          <th scope="col">Runs</th>
          {runResults.map((result) => (
            <th key={result} scope="col">
              {resultLabels[result]}
            </th>
          ))}
          <th scope="col">Total cost</th>
          <th scope="col">Mean cost</th>
          <th scope="col">Mean duration</th>
        </tr>
      </thead>
      <tbody>
        {stages.map((stage) => (
          <tr key={stage.stage}>
            <th scope="row" className={styles.startCell}>
              {stageLabels[stage.stage]}
            </th>
            <td>{stage.runs}</td>
            {runResults.map((result) => (
              <td key={result}>{stage.results[result]}</td>
            ))}
            <td>{dollars(stage.totalCostUsd)}</td>
            <td>{dollars(stage.meanCostUsd)}</td>
            <td>{duration(stage.meanDurationMs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </Box>
);

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
const StatsTable: FC<StatsTableProps> = ({
  stats: pending,
  runStats: pendingRunStats,
}) => {
  const { projects, total } = use(pending);
  const runStats = use(pendingRunStats);

  if (projects.length === 0) {
    return (
      <Text tag="p" color="muted">
        No Projects yet.
      </Text>
    );
  }

  return (
    <Stack gap={6}>
      {/* A wide table scrolls on its own on a narrow screen, not the page. */}
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
              <td className={styles.startCell}>{total.activeCycles} active</td>
              <td>{total.doneLast7Days}</td>
            </tr>
          </tfoot>
        </table>
      </Box>
      {projects.map(({ project }) =>
        (runStats[project.id] ?? []).length === 0 ? null : (
          <Stack key={project.id} gap={2}>
            <Heading level={2}>{project.name}: runs, last 30 days</Heading>
            <RunStatsTable stages={runStats[project.id]} />
          </Stack>
        ),
      )}
    </Stack>
  );
};

/**
 * The Stats page (see `GLOSSARY.md`): every non-archived Project's figures
 * side by side, with a Total row. The Total's Active Cycle cell counts the
 * Projects with one, since each Cycle has its own goal.
 */
export const StatsOverview: FC<StatsOverviewProps> = ({ stats, runStats }) => (
  <Stack gap={4}>
    <Heading level={1}>Stats</Heading>
    <Suspense fallback={null}>
      <StatsTable stats={stats} runStats={runStats} />
    </Suspense>
  </Stack>
);
