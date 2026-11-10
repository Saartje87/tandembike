import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appAutopilot } from '../../../../autopilot/app-autopilot';
import type { AutopilotExplanation } from '../../../../autopilot/explanation';
import { appConversations } from '../../../../conversations/app-conversations';
import {
  renderPage,
  renderPageError,
  renderWithTheme,
} from '../../../../test/render';
import { createTestTickets } from '../../../../test/tickets';
import { appTickets } from '../../../../tickets/app-tickets';
import { setProjectAgentSettings } from '../../../projects/actions';
import FlowPage, { generateMetadata } from './page';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));
vi.mock('../../../projects/actions', () => ({
  setProjectAgentSettings: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../autopilot/app-autopilot', () => ({
  appAutopilot: vi.fn(),
}));
vi.mock('../../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));

const explaining = (explanation: Partial<AutopilotExplanation>) =>
  vi.mocked(appAutopilot).mockReturnValue({
    explain: () => ({
      autopilot: { state: 'running' },
      autoTriage: { state: 'running' },
      tickets: [],
      ...explanation,
    }),
  } as unknown as ReturnType<typeof appAutopilot>);

/** Renders Project `name`'s Flow page and returns its params. */
async function renderFlow(
  name = 'Website',
  arrange: (
    tickets: ReturnType<typeof createTestTickets>,
    projectId: number,
  ) => void = () => {},
) {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name });
  arrange(tickets, project.id);
  vi.mocked(appTickets).mockReturnValue(tickets);
  const params = Promise.resolve({ id: String(project.id) });
  await renderPage(<main>{await FlowPage({ params })}</main>);
  return { params, tickets, project };
}

