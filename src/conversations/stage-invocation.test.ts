import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { agentCommandEntries, agentCommands } from '../test/fixtures';
import { ValidationError } from '../tickets/errors';

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
  });
  const ticket = world.tickets.createTicket({
    projectId: project.id,
    title: 'Add a coupon field',
  });
  return { ...world, project, ticket };
}

describe('A run that invokes a Stage (ADR 0051)', () => {
  it("gets the Stage and its Ticket, and the Project's agent commands, not a slash command", async () => {
    const world = setup();
    world.tickets.setProjectAgentCommands(
      world.project.id,
      agentCommandEntries({ startCommand: '/ship' }),
    );

    await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'start',
      stage: { stage: 'start' },
    });

    const { options } = world.runner.runs[0];
    expect(options.message).toEqual({
      invocation: {
        stage: 'start',
        ticket: { number: world.ticket.number, type: 'Ticket' },
      },
    });
    expect(options.agentCommands).toEqual(
      agentCommands({ startCommand: '/ship' }),
    );
  });

  it('records the first message as the runner words it, with its command on the Run outcome', async () => {
    const world = setup();
    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'triage',
      stage: { stage: 'triage' },
    });

    expect(world.conversations.transcript(conversation.id)[0]).toMatchObject({
      role: 'user',
      text: `/tandembike:triage T${world.ticket.number}`,
    });
    world.runner.runs[0].emit({ type: 'turn', costUsd: 0.1 });
    world.runner.runs[0].emit({ type: 'exit' });
    expect(world.conversations.latestRunOutcome(conversation.id)?.command).toBe(
      '/tandembike:triage',
    );
  });

  it('gives an Epic its own type, so the runner can pick the Epic Stage', async () => {
    const world = setup();
    const epic = world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Checkout',
      type: 'Epic',
    });

    const conversation = await world.conversations.start({
      startedBy: 'autopilot',
      ticketNumber: epic.number,
      intent: 'start',
      stage: { stage: 'start' },
    });

    expect(world.runner.runs[0].options.message).toEqual({
      invocation: {
        stage: 'start',
        ticket: { number: epic.number, type: 'Epic' },
      },
    });
    expect(world.conversations.transcript(conversation.id)[0].text).toBe(
      `/tandembike:implement-epic T${epic.number}`,
    );
  });

  it('carries the goal of a Plan and the topic and focus of a Spar', async () => {
    const world = setup();

    await world.conversations.startPlan({
      projectId: world.project.id,
      goal: ' Ship the beta ',
    });
    await world.conversations.start({
      startedBy: 'user',
      projectId: world.project.id,
      ticketNumber: world.ticket.number,
      intent: 'spar',
      stage: { stage: 'spar', topic: 'Faster triage' },
    });

    expect(world.runner.runs[0].options.message).toEqual({
      invocation: { stage: 'plan', goal: 'Ship the beta' },
    });
    expect(world.runner.runs[1].options.message).toEqual({
      invocation: {
        stage: 'spar',
        topic: 'Faster triage',
        focusTicketNumber: world.ticket.number,
      },
    });
  });

  it('carries the Cycle of a Retro', async () => {
    const world = setup();
    const cycle = world.tickets.createCycle({
      projectId: world.project.id,
      title: 'Beta',
    });

    await world.conversations.startRetro({ cycleId: cycle.id });

    expect(world.runner.runs[0].options.message).toEqual({
      invocation: { stage: 'retro', cycle: { id: cycle.id, title: 'Beta' } },
    });
  });

  it('sends a reply as text', async () => {
    const world = setup();
    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'start',
      stage: { stage: 'start' },
    });
    world.runner.runs[0].emit({ type: 'session', sessionId: 's1' });
    world.runner.runs[0].emit({ type: 'exit' });

    await world.conversations.reply(conversation.id, 'Go on', 'user');

    expect(world.runner.runs[1].options.message).toEqual({ text: 'Go on' });
  });

  it('refuses a Stage that is not the intent, or a Ticket Stage without a Ticket', async () => {
    const world = setup();

    await expect(
      world.conversations.start({
        startedBy: 'user',
        ticketNumber: world.ticket.number,
        intent: 'start',
        stage: { stage: 'triage' },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      world.conversations.start({
        startedBy: 'user',
        projectId: world.project.id,
        intent: 'triage',
        stage: { stage: 'triage' },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(world.runner.runs).toHaveLength(0);
  });
});
