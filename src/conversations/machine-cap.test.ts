import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { createChangeChannel } from '../tickets/changes';
import { NotAllowedError } from '../tickets/errors';
import { laneOf } from '../tickets/ticket-lanes';
import { conversationActivity } from './conversation-activity';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The cap's refusal, naming the Conversations holding the slots (T1331). */
const capMessage = (cap: number, held: string) =>
  `The machine runs its cap of ${cap} ${cap === 1 ? 'run' : 'runs'}, held by ${held}. Wait for one to finish, answer or close one, or raise the cap in Settings.`;

function setup(cap = 2) {
  const world = createTestConversations(createChangeChannel());
  const { tickets } = world;
  tickets.setMachineSettings({ maxConcurrentRuns: cap });
  const projects = ['Website', 'Shop'].map((name, index) => {
    const project = tickets.createProject({ name });
    tickets.setProjectAgentSettings(project.id, {
      repositoryPath:
        index === 0
          ? world.repositoryDir
          : mkdtempSync(join(tmpdir(), 'tandembike-repo-')),
      parallelRuns: true,
    });
    return project;
  });
  const startIn = (
    projectId: number,
    intent: 'start' | 'triage' | 'ask',
    startedBy: 'user' | 'autopilot' | 'terminal' = 'user',
  ) => {
    if (startedBy === 'terminal') {
      const ticket = tickets.createTicket({ projectId, title: 'T' });
      return world.conversations.startTerminal({
        ticketNumber: ticket.number,
        intent: 'start',
      });
    }
    const ticket = tickets.createTicket({ projectId, title: 'Work' });
    return world.conversations.start({
      startedBy,
      ticketNumber: ticket.number,
      intent,
      prompt: 'Go',
      ...(startedBy === 'autopilot' && intent === 'start'
        ? { cycleId: 1 }
        : {}),
    });
  };
  return { ...world, projects, startIn };
}

