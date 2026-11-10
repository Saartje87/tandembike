// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { appConversations } from '../conversations/app-conversations';
import { createTestConversations } from '../test/conversations';
import { appTickets } from '../tickets/app-tickets';
import { projectFootprints } from './app-footprint';

vi.mock('../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../tickets/app-tickets', () => ({ appTickets: vi.fn() }));

const opusOutput = (output: number) => ({
  'claude-opus-5-5': { input: 0, output, cacheWrite: 0, cacheRead: 0 },
});

function setup() {
  const world = createTestConversations();
  vi.mocked(appConversations).mockReturnValue(world.conversations);
  vi.mocked(appTickets).mockReturnValue(world.tickets);
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
  });
  return { ...world, project };
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
        costUsd: 0.1,
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
