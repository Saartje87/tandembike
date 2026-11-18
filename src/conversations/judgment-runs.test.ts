import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { connectMcpClient } from '../test/mcp';
import { createTestTickets } from '../test/tickets';
import { NotAllowedError, ValidationError } from '../tickets/errors';
import { claudeDisallowedTools } from './claude-tool-policy';
import { judgmentIntents } from './conversation-state';
import { copilotToolFilters } from './copilot-tool-policy';

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: false,
  });
  const cycle = world.tickets.createCycle({
    projectId: project.id,
    title: 'Ship it',
  });
  world.tickets.startCycle(cycle.id);
  return { ...world, project, cycle };
}

describe.each(judgmentIntents)('A %s run (ADR 0054)', (intent) => {
  /** Starts the judgment run, an Auto-reply on a Widget the User's Ask waits on. */
  const startJudgment = async (world: ReturnType<typeof setup>) => {
    let autoReplyEntryId: number | undefined;
    if (intent === 'auto_reply') {
      const ask = await world.conversations.start({
        startedBy: 'user',
        projectId: world.project.id,
        intent: 'ask',
        prompt: 'Go',
      });
      void world.runner.runs[0].options.askWidget({
        kind: 'rank',
        prompt: 'Order',
        items: ['A', 'B'],
      });
      autoReplyEntryId = world.conversations.transcript(ask.id).at(-1)?.id;
    }
    const before = world.runner.runs.length;
    const conversation = await world.conversations.start({
      startedBy: 'autopilot',
      projectId: world.project.id,
      intent,
      cycleId: world.cycle.id,
      prompt: 'Judge it',
      ...(autoReplyEntryId === undefined ? {} : { autoReplyEntryId }),
    });
    return { conversation, before, run: world.runner.runs[before] };
  };

  it('is started only by Autopilot', async () => {
    const world = setup();

    await expect(
      world.conversations.start({
        startedBy: 'user',
        projectId: world.project.id,
        intent,
        prompt: 'Judge it',
      }),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });

  it('runs in the main checkout under the judgment tool policy, on every run', async () => {
    const world = setup();
    const { conversation, before, run: first } = await startJudgment(world);
    first.emit({ type: 'session', sessionId: 's' });
    first.emit({ type: 'exit' });

    await world.conversations.reply(conversation.id, 'Go on', 'user');

    expect(conversation.worktreePath).toBeNull();
    expect(world.runner.runs.slice(before)).toHaveLength(2);
    for (const run of world.runner.runs.slice(before)) {
      expect(run.options.cwd).toBe(world.repositoryDir);
      expect(run.options.toolPolicy).toBe('judgment');
    }
  });

  it('holds a Machine slot but no Start run slot, so a Start can still start', async () => {
    const world = setup();
    await startJudgment(world);
    const ticket = world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Build it',
    });

    await world.conversations.start({
      startedBy: 'autopilot',
      ticketNumber: ticket.number,
      intent: 'start',
      cycleId: world.cycle.id,
      prompt: 'Go',
    });

    const capacity = world.conversations.capacity(world.project.id);
    expect(capacity.machine.slotsHeld).toBe(2);
    expect(capacity.project.slotsHeld).toBe(1);
  });

  it("counts its cost against the Active Cycle's Spend ceiling and the Machine ceiling", async () => {
    const world = setup();
    const { run } = await startJudgment(world);

    run.emit({ type: 'turn', cost: 0.4 });

    expect(
      world.conversations.autopilotSpend({
        projectId: world.project.id,
        cycleId: world.cycle.id,
      }),
    ).toBeCloseTo(0.4);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(world.conversations.autopilotSpendToday(midnight)).toBeCloseTo(0.4);
  });
});