describe('The machine cap (ADR 0041)', () => {
  it('counts working Start runs across Projects', async () => {
    const { conversations, projects, startIn } = setup();
    expect(conversations.capacity().machine.slotsHeld).toBe(0);

    await startIn(projects[0].id, 'start');
    await startIn(projects[1].id, 'start');

    expect(conversations.capacity().machine.slotsHeld).toBe(2);
  });

  it('counts a Merge and a Triage Autopilot started, but not a Triage the User started or an Ask', async () => {
    const { conversations, projects, startIn, tickets } = setup(9);

    await startIn(projects[0].id, 'triage', 'autopilot');
    expect(conversations.capacity().machine.slotsHeld).toBe(1);

    await startIn(projects[0].id, 'triage', 'user');
    await startIn(projects[0].id, 'ask', 'user');
    expect(conversations.capacity().machine.slotsHeld).toBe(1);

    const ticket = tickets.createTicket({
      projectId: projects[1].id,
      title: 'Ship',
    });
    tickets.updateTicket(ticket.number, { status: 'In progress' });
    tickets.addExternalReferences(ticket.number, [
      'https://github.com/acme/site/pull/12',
    ]);
    await conversations.approveMerge({ ticketNumber: ticket.number });
    expect(conversations.capacity().machine.slotsHeld).toBe(2);
  });

  it('counts an idle run, waiting on the User, but not a Terminal Conversation', async () => {
    const { conversations, runner, projects, startIn } = setup(9);

    await startIn(projects[0].id, 'start');
    runner.runs[0].emit({ type: 'turn', costUsd: 1 });
    await startIn(projects[1].id, 'start', 'terminal');

    expect(conversations.capacity().machine.slotsHeld).toBe(1);
  });

  it('counts a run waiting on a permission', async () => {
    const { conversations, runner, projects, startIn } = setup(9);
    await startIn(projects[0].id, 'start');

    void runner.runs[0].options.askPermission({
      toolName: 'Bash',
      input: { command: 'ls' },
      rules: [],
    });

    expect(conversations.capacity().machine.slotsHeld).toBe(1);
  });

  it('refuses a Start at the cap, whatever Project it is in, naming the cap', async () => {
    const { conversations, runner, projects, startIn, tickets } = setup();
    await startIn(projects[0].id, 'start');
    await startIn(projects[1].id, 'start');
    const ticket = tickets.createTicket({
      projectId: projects[0].id,
      title: 'Third',
    });

    await expect(
      conversations.start({
        startedBy: 'user',
        ticketNumber: ticket.number,
        intent: 'start',
        prompt: 'Go',
      }),
    ).rejects.toEqual(new NotAllowedError(capMessage(2, 'T1 and T2')));
    expect(runner.runs).toHaveLength(2);
    expect(conversations.list({ ticketNumber: ticket.number })).toEqual([]);
  });

  it('refuses Approve merge at the cap', async () => {
    const { conversations, projects, startIn, tickets } = setup(1);
    await startIn(projects[0].id, 'start');
    const ticket = tickets.createTicket({
      projectId: projects[1].id,
      title: 'Ship',
    });
    tickets.updateTicket(ticket.number, { status: 'In progress' });
    tickets.addExternalReferences(ticket.number, [
      'https://github.com/acme/site/pull/12',
    ]);

    await expect(
      conversations.approveMerge({ ticketNumber: ticket.number }),
    ).rejects.toEqual(new NotAllowedError(capMessage(1, 'T1')));
  });

  it('does not limit a Triage or an Ask at the cap', async () => {
    const { conversations, projects, startIn } = setup(1);
    await startIn(projects[0].id, 'start');

    await startIn(projects[1].id, 'triage');
    await startIn(projects[1].id, 'ask');

    expect(conversations.capacity().machine.slotsHeld).toBe(1);
  });

  it('never refuses a reply, which keeps the machine at its cap', async () => {
    const { conversations, runner, projects, startIn } = setup(1);
    await startIn(projects[0].id, 'start');
    const [first] = conversations.list({ projectId: projects[0].id });
    runner.runs[0].emit({ type: 'turn', costUsd: 1 });
    // The idle run keeps its slot, so a second Start is refused.
    await expect(startIn(projects[1].id, 'start')).rejects.toEqual(
      new NotAllowedError(capMessage(1, 'T1 (waiting on you)')),
    );

    await conversations.reply(first.id, 'More', 'user');

    expect(conversations.capacity().machine.slotsHeld).toBe(1);
  });

  it('frees the slot when the run ends', async () => {
    const { conversations, runner, projects, startIn } = setup();
    await startIn(projects[0].id, 'start');

    runner.runs[0].emit({ type: 'exit' });

    expect(conversations.capacity().machine.slotsHeld).toBe(0);
  });
});

