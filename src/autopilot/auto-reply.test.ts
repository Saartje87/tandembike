import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { createChangeChannel } from '../tickets/changes';
import { createAutopilot } from './autopilot';
import type { EngineState } from './explanation';

const widget = {
  kind: 'choice' as const,
  prompt: 'Which library?',
  options: [
    { label: 'A', description: 'The small one' },
    { label: 'B', description: 'The one the code uses' },
  ],
  multiSelect: false,
  recommended: ['B'],
};

function setup(
  options: {
    autoReply?: boolean;
    replyRules?: string;
    parallel?: boolean;
  } = {},
) {
  const changes = createChangeChannel();
  const world = createTestConversations(changes);
  const { tickets, conversations } = world;
  const project = tickets.createProject({ name: 'Website' });
  tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: options.parallel ?? true,
    spendCeilingUsd: 50,
    autoReply: options.autoReply ?? true,
    ...(options.replyRules === undefined
      ? {}
      : { replyRules: options.replyRules }),
  });
  tickets.setMachineSettings({ maxConcurrentRuns: 5 });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  tickets.startCycle(cycle.id);
  const autopilot = createAutopilot({ tickets, conversations, changes });
  /** A Start on a new Ticket, in the Active Cycle unless `cycleId` is null. */
  const startOn = async (title: string, cycleId: number | null = cycle.id) => {
    const ticket = tickets.createTicket({
      projectId: project.id,
      title,
      ...(cycleId === null ? {} : { cycleId }),
    });
    const start = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });
    const run = world.runner.runs.at(-1);
    if (!run) {
      throw new Error('No run started.');
    }
    return { ticket, start, run };
  };
  const replies = () =>
    conversations
      .list({ projectId: project.id })
      .filter((conversation) => conversation.intent === 'auto_reply')
      .reverse();
  return { ...world, changes, project, cycle, autopilot, startOn, replies };
}

const reasonTypes = (state: EngineState<{ type: string }>) =>
  state.state === 'running' ? [] : state.reasons.map(({ type }) => type);

describe('Auto-reply (ADR 0054)', () => {
  it("starts one run on a Start's unanswered Widget, Started by Autopilot for the Active Cycle, with the question and the Reply rules", async () => {
    const world = setup({ replyRules: 'Always escalate schema changes.' });
    const { ticket, start, run } = await world.startOn('Build it');
    run.emit({ type: 'agent', text: 'Two libraries would work here.' });
    void run.options.askWidget(widget);

    await world.autopilot.evaluate();

    const [reply] = world.replies();
    expect(world.replies()).toHaveLength(1);
    expect(reply).toMatchObject({
      startedBy: 'autopilot',
      ticketNumber: ticket.number,
    });
    expect(world.conversations.judgmentRunOf(reply.id)).toMatchObject({
      intent: 'auto_reply',
      cycleId: world.cycle.id,
    });
    const message = world.runner.runs.at(-1)?.firstMessage ?? '';
    expect(message).toContain(`T${ticket.number}`);
    expect(message).toContain(`Conversation ${start.id}`);
    expect(message).toContain('Which library?');
    expect(message).toContain('"recommended": [\n    "B"\n  ]');
    expect(message).toContain('Two libraries would work here.');
    expect(message).toContain('Always escalate schema changes.');
  });

  it('runs although the waiting Start holds the Project’s only Start run slot', async () => {
    const world = setup({ parallel: false });
    const { run } = await world.startOn('Build it');
    void run.options.askWidget(widget);
    expect(
      world.conversations.capacity(world.project.id).project.slotsHeld,
    ).toBe(1);

    await world.autopilot.evaluate();

    expect(world.replies()).toHaveLength(1);
  });

  it('starts nothing with the switch off', async () => {
    const world = setup({ autoReply: false });
    const { run } = await world.startOn('Build it');
    void run.options.askWidget(widget);

    await world.autopilot.evaluate();

    expect(world.replies()).toEqual([]);
    expect(
      reasonTypes(world.autopilot.explain(world.project.id).autoReply),
    ).toEqual(['switchedOff']);
  });

  it('answers each Widget once: an Auto-reply that ended is not followed by another', async () => {
    const world = setup();
    const { run } = await world.startOn('Build it');
    void run.options.askWidget(widget);
    await world.autopilot.evaluate();

    world.runner.runs.at(-1)?.emit({ type: 'turn', cost: 0.1 });
    await world.autopilot.evaluate();

    expect(world.replies()).toHaveLength(1);
    expect(
      reasonTypes(world.autopilot.explain(world.project.id).autoReply),
    ).toEqual(['noQuestionWaiting']);
  });

  it('leaves permission requests and Starts outside the Active Cycle to the User', async () => {
    const world = setup();
    const asking = await world.startOn('Asks permission');
    void asking.run.options.askPermission({
      toolName: 'Bash',
      input: { command: 'rm -rf build' },
      rules: [],
    });
    const backlog = await world.startOn('In the Backlog', null);
    void backlog.run.options.askWidget(widget);

    await world.autopilot.evaluate();

    expect(world.replies()).toEqual([]);
  });

  it('runs one at a time, oldest Widget first, naming the working run', async () => {
    const world = setup();
    const first = await world.startOn('First');
    void first.run.options.askWidget(widget);
    const second = await world.startOn('Second');
    void second.run.options.askWidget(widget);

    await world.autopilot.evaluate();

    const [reply] = world.replies();
    expect(world.replies()).toHaveLength(1);
    expect(reply.ticketNumber).toBe(first.ticket.number);
    expect(world.autopilot.explain(world.project.id).autoReply).toEqual({
      state: 'paused',
      reasons: [{ type: 'judgmentRunWorking', conversationId: reply.id }],
    });

    world.runner.runs.at(-1)?.emit({ type: 'turn', cost: 0.1 });
    await world.autopilot.evaluate();

    expect(world.replies().map(({ ticketNumber }) => ticketNumber)).toEqual([
      first.ticket.number,
      second.ticket.number,
    ]);
  });

  it('pauses without a Spend ceiling, its runs counting against it', async () => {
    const world = setup();
    world.tickets.setProjectAgentSettings(world.project.id, {
      spendCeilingUsd: null,
    });
    const { run } = await world.startOn('Build it');
    void run.options.askWidget(widget);

    await world.autopilot.evaluate();

    expect(world.replies()).toEqual([]);
    expect(
      reasonTypes(world.autopilot.explain(world.project.id).autoReply),
    ).toEqual(['noSpendCeiling']);
  });
});