describe('The judgment tool policy (ADR 0054)', () => {
  it('disallows on Claude Code file edits, the shell, every Widget and every Tandembike tool that writes', async () => {
    const client = await connectMcpClient(createTestTickets());
    const { tools } = await client.listTools();
    await client.close();
    const disallowed = claudeDisallowedTools('judgment');

    expect(disallowed).toEqual(
      expect.arrayContaining([
        'Edit',
        'Write',
        'NotebookEdit',
        'Bash',
        'AskUserQuestion',
        'mcp__widgets__ask_choice',
      ]),
    );
    expect(disallowed).not.toContain('Read');
    for (const tool of tools) {
      const name = `mcp__tandembike__${tool.name}`;
      expect(disallowed.includes(name), name).toBe(
        tool.annotations?.readOnlyHint !== true &&
          !['add_overlap_blocker', 'reply_to_question'].includes(tool.name),
      );
    }
  });

  it('keeps on Copilot only reading and the MCP tools, excluding every Tandembike tool that writes', async () => {
    const client = await connectMcpClient(createTestTickets());
    const { tools } = await client.listTools();
    await client.close();
    const { availableTools = [], excludedTools = [] } =
      copilotToolFilters('judgment');

    expect(availableTools).toEqual([
      'builtin:view',
      'builtin:grep',
      'builtin:glob',
      'mcp:*',
    ]);
    for (const tool of tools) {
      const name = `mcp:tandembike-${tool.name}`;
      expect(excludedTools.includes(name), name).toBe(
        tool.annotations?.readOnlyHint !== true &&
          !['add_overlap_blocker', 'reply_to_question'].includes(tool.name),
      );
    }
  });
});

