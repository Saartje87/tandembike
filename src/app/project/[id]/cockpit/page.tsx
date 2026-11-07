import { Heading, Stack, Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import { type FC, Suspense } from 'react';

import { AppLink } from '../../../../components/app-link/app-link';
import { Cockpit } from '../../../../components/cockpit/cockpit';
import { PageLoading } from '../../../../components/page-loading/page-loading';
import { ProjectAgentProvider } from '../../../../components/project-agent/project-agent';
import { TicketDrawerShell } from '../../../../components/ticket-drawer-shell/ticket-drawer-shell';
import { appConversations } from '../../../../conversations/app-conversations';
import { startRunLimit } from '../../../../conversations/conversations';
import { appTickets } from '../../../../tickets/app-tickets';
import type { Cycle } from '../../../../tickets/cycles';
import { modeColors } from '../../../lib/mode-colors';
import { cockpitPath, cyclePath, openTicketNumber } from '../../../lib/paths';
import { BoardTicketDrawer } from '../board-ticket-drawer/board-ticket-drawer';
import { loadProject, type ProjectPageProps } from '../project-data';

type CockpitPageProps = ProjectPageProps & {
  /** `?ticket=` opens a Ticket in a drawer over the Cockpit (ADR 0013). */
  searchParams: Promise<{ ticket?: string | string[] }>;
};

export async function generateMetadata({
  params,
}: CockpitPageProps): Promise<Metadata> {
  const project = await loadProject(params);
  return { title: `Cockpit · ${project.name}` };
}

/** The Project's Start runs working now, and how many it allows at once. */
function runSlotsOf(projectId: number) {
  const used = appConversations()
    .list({ projectId })
    .filter(
      ({ intent, state }) =>
        intent === 'start' && (state === 'running' || state === 'waiting'),
    ).length;
  const cap = startRunLimit(
    appTickets('user').getProjectAgentSettings(projectId),
  );
  return { used, cap };
}

type NoActiveCycleProps = { projectId: number; prepared: Cycle[] };

/** Why the Cockpit is empty, and where to start a Cycle. */
const NoActiveCycle: FC<NoActiveCycleProps> = ({ projectId, prepared }) => (
  <Stack
    gap={3}
    alignX="center"
    padding={6}
    borderRadius={3}
    backgroundColor={modeColors.sunken}
  >
    <Heading level={2}>No Active Cycle</Heading>
    <Text tag="p" color="muted" textAlign="center">
      The Cockpit shows the Active Cycle: what needs you and how its work is
      going.
    </Text>
    {prepared.length === 0 ? (
      <Text tag="p" color="muted">
        Add one with New Cycle, then start it from its Board.
      </Text>
    ) : (
      <Stack gap={1} alignX="center">
        <Text tag="p" color="muted">
          Start a Cycle from its Board:
        </Text>
        {prepared.map((cycle) => (
          <AppLink key={cycle.id} href={cyclePath(projectId, cycle.id)}>
            {cycle.title}
          </AppLink>
        ))}
      </Stack>
    )}
  </Stack>
);

async function cockpitTab(
  params: CockpitPageProps['params'],
  searchParams: CockpitPageProps['searchParams'],
) {
  const project = await loadProject(params);
  const openTicket = openTicketNumber((await searchParams).ticket);
  const tickets = appTickets('user');
  const cycles = tickets.listCycles(project.id);
  const active = cycles.find(({ state }) => state === 'Active');
  if (!active) {
    return (
      <NoActiveCycle
        projectId={project.id}
        prepared={cycles.filter(({ state }) => state === 'Prepared')}
      />
    );
  }
  const cockpit = (
    <>
      <Cockpit
        projectId={project.id}
        cycle={active}
        tickets={tickets.listTickets({
          projectId: project.id,
          cycleId: active.id,
        })}
        backlog={tickets.listTickets({ projectId: project.id, cycleId: null })}
        runSlots={runSlotsOf(project.id)}
      />
      {openTicket !== undefined && (
        <TicketDrawerShell
          number={openTicket}
          boardPath={cockpitPath(project.id)}
        >
          <BoardTicketDrawer projectId={project.id} number={openTicket} />
        </TicketDrawerShell>
      )}
    </>
  );
  // As on the Board, a drawer's title fields may create through an Agent.
  const settings = tickets.getProjectAgentSettings(project.id);
  return settings.repositoryPath === null ? (
    cockpit
  ) : (
    <ProjectAgentProvider mode={settings.agentMode ? 'default' : 'optional'}>
      {cockpit}
    </ProjectAgentProvider>
  );
}

/**
 * A Project's Cockpit tab: its Active Cycle by what needs the User, under
 * the Project's layout, with the Ticket `?ticket=` opens in a drawer over
 * it. It streams in behind its own boundary, as the Board tabs do.
 */
const CockpitPage: FC<CockpitPageProps> = ({ params, searchParams }) => (
  <Suspense fallback={<PageLoading />}>
    {cockpitTab(params, searchParams)}
  </Suspense>
);

export default CockpitPage;
