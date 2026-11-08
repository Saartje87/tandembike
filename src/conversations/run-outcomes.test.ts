// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestConversations } from '../test/conversations';

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
  });
  const ticket = world.tickets.createTicket({
    projectId: project.id,
    title: 'Fix it',
  });
  const startOnTicket = (
    intent: 'start' | 'triage' = 'start',
    prompt = 'Go',
    startedBy: 'user' | 'autopilot' = 'user',
  ) =>
    world.conversations.start({
      startedBy,
      ticketNumber: ticket.number,
      intent,
      prompt,
    });
  return { ...world, project, ticket, startOnTicket };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Run outcomes', () => {
  it('records one at a turn result, with the run’s fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));
    const { conversations, runner, project, ticket, startOnTicket } = setup();
    const conversation = await startOnTicket('start', '/implement T1');
    runner.runs[0].emit({
      type: 'session',
      sessionId: 's1',
      model: 'claude-opus-5',
    });

    vi.setSystemTime(new Date('2026-03-01T10:05:00Z'));
    runner.runs[0].emit({ type: 'turn', costUsd: 1.5 });

    expect(conversations.latestRunOutcome(conversation.id)).toMatchObject({
      conversationId: conversation.id,
      projectId: project.id,
      ticketNumber: ticket.number,
      stage: 'start',
      result: 'abandoned',
      startedAt: new Date('2026-03-01T10:00:00Z'),
      endedAt: new Date('2026-03-01T10:05:00Z'),
      costUsd: 1.5,
      model: 'claude-opus-5',
      command: '/implement',
      startedByAutopilot: false,
    });
  });

  it('has no command when the first message is not one, and none before a run ends', async () => {
    const { conversations, runner, startOnTicket } = setup();
    const conversation = await startOnTicket('start', 'Please do it');
    expect(conversations.latestRunOutcome(conversation.id)).toBeNull();

    runner.runs[0].emit({ type: 'turn', costUsd: 0 });

    expect(conversations.latestRunOutcome(conversation.id)).toMatchObject({
      command: null,
      model: null,
    });
  });

  it('records the cost of each run, not the Conversation’s total', async () => {
    const { conversations, runner, startOnTicket } = setup();
    const conversation = await startOnTicket();
    runner.runs[0].emit({ type: 'turn', costUsd: 1 });
    await conversations.reply(conversation.id, 'More', 'user');
    runner.runs[0].emit({ type: 'turn', costUsd: 1.75 });

    expect(
      conversations.runOutcomes(conversation.id).map((o) => o.costUsd),
    ).toEqual([1, 0.75]);
  });

  it('marks a run Autopilot started, and a reply by Autopilot', async () => {
    const { conversations, runner, startOnTicket } = setup();
    const conversation = await startOnTicket('start', 'Go', 'autopilot');
    runner.runs[0].emit({ type: 'turn', costUsd: 1 });
    await conversations.reply(conversation.id, 'Hi', 'user');
    runner.runs[0].emit({ type: 'turn', costUsd: 2 });
    await conversations.reply(conversation.id, 'Resume', 'autopilot');
    runner.runs[0].emit({ type: 'turn', costUsd: 3 });

    expect(
      conversations
        .runOutcomes(conversation.id)
        .map((o) => o.startedByAutopilot),
    ).toEqual([true, false, true]);
  });

  describe('result', () => {
    it('is completed when the Ticket is Done', async () => {
      const { conversations, runner, tickets, ticket, startOnTicket } = setup();
      const conversation = await startOnTicket();
      tickets.updateTicket(ticket.number, { status: 'Done' });
      runner.runs[0].emit({ type: 'turn', costUsd: 1 });
      expect(conversations.latestRunOutcome(conversation.id)?.result).toBe(
        'completed',
      );
    });

    it('is pr_open when the Ticket has a PR reference', async () => {
      const { conversations, runner, tickets, ticket, startOnTicket } = setup();
      const conversation = await startOnTicket();
      tickets.updateTicket(ticket.number, { status: 'In progress' });
      tickets.addExternalReferences(ticket.number, [
        'https://github.com/acme/site/pull/12',
      ]);
      runner.runs[0].emit({ type: 'turn', costUsd: 1 });
      expect(conversations.latestRunOutcome(conversation.id)?.result).toBe(
        'pr_open',
      );
    });

    it('is abandoned for a Start whose Ticket is Todo, needs_reply for a Triage', async () => {
      const { conversations, runner, startOnTicket } = setup();
      const start = await startOnTicket('start');
      const triage = await startOnTicket('triage');
      runner.runs[0].emit({ type: 'turn', costUsd: 1 });
      runner.runs[1].emit({ type: 'turn', costUsd: 1 });
      expect(conversations.latestRunOutcome(start.id)?.result).toBe(
        'abandoned',
      );
      expect(conversations.latestRunOutcome(triage.id)?.result).toBe(
        'needs_reply',
      );
    });

    it('is needs_reply while the Ticket is In progress', async () => {
      const { conversations, runner, tickets, ticket, startOnTicket } = setup();
      const conversation = await startOnTicket();
      tickets.updateTicket(ticket.number, { status: 'In progress' });
      runner.runs[0].emit({ type: 'turn', costUsd: 1 });
      expect(conversations.latestRunOutcome(conversation.id)?.result).toBe(
        'needs_reply',
      );
    });

    it('is failed_transient or failed for an error, even on a Done Ticket', async () => {
      const { conversations, runner, tickets, ticket, startOnTicket } = setup();
      const overloaded = await startOnTicket();
      const broken = await startOnTicket();
      tickets.updateTicket(ticket.number, { status: 'Done' });
      runner.runs[0].emit({
        type: 'turn',
        costUsd: 1,
        error: 'API Error: 529 overloaded',
      });
      runner.runs[1].emit({
        type: 'turn',
        costUsd: 1,
        error: 'error_max_turns',
      });
      expect(conversations.latestRunOutcome(overloaded.id)?.result).toBe(
        'failed_transient',
      );
      expect(conversations.latestRunOutcome(broken.id)?.result).toBe('failed');
    });

    it('classifies by the error subtype the turn carries', async () => {
      const { conversations, runner, startOnTicket } = setup();
      const conversation = await startOnTicket();
      runner.runs[0].emit({
        type: 'turn',
        costUsd: 1,
        error: 'The run failed',
        errorSubtype: 'api_error',
      });
      expect(conversations.latestRunOutcome(conversation.id)?.result).toBe(
        'failed_transient',
      );
    });

    it('uses only the error and stopped rules for a Conversation without a Ticket', async () => {
      const { conversations, runner, project } = setup();
      const ask = await conversations.start({
        startedBy: 'user',
        projectId: project.id,
        intent: 'ask',
        prompt: 'Hi',
      });
      runner.runs[0].emit({ type: 'turn', costUsd: 1 });
      expect(conversations.latestRunOutcome(ask.id)).toMatchObject({
        ticketNumber: null,
        stage: 'ask',
        result: 'needs_reply',
      });
    });

    it('is failed at an exit that carries an error, once for the run', async () => {
      const { conversations, runner, startOnTicket } = setup();
      const conversation = await startOnTicket();
      runner.runs[0].emit({ type: 'exit', error: 'socket hang up' });
      expect(conversations.runOutcomes(conversation.id)).toMatchObject([
        { result: 'failed_transient' },
      ]);
    });

    it('records an exit without error after a turn only when no outcome was recorded for that run', async () => {
      const { conversations, runner, startOnTicket } = setup();
      const conversation = await startOnTicket();
      runner.runs[0].emit({ type: 'turn', costUsd: 1 });
      runner.runs[0].emit({ type: 'exit' });
      expect(conversations.runOutcomes(conversation.id)).toHaveLength(1);

      const other = await startOnTicket();
      runner.runs[1].emit({ type: 'exit' });
      expect(conversations.runOutcomes(other.id)).toMatchObject([
        { result: 'abandoned' },
      ]);
    });

    it('is stopped when the User stops a working run, and nothing when it was idle', async () => {
      const { conversations, runner, startOnTicket } = setup();
      const working = await startOnTicket();
      const idle = await startOnTicket();
      runner.runs[1].emit({ type: 'turn', costUsd: 1 });

      await conversations.stop(working.id);
      await conversations.stop(idle.id);

      expect(conversations.runOutcomes(working.id)).toMatchObject([
        { result: 'stopped' },
      ]);
      expect(
        conversations.runOutcomes(idle.id).map((o) => o.result),
      ).not.toContain('stopped');
    });

    it('is not recorded twice when a stopped run reports its turn afterwards', async () => {
      const { conversations, runner, startOnTicket } = setup();
      const working = await startOnTicket();
      await conversations.stop(working.id);
      runner.runs[0].emit({ type: 'turn', costUsd: 2 });
      expect(conversations.runOutcomes(working.id)).toHaveLength(1);
    });

    it('carries the final cost the stopped run reports after the stop', async () => {
      const { conversations, runner, startOnTicket } = setup();
      const working = await startOnTicket();
      await conversations.stop(working.id);
      expect(conversations.runOutcomes(working.id)[0].costUsd).toBe(0);

      runner.runs[0].emit({ type: 'turn', costUsd: 2 });
      runner.runs[0].emit({ type: 'turn', costUsd: 3 });

      expect(conversations.runOutcomes(working.id)).toMatchObject([
        { result: 'stopped', costUsd: 2 },
      ]);
    });
  });

  it('keeps Run outcomes when the Conversation is closed', async () => {
    const { conversations, runner, startOnTicket } = setup();
    const conversation = await startOnTicket();
    runner.runs[0].emit({ type: 'turn', costUsd: 1 });
    await conversations.close(conversation.id);
    expect(conversations.runOutcomes(conversation.id)).toHaveLength(1);
  });
});