describe('A run waiting on the User keeps its slot (ADR 0049)', () => {
  const pullRequest = 'https://github.com/acme/site/pull/12';

  /** A Start of the User's on a fresh Ticket of `projectId`, and its Ticket. */
  const startOn = async (
    world: ReturnType<typeof setup>,
    projectId: number,
  ) => {
    const ticket = world.tickets.createTicket({ projectId, title: 'Work' });
    const conversation = await world.conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
    });
    return {
      ticket,
      conversation,
      run: world.runner.runs[world.runner.runs.length - 1],
    };
  };

  /** Puts the Ticket in Review: In progress with a PR and no Claim. */
  const handOff = (world: ReturnType<typeof setup>, number: number) => {
    world.tickets.updateTicket(number, { status: 'In progress' });
    world.tickets.addExternalReferences(number, [pullRequest]);
  };

  it('keeps the slot of an idle Start, and refuses a Start beyond the cap while it waits', async () => {
    const world = setup(1);
    const { run } = await startOn(world, world.projects[0].id);

    run.emit({ type: 'turn', costUsd: 1 });

    expect(world.conversations.capacity().machine.slotsHeld).toBe(1);
    expect(run.closed).toBe(false);
    await expect(startOn(world, world.projects[1].id)).rejects.toEqual(
      new NotAllowedError(capMessage(1, 'T1 (waiting on you)')),
    );
  });

  it('counts an idle Start against its Project limit', async () => {
    const world = setup(9);
    world.tickets.setProjectAgentSettings(world.projects[0].id, {
      parallelRuns: false,
    });
    const { run } = await startOn(world, world.projects[0].id);
    run.emit({ type: 'turn', costUsd: 1 });

    expect(
      world.conversations.capacity(world.projects[0].id).project.slotsHeld,
    ).toBe(1);
    await expect(startOn(world, world.projects[0].id)).rejects.toBeInstanceOf(
      NotAllowedError,
    );
  });

  it('accepts the User’s reply into an idle run at the cap without raising the count', async () => {
    const world = setup(1);
    const { conversation, run } = await startOn(world, world.projects[0].id);
    run.emit({ type: 'turn', costUsd: 1 });

    await world.conversations.reply(conversation.id, 'Yes', 'user');

    expect(run.sent).toContain('Yes');
    expect(world.conversations.capacity().machine.slotsHeld).toBe(1);
  });

  it('ends the process of a turn that leaves the Ticket in Review, freeing the slot', async () => {
    const world = setup(1);
    const { ticket, conversation, run } = await startOn(
      world,
      world.projects[0].id,
    );
    handOff(world, ticket.number);

    run.emit({ type: 'turn', costUsd: 1 });

    expect(run.closed).toBe(true);
    expect(world.conversations.capacity().machine.slotsHeld).toBe(0);
    expect(world.conversations.get(conversation.id)).toMatchObject({
      state: 'idle',
      hidden: false,
    });
    const { live } = conversationActivity(world.conversations.activityRows());
    expect(
      laneOf(world.tickets.getTicket(ticket.number), live[ticket.number]),
    ).toEqual({ lane: 'In progress', section: 'Review' });
    await startOn(world, world.projects[1].id);
    expect(world.conversations.capacity().machine.slotsHeld).toBe(1);
  });

  it('ends the process of a turn that leaves the Ticket Done', async () => {
    const world = setup(1);
    const { ticket, run } = await startOn(world, world.projects[0].id);
    world.tickets.completeTicket(ticket.number);

    run.emit({ type: 'turn', costUsd: 1 });

    expect(run.closed).toBe(true);
    expect(world.conversations.capacity().machine.slotsHeld).toBe(0);
  });

  it('keeps the slot of a turn that ends with a PR while its Claim is still held', async () => {
    const world = setup(1);
    const { ticket, run } = await startOn(world, world.projects[0].id);
    handOff(world, ticket.number);
    world.tickets.claimTicket(ticket.number, { agentRunId: 'r1' });

    run.emit({ type: 'turn', costUsd: 1 });

    expect(run.closed).toBe(false);
    expect(world.conversations.capacity().machine.slotsHeld).toBe(1);
  });

  it('resumes the stored session on Approve merge and on a reply after a handoff', async () => {
    const world = setup(9);
    const { ticket, conversation, run } = await startOn(
      world,
      world.projects[0].id,
    );
    run.emit({ type: 'session', sessionId: 'sdk-1' });
    handOff(world, ticket.number);
    run.emit({ type: 'turn', costUsd: 1 });

    const merged = await world.conversations.approveMerge({
      ticketNumber: ticket.number,
    });

    expect(merged.id).toBe(conversation.id);
    expect(world.runner.runs).toHaveLength(2);
    expect(world.runner.runs[1].options.resume).toBe('sdk-1');
    expect(world.conversations.capacity().machine.slotsHeld).toBe(1);

    world.runner.runs[1].emit({ type: 'turn', costUsd: 1 });
    await world.conversations.reply(conversation.id, 'And?', 'user');
    expect(world.runner.runs).toHaveLength(3);
    expect(world.runner.runs[2].options.resume).toBe('sdk-1');
  });

  it('refuses Approve merge at the cap when the Start it resumes has no process', async () => {
    const world = setup(1);
    const { ticket, run } = await startOn(world, world.projects[0].id);
    handOff(world, ticket.number);
    run.emit({ type: 'turn', costUsd: 1 });
    await startOn(world, world.projects[1].id);

    await expect(
      world.conversations.approveMerge({ ticketNumber: ticket.number }),
    ).rejects.toEqual(new NotAllowedError(capMessage(1, 'T2')));
  });

  it('gives an interrupted Conversation no slot, and resumes it on the User’s reply at the cap', async () => {
    const world = setup(1);
    const { conversation } = await startOn(world, world.projects[0].id);
    const restarted = world.restart();
    restarted.interruptStale();
    expect(restarted.get(conversation.id).state).toBe('interrupted');
    expect(restarted.capacity().machine.slotsHeld).toBe(0);
    const other = world.tickets.createTicket({
      projectId: world.projects[1].id,
      title: 'Other',
    });
    await restarted.start({
      startedBy: 'user',
      ticketNumber: other.number,
      intent: 'start',
      prompt: 'Go',
    });

    await restarted.reply(conversation.id, 'Go on', 'user');

    expect(restarted.get(conversation.id).state).toBe('running');
  });

  it('frees an idle Start’s slot when the User closes it', async () => {
    const world = setup(1);
    const { conversation, run } = await startOn(world, world.projects[0].id);
    run.emit({ type: 'turn', costUsd: 1 });

    await world.conversations.close(conversation.id);

    expect(world.conversations.capacity().machine.slotsHeld).toBe(0);
  });

  it('frees an idle Start’s slot when the User stops it', async () => {
    const world = setup(1);
    const { conversation, run } = await startOn(world, world.projects[0].id);
    run.emit({ type: 'turn', costUsd: 1 });

    await world.conversations.stop(conversation.id);

    expect(world.conversations.capacity().machine.slotsHeld).toBe(0);
  });

  it('frees an idle Start’s slot when its Ticket goes Back to Todo', async () => {
    const world = setup(1);
    const { ticket, conversation, run } = await startOn(
      world,
      world.projects[0].id,
    );
    world.tickets.updateTicket(ticket.number, { status: 'In progress' });
    run.emit({ type: 'turn', costUsd: 1 });

    world.tickets.backToTodo(ticket.number);

    expect(run.closed).toBe(true);
    expect(world.conversations.capacity().machine.slotsHeld).toBe(0);
    expect(world.conversations.get(conversation.id).state).toBe('idle');
  });

  it('ends the process at the turn’s end when its Ticket goes Back to Todo mid-turn', async () => {
    const world = setup(1);
    const { ticket, run } = await startOn(world, world.projects[0].id);
    world.tickets.updateTicket(ticket.number, { status: 'In progress' });
    world.tickets.backToTodo(ticket.number);
    expect(run.closed).toBe(false);

    run.emit({ type: 'turn', costUsd: 1 });

    expect(run.closed).toBe(true);
    expect(world.conversations.capacity().machine.slotsHeld).toBe(0);
  });
});