describe('Auto-reply in the Conversations module (ADR 0054)', () => {
  const widget = {
    kind: 'choice' as const,
    prompt: 'Which library?',
    options: [{ label: 'A' }, { label: 'B' }],
    multiSelect: false,
    recommended: ['B'],
  };

  /** A Start on an Active Cycle Ticket, waiting on `widget`. */
  async function waiting() {
    const world = setup();
    const ticket = world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Build it',
      cycleId: world.cycle.id,
    });
    const start = await world.conversations.start({
      startedBy: 'autopilot',
      ticketNumber: ticket.number,
      intent: 'start',
      cycleId: world.cycle.id,
      prompt: 'Go',
    });
    const startRun = world.runner.runs[0];
    const pending = startRun.options.askWidget(widget);
    const entry = world.conversations.transcript(start.id).at(-1);
    const startReply = () =>
      world.conversations.start({
        startedBy: 'autopilot',
        ticketNumber: ticket.number,
        intent: 'auto_reply',
        cycleId: world.cycle.id,
        autoReplyEntryId: entry?.id,
        prompt: 'Answer it',
      });
    return {
      ...world,
      ticket,
      start,
      pending,
      entryId: entry?.id as number,
      startReply,
    };
  }

  it("lists a live Start's unanswered Widget, until an Auto-reply is started for it", async () => {
    const world = await waiting();

    expect(world.conversations.waitingWidgets(world.project.id)).toEqual([
      expect.objectContaining({
        conversationId: world.start.id,
        entryId: world.entryId,
        ticketNumber: world.ticket.number,
        widget,
      }),
    ]);

    await world.startReply();

    expect(world.conversations.waitingWidgets(world.project.id)).toEqual([]);
  });

  it('lists no permission request and no Widget of another intent', async () => {
    const world = setup();
    await world.conversations.start({
      startedBy: 'user',
      projectId: world.project.id,
      intent: 'ask',
      prompt: 'Go',
    });
    void world.runner.runs[0].options.askWidget(widget);

    expect(world.conversations.waitingWidgets(world.project.id)).toEqual([]);
  });

  it('refuses an Auto-reply without the Widget it answers', async () => {
    const world = await waiting();

    await expect(
      world.conversations.start({
        startedBy: 'autopilot',
        ticketNumber: world.ticket.number,
        intent: 'auto_reply',
        cycleId: world.cycle.id,
        prompt: 'Answer it',
      }),
    ).rejects.toThrow('An Auto-reply answers one Widget');
  });

  it('approves: answers the Widget, marked as the Auto-reply’s, and the Start goes on', async () => {
    const world = await waiting();
    const reply = await world.startReply();

    const result = await world.conversations.replyToQuestion(reply.id, {
      decision: 'approve',
      answer: { selected: ['B'] },
      reason: 'The recommended library is within scope.',
    });

    expect(result).toEqual({
      decision: 'approve',
      ticketNumber: world.ticket.number,
      startConversationId: world.start.id,
      question: 'Which library?',
      answer: 'B',
    });
    expect(await world.pending).toEqual({ selected: ['B'] });
    expect(world.conversations.get(world.start.id).state).toBe('running');
    const transcript = world.conversations.transcript(world.start.id);
    expect(
      transcript.find((entry) => entry.id === world.entryId)?.widget,
    ).toMatchObject({
      answer: { selected: ['B'] },
      autoReply: { conversationId: reply.id, decision: 'approve' },
    });
    expect(transcript.at(-1)).toMatchObject({
      role: 'session',
      text: `Auto-reply (Conversation ${reply.id}) answered for you: B. The recommended library is within scope.`,
    });
  });

  it('refuses an Approve with Other or Skip: those are not an option', async () => {
    const world = await waiting();
    const reply = await world.startReply();

    await expect(
      world.conversations.replyToQuestion(reply.id, {
        decision: 'approve',
        answer: { other: 'C' },
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(world.conversations.get(world.start.id).state).toBe('waiting');
  });

  it('splits: answers with Other, telling the Start to leave it out and file a follow-up with its Ticket as Origin', async () => {
    const world = await waiting();
    const reply = await world.startReply();

    await world.conversations.replyToQuestion(reply.id, {
      decision: 'split',
      reason: 'Choosing a library is a change of its own.',
    });

    const answer = await world.pending;
    expect(answer).toEqual({ other: expect.any(String) });
    const text = (answer as { other: string }).other;
    expect(text).toContain(`originNumber ${world.ticket.number}`);
    expect(text).toContain('Leave it out');
    expect(text).toContain('Choosing a library is a change of its own.');
    expect(world.conversations.splitRepliesAwaitingFollowUp()).toEqual([
      expect.objectContaining({
        entryId: world.entryId,
        conversationId: world.start.id,
        ticketNumber: world.ticket.number,
        working: true,
      }),
    ]);
  });

  it('escalates: leaves the Widget waiting and notes why in the Start’s transcript', async () => {
    const world = await waiting();
    const reply = await world.startReply();

    await world.conversations.replyToQuestion(reply.id, {
      decision: 'escalate',
      reason: 'It changes an acceptance criterion.',
    });

    expect(world.conversations.get(world.start.id).state).toBe('waiting');
    expect(world.conversations.transcript(world.start.id).at(-1)).toMatchObject(
      {
        role: 'session',
        text: `Auto-reply (Conversation ${reply.id}) left this question for you: It changes an acceptance criterion.`,
      },
    );
  });

  it('is dropped when the User answered first', async () => {
    const world = await waiting();
    const reply = await world.startReply();
    await world.conversations.answerWidget(world.start.id, world.entryId, {
      selected: ['A'],
    });

    await expect(
      world.conversations.replyToQuestion(reply.id, {
        decision: 'approve',
        answer: { selected: ['B'] },
        reason: 'x',
      }),
    ).rejects.toThrow('The User answered this question first');
    expect(await world.pending).toEqual({ selected: ['A'] });
  });

  it('answers once: a second reply is refused', async () => {
    const world = await waiting();
    const reply = await world.startReply();
    await world.conversations.replyToQuestion(reply.id, {
      decision: 'escalate',
      reason: 'Product decision.',
    });

    await expect(
      world.conversations.replyToQuestion(reply.id, {
        decision: 'escalate',
        reason: 'Again.',
      }),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });

  it('refuses a Conversation that is not an Auto-reply', async () => {
    const world = await waiting();

    await expect(
      world.conversations.replyToQuestion(world.start.id, {
        decision: 'escalate',
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });

  it('records a Split’s follow-up as filed or missing, and lists the missing ones', async () => {
    const world = await waiting();
    const reply = await world.startReply();
    await world.conversations.replyToQuestion(reply.id, {
      decision: 'split',
      reason: 'Out of scope.',
    });

    world.conversations.setSplitFollowUp(world.entryId, 'missing');

    expect(world.conversations.splitRepliesAwaitingFollowUp()).toEqual([]);
    expect(world.conversations.missingSplitFollowUps()).toEqual([
      {
        entryId: world.entryId,
        conversationId: world.start.id,
        projectId: world.project.id,
        ticketNumber: world.ticket.number,
        at: expect.any(Date),
      },
    ]);
  });
});