describe('Run stats', () => {
  it('sums each Stage of a Project over the last 30 days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));
    const { conversations, runner, project, startOnTicket } = setup();
    const old = await startOnTicket();
    runner.runs[0].emit({ type: 'turn', costUsd: 9 });

    vi.setSystemTime(new Date('2026-04-15T10:00:00Z'));
    const a = await startOnTicket();
    vi.setSystemTime(new Date('2026-04-15T10:10:00Z'));
    runner.runs[1].emit({ type: 'turn', costUsd: 1 });
    const b = await startOnTicket();
    vi.setSystemTime(new Date('2026-04-15T10:30:00Z'));
    runner.runs[2].emit({
      type: 'turn',
      costUsd: 3,
      error: 'error_max_turns',
    });
    expect([old.id, a.id, b.id]).toHaveLength(3);

    expect(conversations.runStats(project.id)).toEqual([
      {
        stage: 'start',
        runs: 2,
        results: {
          completed: 0,
          pr_open: 0,
          needs_reply: 0,
          abandoned: 1,
          stopped: 0,
          failed_transient: 0,
          failed: 1,
        },
        totalCostUsd: 4,
        meanCostUsd: 2,
        meanDurationMs: 15 * 60 * 1000,
      },
    ]);
    expect(conversations.runStats(project.id + 1)).toEqual([]);
  });
});