describe('Autopilot’s headroom counts every live Agent process (T1329)', () => {
  it('counts the slot holders, the User’s own live runs and open Terminal Conversations', async () => {
    const world = setup(9);
    const { conversations, runner, tickets, projects, startIn } = world;
    await startIn(projects[0].id, 'start');
    expect(conversations.capacity().liveProcessCount).toBe(1);

    await startIn(projects[0].id, 'ask');
    await startIn(projects[0].id, 'triage');
    const idea = tickets.createTicket({
      projectId: projects[0].id,
      title: 'Idea',
    });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: idea.number,
      intent: 'spec',
      prompt: 'Spec it',
    });
    // An idle run of the User's own is a live process too.
    runner.runs[1].emit({ type: 'turn', costUsd: 0 });
    expect(conversations.capacity().liveProcessCount).toBe(4);

    await startIn(projects[1].id, 'start', 'terminal');
    expect(conversations.capacity().liveProcessCount).toBe(5);
    // Only the slot holders count against the cap for refusals.
    expect(conversations.capacity().machine.slotsHeld).toBe(1);
  });

  it('stops counting a Terminal Conversation when the CLI reports its end', async () => {
    const { conversations, projects, startIn } = setup(9);
    const session = await startIn(projects[0].id, 'start', 'terminal');
    expect(conversations.capacity().liveProcessCount).toBe(1);

    await conversations.endTerminal(
      (session as { conversationId: number }).conversationId,
      { exitCode: 0 },
    );

    expect(conversations.capacity().liveProcessCount).toBe(0);
  });

  it('stops counting the User’s own run when they close it', async () => {
    const { conversations, projects, startIn } = setup(9);
    const ask = await startIn(projects[0].id, 'ask');

    await conversations.close((ask as { id: number }).id);

    expect(conversations.capacity().liveProcessCount).toBe(0);
  });

  it('leaves out a Triage Autopilot started once its turn ends', async () => {
    const { conversations, runner, projects, startIn } = setup(9);
    await startIn(projects[0].id, 'triage', 'autopilot');
    expect(conversations.capacity().liveProcessCount).toBe(1);

    runner.runs[0].emit({ type: 'turn', costUsd: 0 });

    expect(conversations.capacity().liveProcessCount).toBe(0);
  });

  it('never refuses the User’s own Conversations or a Terminal one at the cap, and refuses a Start only by slot holders', async () => {
    const { conversations, projects, startIn } = setup(1);
    await startIn(projects[0].id, 'ask');
    await startIn(projects[0].id, 'triage');
    await startIn(projects[1].id, 'start', 'terminal');

    // The User's own runs and the Terminal one hold no slot: a Start goes.
    await startIn(projects[0].id, 'start');

    await startIn(projects[1].id, 'ask');
    await startIn(projects[1].id, 'triage');
    await startIn(projects[0].id, 'start', 'terminal');
    expect(conversations.capacity().machine.slotsHeld).toBe(1);
    expect(conversations.capacity().liveProcessCount).toBe(7);
  });
});

