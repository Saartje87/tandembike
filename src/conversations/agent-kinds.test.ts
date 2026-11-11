import { describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { NotAllowedError } from '../tickets/errors';
import type { RunnerAvailability } from './agent-runner';
import { conversationActivity } from './conversation-activity';

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

describe('The Agent kind of a Conversation (ADR 0051)', () => {
  it('is the Project default when it starts, Claude Code unless changed', async () => {
    const world = setup();

    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'ask',
      prompt: 'What is left?',
    });

    expect(conversation.agentKind).toBe('claude-code');
    expect(world.runners['claude-code'].runs).toHaveLength(1);
    expect(world.runners.copilot.runs).toHaveLength(0);
  });

  it("starts on another kind when it is the Project's default, Autopilot's starts too", async () => {
    const world = setup();
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
    });

    const byUser = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'ask',
      prompt: 'What is left?',
    });
    const byAutopilot = await world.conversations.start({
      startedBy: 'autopilot',
      ticketNumber: world.ticket.number,
      intent: 'triage',
      prompt: '/tandembike:triage T1',
    });

    expect(byUser.agentKind).toBe('copilot');
    expect(byAutopilot.agentKind).toBe('copilot');
    expect(world.runners.copilot.runs).toHaveLength(2);
    expect(world.runners['claude-code'].runs).toHaveLength(0);
  });

  it("replies, resumes and stops on the Conversation's own kind after the default changes", async () => {
    const world = setup();
    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'ask',
      prompt: 'What is left?',
    });
    const first = world.runners['claude-code'].runs[0];
    first.emit({ type: 'session', sessionId: 's1' });
    first.emit({ type: 'turn', cost: 0.1 });

    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
    });
    await world.conversations.reply(conversation.id, 'Go on', 'user');
    expect(first.sent).toEqual(['Go on']);

    first.emit({ type: 'exit' });
    await world.conversations.reply(conversation.id, 'Once more', 'user');
    const resumed = world.runners['claude-code'].runs[1];
    expect(resumed.options.resume).toBe('s1');

    await world.conversations.stop(conversation.id);
    expect(resumed.closed).toBe(true);
    expect(world.runners.copilot.runs).toHaveLength(0);
    expect(world.conversations.get(conversation.id).agentKind).toBe(
      'claude-code',
    );
  });

  it("resumes on the Conversation's own kind after a restart", async () => {
    const world = setup();
    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'ask',
      prompt: 'What is left?',
    });
    world.runners['claude-code'].runs[0].emit({
      type: 'session',
      sessionId: 's1',
    });
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
    });

    const restarted = world.restart();
    restarted.interruptStale();
    await restarted.reply(conversation.id, 'Go on', 'user');

    expect(world.runners['claude-code'].runs[1].options.resume).toBe('s1');
    expect(world.runners.copilot.runs).toHaveLength(0);
  });

  it('refuses a start on a kind that cannot run now, with its reason', async () => {
    const world = setup();
    world.runners.copilot.availability = () => ({
      available: false,
      reason: 'Sign in to Copilot first.',
    });
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
    });

    await expect(
      world.conversations.start({
        startedBy: 'user',
        ticketNumber: world.ticket.number,
        intent: 'ask',
        prompt: 'What is left?',
      }),
    ).rejects.toEqual(new NotAllowedError('Sign in to Copilot first.'));
    expect(world.conversations.list()).toEqual([]);
  });

  it("waits for a runner's fresh answer before a start, a reply or the default selector", async () => {
    const world = setup();
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
    });
    let known: RunnerAvailability = {
      available: false,
      reason: 'Checking whether Copilot can run…',
    };
    const copilot = world.runners.copilot;
    copilot.availability = () => known;
    copilot.checkAvailability = vi.fn(async () => {
      known = { available: true };
      return known;
    });

    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'ask',
      prompt: 'What is left?',
    });
    copilot.runs[0].emit({ type: 'session', sessionId: 's1' });
    copilot.runs[0].emit({ type: 'exit' });
    known = { available: false, reason: 'Checking whether Copilot can run…' };
    await world.conversations.reply(conversation.id, 'Go on', 'user');
    known = { available: false, reason: 'Checking whether Copilot can run…' };
    const kinds = await world.conversations.agentKinds();

    expect(copilot.runs).toHaveLength(2);
    expect(copilot.runs[1].options.resume).toBe('s1');
    expect(kinds[1]).toEqual({
      kind: 'copilot',
      label: 'Copilot',
      available: true,
    });
    expect(copilot.checkAvailability).toHaveBeenCalledTimes(3);
  });

  it('refuses to continue a Copilot Conversation in a terminal, which runs Claude Code only (T1369)', async () => {
    const world = setup();
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
    });
    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'ask',
      prompt: 'What is left?',
    });
    world.runners.copilot.runs[0].emit({ type: 'session', sessionId: 's1' });

    await expect(
      world.conversations.handOffToTerminal(conversation.id),
    ).rejects.toEqual(
      new NotAllowedError(
        'Only a Claude Code Conversation can continue in a terminal.',
      ),
    );
  });

  it('refuses a start on a kind with no runner, naming it', async () => {
    const world = createTestConversations(undefined, {
      kinds: ['claude-code'],
    });
    const project = world.tickets.createProject({ name: 'Website' });
    world.tickets.setProjectAgentSettings(project.id, {
      repositoryPath: world.repositoryDir,
      defaultAgentKind: 'copilot',
    });

    await expect(
      world.conversations.start({
        startedBy: 'user',
        projectId: project.id,
        intent: 'ask',
        prompt: 'What is left?',
      }),
    ).rejects.toEqual(new NotAllowedError('Copilot cannot run here yet.'));
  });

  it('lists each Agent kind with whether it can run, for the default selector', async () => {
    const world = createTestConversations(undefined, {
      kinds: ['claude-code'],
    });

    expect(await world.conversations.agentKinds()).toEqual([
      { kind: 'claude-code', label: 'Claude Code', available: true },
      {
        kind: 'copilot',
        label: 'Copilot',
        available: false,
        reason: 'Copilot cannot run here yet.',
      },
    ]);
  });

  it("runs on the model set for the Conversation's own kind, never another kind's", async () => {
    const world = setup();
    world.tickets.setProjectAgentSettings(world.project.id, {
      models: {
        'claude-code': { runModel: 'claude-opus-5-5' },
        copilot: { runModel: 'gpt-5', triageModel: 'gpt-5-mini' },
      },
    });
    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'ask',
      prompt: 'What is left?',
    });
    world.runners['claude-code'].runs[0].emit({
      type: 'session',
      sessionId: 's1',
    });
    world.runners['claude-code'].runs[0].emit({ type: 'exit' });
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
    });

    await world.conversations.reply(conversation.id, 'Go on', 'user');
    await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'triage',
      prompt: 'Triage it.',
    });
    await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'ask',
      prompt: 'And now?',
    });

    expect(world.runners['claude-code'].runs[1].options.model).toBe(
      'claude-opus-5-5',
    );
    expect(world.runners.copilot.runs[0].options.model).toBe('gpt-5-mini');
    expect(world.runners.copilot.runs[1].options.model).toBe('gpt-5');
  });

  it("leaves the model out, the agent's own default, when its kind has none", async () => {
    const world = setup();
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
      models: { 'claude-code': { runModel: 'claude-opus-5-5' } },
    });

    await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'ask',
      prompt: 'What is left?',
    });

    expect(world.runners.copilot.runs[0].options).not.toHaveProperty('model');
  });

  it("shows the activity a runner reports on the status line, not its agent's tool name (T1372)", async () => {
    const world = setup();
    world.tickets.setProjectAgentSettings(world.project.id, {
      defaultAgentKind: 'copilot',
    });
    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: world.ticket.number,
      intent: 'ask',
      prompt: 'What is left?',
    });

    world.runners.copilot.runs[0].emit({
      type: 'tool',
      text: 'shell {"command":"npm test"}',
      name: 'shell',
      input: { command: 'npm test' },
      activity: { verb: 'Running', target: 'npm test' },
    });

    const row = world.conversations
      .activityRows()
      .find(({ id }) => id === conversation.id);
    expect(row?.latest?.toolActivity).toEqual({
      verb: 'Running',
      target: 'npm test',
    });
    expect(
      conversationActivity(world.conversations.activityRows()).live[
        world.ticket.number
      ]?.line,
    ).toBe('Running npm test');
  });
});
