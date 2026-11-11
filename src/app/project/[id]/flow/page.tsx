import { Inline, Stack, Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { appAutopilot } from '../../../../autopilot/app-autopilot';
import { CycleLoop } from '../../../../components/cycle-loop/cycle-loop';
import { FlowSection } from '../../../../components/flow-section/flow-section';
import { PageLoading } from '../../../../components/page-loading/page-loading';
import { PauseReasons } from '../../../../components/pause-reasons/pause-reasons';
import { ProjectSwitch } from '../../../../components/project-switch/project-switch';
import { SetupPanel } from '../../../../components/setup-panel/setup-panel';
import { TicketPath } from '../../../../components/ticket-path/ticket-path';
import { appConversations } from '../../../../conversations/app-conversations';
import { appTickets } from '../../../../tickets/app-tickets';
import { openCyclesInOrder } from '../../../../tickets/cycle-state';
import type { Cycle } from '../../../../tickets/cycles';
import {
  cyclePath,
  projectPath,
  projectSettingsFieldPath,
} from '../../../lib/paths';
import {
  loadProject,
  type ProjectPageProps,
  ticketPathOf,
} from '../project-data';

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const project = await loadProject(params);
  return { title: `Flow · ${project.name}` };
}

/** The start of today, local time: the Triage ceiling's day (ADR 0040). */
function startOfToday(): Date {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

async function flowTab(params: ProjectPageProps['params']) {
  const project = await loadProject(params);
  const explanation = appAutopilot().explain(project.id);
  const settings = appTickets('user').getProjectAgentSettings(project.id);
  const path = ticketPathOf(project.id);
  const cycleLink = (cycle: Cycle) => ({
    id: cycle.id,
    title: cycle.title,
    path: cyclePath(project.id, cycle.id),
  });
  const cycles = openCyclesInOrder(appTickets('user').listCycles(project.id));
  const active = appTickets('user').activeCycle(project.id);
  return (
    <Stack gap={6}>
      <Text tag="p">
        How this Project's factory runs: the path a Ticket takes from idea to
        Done, how a Cycle begins and ends, what this Project runs at each Stage,
        and why Autopilot is starting work now or not.
      </Text>
      <FlowSection
        id="ticket-path"
        title="Ticket path"
        intro="Every Ticket's route from New Ticket to Done, who acts at each step and how many Tickets are there now."
      >
        <TicketPath
          backlogPath={projectPath(project.id)}
          backlogIntake={path.backlogIntake}
          activeCycle={
            path.activeCycle && {
              path: cyclePath(project.id, path.activeCycle.id),
              counts: path.activeCycle.counts,
            }
          }
          autoMerge={settings.autoMerge}
        />
      </FlowSection>
      <FlowSection
        id="cycle-loop"
        title="Cycle loop"
        intro="How a Cycle is planned, started, worked by Autopilot and closed."
      >
        <CycleLoop
          backlogPath={projectPath(project.id)}
          prepared={cycles
            .filter(({ state }) => state === 'Prepared')
            .map(cycleLink)}
          active={active ? cycleLink(active) : null}
        />
      </FlowSection>
      <FlowSection
        id="setup"
        title="Setup"
        intro="What this Project runs at each Stage, and its limits. Change them on Settings."
      >
        <SetupPanel
          projectId={project.id}
          settings={settings}
          commands={appTickets('user').getProjectAgentCommands(project.id)}
          cycleSpendUsd={
            active
              ? appConversations().autopilotSpend({
                  projectId: project.id,
                  cycleId: active.id,
                  unit: 'usd',
                })
              : null
          }
          triageSpendUsd={appConversations().autopilotTriageSpend(
            project.id,
            startOfToday(),
          )}
        />
      </FlowSection>
      <FlowSection
        id="switches"
        title="Switches and Pause reasons"
        intro="Whether Autopilot and Auto-triage start work now, and every reason they do not."
      >
        <Inline gap={4} alignY="start">
          <ProjectSwitch
            projectId={project.id}
            setting="autopilot"
            checked={settings.autopilot}
            ceiling={{
              usd: settings.spendCeilingUsd,
              settingsHref: projectSettingsFieldPath(
                project.id,
                'spend-ceiling',
              ),
            }}
          />
          <ProjectSwitch
            projectId={project.id}
            setting="autoTriage"
            checked={settings.autoTriage}
            ceiling={{
              usd: settings.triageCeilingUsd,
              settingsHref: projectSettingsFieldPath(
                project.id,
                'triage-ceiling',
              ),
            }}
          />
        </Inline>
        <PauseReasons
          autopilot={explanation.autopilot}
          autoTriage={explanation.autoTriage}
        />
      </FlowSection>
    </Stack>
  );
}

/**
 * A Project's Flow tab (ADR 0044): how its factory runs, explained from the
 * same rules that run it. It streams in behind its own boundary, and the
 * page refreshes on every change, so it stays live.
 */
const FlowPage: FC<ProjectPageProps> = ({ params }) => (
  <Suspense fallback={<PageLoading />}>{flowTab(params)}</Suspense>
);

export default FlowPage;