describe('Parallel runs and the Machine cap, the one number (T1330)', () => {
  it('limits a Project with Parallel runs on only by the Machine cap', async () => {
    const { conversations, projects, startIn } = setup(4);
    for (let i = 0; i < 4; i += 1) {
      await startIn(projects[0].id, 'start');
    }

    await expect(startIn(projects[0].id, 'start')).rejects.toEqual(
      new NotAllowedError(capMessage(4, 'T1, T2, T3 and T4')),
    );
    expect(conversations.capacity(projects[0].id).project.slotsHeld).toBe(4);
  });

  it('allows one slot-holding Start or Merge with Parallel runs off', async () => {
    const { conversations, runner, projects, startIn, tickets } = setup(9);
    tickets.setProjectAgentSettings(projects[0].id, { parallelRuns: false });
    await startIn(projects[0].id, 'start');
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    const ticket = tickets.createTicket({
      projectId: projects[0].id,
      title: 'Ship',
    });
    tickets.updateTicket(ticket.number, { status: 'In progress' });
    tickets.addExternalReferences(ticket.number, [
      'https://github.com/acme/site/pull/12',
    ]);

    await expect(startIn(projects[0].id, 'start')).rejects.toBeInstanceOf(
      NotAllowedError,
    );
    await expect(
      conversations.approveMerge({ ticketNumber: ticket.number }),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });
});

describe('A refusal names the Conversations holding the slots (T1331)', () => {
  it('names each slot holder’s Ticket at the cap and marks those waiting on the User', async () => {
    const { conversations, runner, projects, startIn, tickets } = setup(3);
    await startIn(projects[0].id, 'start');
    await startIn(projects[1].id, 'start');
    await startIn(projects[0].id, 'start');
    // T1 ends its turn waiting on a reply, T3 waits on a permission.
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    void runner.runs[2].options.askPermission({
      toolName: 'Bash',
      input: {},
      rules: [],
    });
    const ticket = tickets.createTicket({
      projectId: projects[1].id,
      title: 'Next',
    });

    await expect(
      conversations.start({
        startedBy: 'user',
        ticketNumber: ticket.number,
        intent: 'start',
        prompt: 'Go',
      }),
    ).rejects.toEqual(
      new NotAllowedError(
        capMessage(3, 'T1 (waiting on you), T2 and T3 (waiting on you)'),
      ),
    );
  });

  it('names the Project’s slot holder when Parallel runs is off', async () => {
    const { runner, projects, startIn, tickets } = setup(9);
    tickets.setProjectAgentSettings(projects[0].id, { parallelRuns: false });
    await startIn(projects[0].id, 'start');
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });

    await expect(startIn(projects[0].id, 'start')).rejects.toEqual(
      new NotAllowedError(
        'This Project already has a Start run working: T1 (waiting on you). Answer, stop or close it first, or turn on Parallel runs in the Project settings to allow more.',
      ),
    );
  });

  it('names a slot holder without a Ticket by its Conversation', async () => {
    const { conversations, projects } = setup(1);
    const held = await conversations.start({
      startedBy: 'user',
      projectId: projects[0].id,
      intent: 'start',
      prompt: 'Go',
    });

    await expect(
      conversations.start({
        startedBy: 'user',
        projectId: projects[1].id,
        intent: 'start',
        prompt: 'Go',
      }),
    ).rejects.toEqual(
      new NotAllowedError(capMessage(1, `Conversation ${held.id}`)),
    );
  });
});

