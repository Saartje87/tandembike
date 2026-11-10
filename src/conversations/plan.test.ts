// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { agentCommandEntries } from '../test/fixtures';
import { NotAllowedError, ValidationError } from '../tickets/errors';

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
  });
  return { ...world, project };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a refusal');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('A Plan Conversation (T1248)', () => {
  it('starts with the Plan command and the goal, in the main checkout', async () => {
    const { conversations, runner, project } = setup();

    const plan = await conversations.startPlan({
      projectId: project.id,
      goal: '  Ship the beta  ',
    });

    expect(plan).toMatchObject({
      projectId: project.id,
      ticketNumber: null,
      intent: 'plan',
      startedBy: 'user',
      worktreePath: null,
    });
    expect(runner.runs[0].options.prompt).toBe(
      '/tandembike:plan Ship the beta',
    );
  });

  it("sends the Project's own Plan command when it set one", async () => {
    const { conversations, runner, tickets, project } = setup();
    tickets.setProjectAgentCommands(
      project.id,
      agentCommandEntries({ planCommand: 'my:plan' }),
    );

    await conversations.startPlan({ projectId: project.id, goal: 'Ship it' });

    expect(runner.runs[0].options.prompt).toBe('/my:plan Ship it');
  });

  it('is refused without a goal', async () => {
    const { conversations, project } = setup();

    const error = await failure(
      conversations.startPlan({ projectId: project.id, goal: '   ' }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(conversations.list({ projectId: project.id })).toHaveLength(0);
  });

  it('is refused when Autopilot starts it', async () => {
    const { conversations, project } = setup();

    const error = await failure(
      conversations.start({
        startedBy: 'autopilot',
        projectId: project.id,
        intent: 'plan',
        prompt: 'Go',
      }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
  });

  it('is refused about a Ticket', async () => {
    const { conversations, tickets, project } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });

    const error = await failure(
      conversations.start({
        startedBy: 'user',
        ticketNumber: ticket.number,
        intent: 'plan',
        prompt: 'Go',
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
  });

  it('is outside the Start run limit', async () => {
    const { conversations, runner, tickets, project } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });

    await conversations.startPlan({ projectId: project.id, goal: 'Ship' });

    expect(runner.runs).toHaveLength(2);
  });

  it('gives the per-Ticket estimate in the brief', async () => {
    const world = setup();
    const { conversations, runner, tickets, project } = world;
    tickets.setProjectAgentSettings(project.id, {
      parallelRuns: true,
      maxConcurrentRuns: 50,
    });
    vi.useFakeTimers();
    let at = new Date('2026-01-01T10:00:00Z').getTime();
    const tick = () => {
      at += 60_000;
      vi.setSystemTime(at);
    };
    for (const cost of [1, 2, 3, 4, 5]) {
      const ticket = tickets.createTicket({
        projectId: project.id,
        title: 'W',
      });
      tick();
      await conversations.start({
        startedBy: 'user',
        ticketNumber: ticket.number,
        intent: 'start',
        prompt: 'Go',
      });
      const run = runner.runs[runner.runs.length - 1];
      tickets.updateTicket(ticket.number, { status: 'Done' });
      tick();
      run.emit({ type: 'turn', costUsd: cost });
    }

    await conversations.startPlan({ projectId: project.id, goal: 'Ship' });

    const plan = runner.runs[runner.runs.length - 1];
    expect(plan.options.systemPrompt).toContain('$3.00 per Ticket');
  });

  it('says there are not enough runs to estimate', async () => {
    const { conversations, runner, project } = setup();

    await conversations.startPlan({ projectId: project.id, goal: 'Ship' });

    expect(runner.runs[0].options.systemPrompt).toContain(
      'not enough runs to estimate',
    );
  });
});