describe('FlowPage', () => {
  beforeEach(() => {
    notFound.mockClear();
    vi.mocked(appConversations).mockReturnValue({
      list: () => [],
      activityRows: () => [],
      autopilotSpend: () => 0,
      autopilotTriageSpend: () => 0.5,
      triageBudget: () => null,
      spendBudget: () => null,
    } as unknown as ReturnType<typeof appConversations>);
    explaining({});
  });

  it('has a title and lays out its sections in a fixed order', async () => {
    const { params } = await renderFlow();

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Ticket path',
      'Cycle loop',
      'Setup',
      'Switches and Pause reasons',
    ]);
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: 'Flow · Website',
    });
  });

  it("counts the Ticket path's steps as the Board does, linking to their sections", async () => {
    const { project } = await renderFlow('Website', (tickets, projectId) => {
      tickets.createTicket({ projectId, title: 'Idea' });
      const cycle = tickets.createCycle({ projectId, title: 'Beta' });
      tickets.createTicket({
        projectId,
        title: 'Build',
        labels: ['ready-for-agent'],
        cycleId: cycle.id,
      });
      tickets.startCycle(cycle.id);
    });

    const link = (step: string) =>
      within(screen.getByRole('region', { name: step })).getByRole('link');
    expect(link('Intake')).toHaveTextContent('1 Ticket');
    expect(link('Intake')).toHaveAttribute(
      'href',
      `/project/${project.id}#intake`,
    );
    expect(link('Queued')).toHaveTextContent('1 Ticket');
    expect(link('Queued').getAttribute('href')).toMatch(
      new RegExp(`^/project/${project.id}/cycle/\\d+#queued$`),
    );
    expect(link('In flight')).toHaveTextContent('0 Tickets');
  });

  it("names the Project's Cycles in the Cycle loop", async () => {
    await renderFlow('Website', (tickets, projectId) => {
      const beta = tickets.createCycle({ projectId, title: 'Beta' });
      tickets.createCycle({ projectId, title: 'Launch' });
      tickets.startCycle(beta.id);
    });

    const loop = screen.getByRole('list', { name: 'Cycle loop' });
    expect(
      within(loop).getByRole('link', { name: 'Beta' }),
    ).toBeInTheDocument();
    expect(
      within(loop).getByRole('link', { name: 'Launch' }),
    ).toBeInTheDocument();
  });

  it("shows the Project's setup, linking each item to its field on Settings", async () => {
    const { project } = await renderFlow('Website', (tickets, projectId) =>
      tickets.setProjectAgentSettings(projectId, {
        checkCommand: 'npm run check',
      }),
    );

    const commands = screen.getByRole('list', { name: 'Commands' });
    expect(within(commands).getByText('npm run check')).toBeInTheDocument();
    expect(
      within(commands).getByRole('link', { name: 'Check command' }),
    ).toHaveAttribute('href', `/project/${project.id}/settings#check-command`);
    expect(
      within(screen.getByRole('list', { name: 'Ceilings' })).getByText(
        'None set · $0.50 spent today',
      ),
    ).toBeInTheDocument();
  });

  it('says Autopilot and Auto-triage are running', async () => {
    await renderFlow();

    expect(
      screen.getByText(
        'Running: Autopilot starts the next Eligible Ticket now.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Running: Auto-triage starts on the oldest Intake now.'),
    ).toBeInTheDocument();
  });

  it('lists every Pause reason in plain words', async () => {
    explaining({
      autopilot: {
        state: 'paused',
        reasons: [
          { type: 'switchedOff' },
          { type: 'noActiveCycle' },
          { type: 'overSpendCeiling', spendUsd: 12, ceilingUsd: 10 },
          { type: 'noFreeStartRunSlot', limit: 2 },
          { type: 'machineCapFull', cap: 3, waitingOnUser: 2 },
          { type: 'overMachineCeiling', spendUsd: 21, ceilingUsd: 20 },
        ],
      },
      autoTriage: {
        state: 'paused',
        reasons: [
          { type: 'noTriageCeiling' },
          { type: 'overTriageCeiling', spendUsd: 2, ceilingUsd: 1.5 },
          { type: 'triageRunWorking', conversationId: 4 },
        ],
      },
    });
    await renderFlow();

    const autopilot = screen.getByRole('region', { name: 'Autopilot' });
    expect(
      within(autopilot)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Autopilot is switched off.',
      'There is no Active Cycle: Autopilot only starts work planned into one.',
      "This Cycle's Autopilot spend, $12.00, has reached the Spend ceiling of $10.00.",
      'All 2 Start run slots are in use.',
      'The machine cap of 3 runs is full, across all Projects: 2 of its runs wait on you. Answer or close them to let Autopilot go on.',
      "Today's Autopilot spend across all Projects, $21.00, has reached the machine ceiling of $20.00.",
    ]);
    const triage = screen.getByRole('region', { name: 'Auto-triage' });
    expect(
      within(triage)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'No Triage ceiling is set, and Auto-triage needs one.',
      "Today's triage spend, $2.00, has reached the Triage ceiling of $1.50.",
      'A Triage run is already working; Auto-triage runs one at a time.',
    ]);
  });

  it("shows the Autopilot and Auto-triage switches as the Project's settings have them", async () => {
    await renderFlow('Website', (tickets, projectId) =>
      tickets.setProjectAgentSettings(projectId, {
        autopilot: true,
        spendCeilingUsd: 10,
      }),
    );

    expect(screen.getByRole('switch', { name: 'Autopilot' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Auto-triage' })).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'Set a Triage ceiling' }),
    ).toHaveAttribute(
      'href',
      expect.stringMatching(/\/settings#triage-ceiling$/),
    );
    expect(
      screen.queryByRole('link', { name: 'Set a Spend ceiling' }),
    ).not.toBeInTheDocument();
  });

  it('turns Autopilot on through the settings Server Action', async () => {
    vi.mocked(setProjectAgentSettings).mockResolvedValue({ ok: true });
    const { project } = await renderFlow('Website', (tickets, projectId) =>
      tickets.setProjectAgentSettings(projectId, { spendCeilingUsd: 10 }),
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Autopilot' }));

    expect(setProjectAgentSettings).toHaveBeenCalledWith({
      projectId: project.id,
      autopilot: true,
    });
  });

  it('shows the loading state until the Project loads', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    renderWithTheme(
      <main>{await FlowPage({ params: new Promise(() => {}) })}</main>,
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('returns not-found for a missing Project', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    await expect(
      renderPageError(
        <main>
          {await FlowPage({ params: Promise.resolve({ id: '999' }) })}
        </main>,
      ),
    ).resolves.toMatchObject({ message: 'NEXT_NOT_FOUND' });
  });
});
