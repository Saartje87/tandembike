import { describe, expect, it, vi } from 'vitest';

import { appConversations } from '../conversations/app-conversations';
import { appSettings } from '../settings/app-settings';
import { createTestConversations } from '../test/conversations';
import { createTestSettings } from '../test/settings';
import { appTickets } from '../tickets/app-tickets';
import {
  conversationFootprint,
  cycleFootprint,
  projectFootprints,
} from './app-footprint';

vi.mock('../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../settings/app-settings', () => ({ appSettings: vi.fn() }));

const opusOutput = (output: number) => ({
  'claude-opus-5-5': { input: 0, output, cacheWrite: 0, cacheRead: 0 },
});

function setup() {
  const world = createTestConversations();
  vi.mocked(appConversations).mockReturnValue(world.conversations);
  vi.mocked(appTickets).mockReturnValue(world.tickets);
  const settings = createTestSettings();
  vi.mocked(appSettings).mockReturnValue(settings);
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
  });
  return { ...world, project, settings };
}

describe('projectFootprints (T1177)', () => {
  it('is null for a Project without Conversations', () => {
    const { project } = setup();

    expect(projectFootprints(project.id)).toBeNull();
  });

  it('gives the total and the Cycles with Conversations, newest first, with the default factors', async () => {
    const { conversations, tickets, runner, project } = setup();
    const older = tickets.createCycle({
      projectId: project.id,
      title: 'Older',
    });
    tickets.createCycle({ projectId: project.id, title: 'Empty' });
    const newer = tickets.createCycle({
      projectId: project.id,
      title: 'Newer',
    });
    for (const [cycle, output] of [
      [older, 1_000_000],
      [newer, 2_000_000],
    ] as const) {
      const ticket = tickets.createTicket({
        projectId: project.id,
        title: cycle.title,
        cycleId: cycle.id,
      });
      await conversations.start({
        startedBy: 'user',
        ticketNumber: ticket.number,
        intent: 'start',
        prompt: 'Go',
      });
      runner.runs[runner.runs.length - 1].emit({
        type: 'turn',
        cost: 0.1,
        usage: opusOutput(output),
      });
    }

    expect(projectFootprints(project.id)).toMatchObject({
      total: { footprint: { energyWh: 3000 }, notMeasured: 0 },
      cycles: [
        { cycle: { title: 'Newer' }, footprint: { energyWh: 2000 } },
        { cycle: { title: 'Older' }, footprint: { energyWh: 1000 } },
      ],
    });
  });
});

describe('conversationFootprint (T1178)', () => {
  it('uses the factors saved in Settings, for past Conversations too', async () => {
    const { conversations, runner, project, settings } = setup();
    const { id } = await conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
    runner.runs[0].emit({
      type: 'turn',
      cost: 0.1,
      usage: opusOutput(1_000_000),
    });
    expect(conversationFootprint(id)).toMatchObject({ energyWh: 1000 });

    settings.setFootprintFactors({
      opusWhPerMillion: 40,
      gridGramsPerKwh: 100,
    });

    expect(conversationFootprint(id)).toMatchObject({
      energyWh: 40,
      co2eG: 4,
    });
  });
});

describe('cycleFootprint (T1348)', () => {
  it('is null for a Cycle without Conversations', () => {
    const { tickets, project } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });

    expect(cycleFootprint(project.id, cycle.id)).toBeNull();
  });

  it('is not measured when its Conversations recorded no tokens', async () => {
    const { conversations, tickets, project } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix',
      cycleId: cycle.id,
    });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });

    expect(cycleFootprint(project.id, cycle.id)).toEqual({ measured: false });
  });

  it('counts hand-started and Autopilot Conversations alike, as the Stats per-Cycle figure does', async () => {
    const { conversations, tickets, runner, project } = setup();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'A' });
    for (const [startedBy, output] of [
      ['user', 1_000_000],
      ['autopilot', 2_000_000],
    ] as const) {
      const ticket = tickets.createTicket({
        projectId: project.id,
        title: startedBy,
        cycleId: cycle.id,
      });
      await conversations.start({
        startedBy,
        ticketNumber: ticket.number,
        intent: 'start',
        prompt: 'Go',
        ...(startedBy === 'autopilot' ? { cycleId: cycle.id } : {}),
      });
      runner.runs[runner.runs.length - 1].emit({
        type: 'turn',
        cost: 0.1,
        usage: opusOutput(output),
      });
    }

    const footprint = cycleFootprint(project.id, cycle.id);
    expect(footprint).toMatchObject({ measured: true, energyWh: 3000 });
    expect(footprint).toEqual(
      projectFootprints(project.id)?.cycles[0].footprint,
    );
  });
});