describe('The live processes split into working and waiting on the User (T1332)', () => {
  it('counts idle and permission-waiting runs as waiting, the rest as working', async () => {
    const { conversations, runner, projects, startIn } = setup(9);
    await startIn(projects[0].id, 'start');
    await startIn(projects[0].id, 'start');
    await startIn(projects[1].id, 'ask');
    await startIn(projects[1].id, 'start', 'terminal');
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    void runner.runs[2].options.askPermission({
      toolName: 'Bash',
      input: {},
      rules: [],
    });

    expect(conversations.capacity().liveProcesses).toEqual({
      working: 2,
      waiting: 2,
    });
    expect(conversations.capacity().liveProcessCount).toBe(4);
  });
});

describe('An Epic’s Start and its children’s moves (ADR 0049)', () => {
  /** An idle Start on an Epic with two In progress children. */
  const epicRun = async () => {
    const world = setup(9);
    const { tickets, conversations, runner, projects } = world;
    const epic = tickets.createTicket({
      projectId: projects[0].id,
      title: 'Epic',
      type: 'Epic',
    });
    const children = ['One', 'Two'].map((title) => {
      const child = tickets.createTicket({
        projectId: projects[0].id,
        title,
        epicNumber: epic.number,
      });
      tickets.updateTicket(child.number, { status: 'In progress' });
      return child;
    });
    await conversations.start({
      startedBy: 'user',
      ticketNumber: epic.number,
      intent: 'start',
      prompt: 'Go',
    });
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    return { ...world, epic, children, run: runner.runs[0] };
  };

  it('keeps the Epic’s run when one child goes Back to Todo', async () => {
    const { tickets, conversations, children, run } = await epicRun();

    tickets.backToTodo(children[0].number);

    expect(run.closed).toBe(false);
    expect(conversations.capacity().machine.slotsHeld).toBe(1);
  });

  it('ends the Epic’s run when the Epic goes Back to Todo', async () => {
    const { tickets, conversations, epic, run } = await epicRun();

    tickets.backToTodo(epic.number);

    expect(run.closed).toBe(true);
    expect(conversations.capacity().machine.slotsHeld).toBe(0);
  });

  it('ends the Epic’s run when the Epic is Done', async () => {
    const { tickets, conversations, epic, run } = await epicRun();

    tickets.completeTicket(epic.number);

    expect(run.closed).toBe(true);
    expect(conversations.capacity().machine.slotsHeld).toBe(0);
  });
});

describe('Auto-triage’s working Triage run (T1384)', () => {
  it('agrees with the Project’s working Triage Conversations read from the database', async () => {
    const { conversations, runner, projects, tickets } = setup(9);
    const projectId = projects[0].id;
    const triage = (inProject: number, startedBy: 'user' | 'autopilot') =>
      conversations.start({
        startedBy,
        ticketNumber: tickets.createTicket({
          projectId: inProject,
          title: 'Idea',
        }).number,
        intent: 'triage',
        prompt: 'Go',
      });
    const fromList = () =>
      conversations
        .list({ projectId })
        .find(
          (conversation) =>
            conversation.intent === 'triage' &&
            (conversation.state === 'running' ||
              conversation.state === 'waiting'),
        )?.id ?? null;
    const seen: (number | null)[] = [];
    const agree = () => {
      const working = conversations.capacity(projectId).project.triageRunning;
      expect(working).toBe(fromList());
      seen.push(working);
    };

    agree();
    const first = await triage(projectId, 'autopilot');
    agree();
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    agree();
    const second = await triage(projectId, 'user');
    agree();
    void runner.runs[1].options.askPermission({
      toolName: 'Bash',
      input: {},
      rules: [],
    });
    agree();
    runner.runs[1].emit({ type: 'exit' });
    agree();
    const ticket = tickets.createTicket({ projectId, title: 'In a terminal' });
    const terminal = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'triage',
    });
    agree();
    await triage(projects[1].id, 'user');
    agree();

    expect(seen).toEqual([
      null,
      first.id,
      null,
      second.id,
      second.id,
      null,
      terminal.conversationId,
      terminal.conversationId,
    ]);
  });
});
