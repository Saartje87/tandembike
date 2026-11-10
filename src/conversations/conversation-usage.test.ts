// @vitest-environment node

import { describe, expect, it } from 'vitest';

import type { TokenUsage } from '../footprint/token-usage';
import { createTestConversations } from '../test/conversations';

const opus = 'claude-opus-5-5';
const haiku = 'claude-haiku-5-5';

/** Tokens with `n` of each type times a small factor, easy to add up. */
const tokens = (n: number): TokenUsage => ({
  input: n,
  output: 2 * n,
  cacheWrite: 3 * n,
  cacheRead: 4 * n,
});

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
  });
  const lastRun = () => world.runner.runs[world.runner.runs.length - 1];
  const ask = () =>
    world.conversations.start({
      startedBy: 'user',
      projectId: project.id,
      intent: 'ask',
      prompt: 'Hi',
    });
  return { ...world, project, lastRun, ask };
}

describe('A Conversation’s token usage (T1176)', () => {
  it('has none before a run reports any', async () => {
    const { conversations, ask } = setup();
    const { id } = await ask();

    expect(conversations.usage(id)).toEqual({});
  });

  it('keeps the running total a run reports with each turn, per model', async () => {
    const { conversations, ask, lastRun } = setup();
    const { id } = await ask();

    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(1) },
    });
    lastRun().emit({
      type: 'turn',
      costUsd: 0.2,
      usage: { [opus]: tokens(5) },
    });

    expect(conversations.usage(id)).toEqual({ [opus]: tokens(5) });
  });

  it('adds a resumed run’s usage to the earlier runs’, as cost adds up', async () => {
    const { conversations, ask, lastRun } = setup();
    const { id } = await ask();
    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(5) },
    });
    lastRun().emit({ type: 'exit', error: 'crashed' });

    await conversations.reply(id, 'Again', 'user');
    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(1) },
    });
    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(2) },
    });

    expect(conversations.usage(id)).toEqual({ [opus]: tokens(7) });
  });

  it('records a row per model when a run switches models', async () => {
    const { conversations, ask, lastRun } = setup();
    const { id } = await ask();

    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(5), [haiku]: tokens(1) },
    });
    lastRun().emit({ type: 'exit' });
    await conversations.reply(id, 'Again', 'user');
    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [haiku]: tokens(2) },
    });

    expect(conversations.usage(id)).toEqual({
      [opus]: tokens(5),
      [haiku]: tokens(3),
    });
  });

  it('keeps the usage a stopped run reports after the stop', async () => {
    const { conversations, ask, lastRun } = setup();
    const { id } = await ask();
    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(1) },
    });

    await conversations.stop(id);
    lastRun().emit({
      type: 'turn',
      costUsd: 0.2,
      error: 'interrupted',
      usage: { [opus]: tokens(4) },
    });

    expect(conversations.usage(id)).toEqual({ [opus]: tokens(4) });
  });

  it('records Autopilot’s Conversations as it does the User’s', async () => {
    const { conversations, tickets, project, lastRun } = setup();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const { id } = await conversations.start({
      startedBy: 'autopilot',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });

    lastRun().emit({
      type: 'turn',
      costUsd: 0.1,
      usage: { [opus]: tokens(3) },
    });

    expect(conversations.usage(id)).toEqual({ [opus]: tokens(3) });
  });
});
