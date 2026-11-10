import { describe, expect, it, vi } from 'vitest';

import { createAutopilot } from '../autopilot/autopilot';
import { createTestConversations } from '../test/conversations';
import { type Change, createChangeChannel } from '../tickets/changes';
import { createTickets } from '../tickets/tickets';
import type { Notice } from './notice';
import { createNotices } from './notices';

const request = {
  toolName: 'Bash',
  input: { command: 'npm test' },
  rules: [] as string[],
};

function setup(now?: () => Date) {
  const changes = createChangeChannel();
  const world = createTestConversations(changes);
  const { tickets, conversations } = world;
  // The factory's own actions on Tickets, as the MCP route records them.
  const agentTickets = createTickets(world.db, 'agent', changes);
  const project = tickets.createProject({ name: 'Website' });
  tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
    parallelRuns: true,
  });
  const notices = createNotices({ conversations, tickets, changes, now });
  const raised = vi.fn();
  changes.subscribe((change) => {
    if (change.type === 'notice') {
      raised(change.notice);
    }
  });
  const startRun = async (
    title = 'Fix the footer',
    intent: 'start' | 'merge' | 'triage' = 'start',
  ) => {
    const ticket = tickets.createTicket({ projectId: project.id, title });
    tickets.updateTicket(ticket.number, { status: 'In progress' });
    const conversation = await conversations.start({
      startedBy: 'user',
      ticketNumber: ticket.number,
      intent,
      prompt: 'Go',
    });
    return {
      ticket,
      conversation,
      run: world.runner.runs[world.runner.runs.length - 1],
    };
  };
  return {
    ...world,
    agentTickets,
    changes,
    project,
    notices,
    raised,
    startRun,
  };
}

const notStalled = (world: { raised: { mock: { calls: unknown[][] } } }) =>
  world.raised.mock.calls.filter(
    ([notice]) => (notice as { kind: string }).kind !== 'stalled',
  );

describe('Notices', () => {
  describe('Ticket kinds', () => {
    const pr = (n: number) => `https://github.com/acme/site/pull/${n}`;
    const inProgress = (world: ReturnType<typeof setup>, title = 'Ship it') => {
      const ticket = world.tickets.createTicket({
        projectId: world.project.id,
        title,
      });
      world.agentTickets.updateTicket(ticket.number, { status: 'In progress' });
      return ticket;
    };
    const kinds = (world: ReturnType<typeof setup>, kind: string) =>
      world.raised.mock.calls
        .map(([notice]) => notice)
        .filter((notice) => notice.kind === kind);

    it('raises merge once at the Merge gate and again for a new PR', () => {
      const world = setup();
      const ticket = inProgress(world);
      world.notices.start();

      world.tickets.updateTicket(ticket.number, {
        addExternalReferences: [pr(1)],
      });
      world.changes.publish({ type: 'project', id: world.project.id });

      expect(kinds(world, 'merge')).toEqual([
        {
          kind: 'merge',
          key: `merge:${ticket.number}:${pr(1)}`,
          projectId: world.project.id,
          ticketNumber: ticket.number,
          conversationId: null,
          title: `T${ticket.number} is ready to merge`,
          body: 'Ship it',
          path: `/project/${world.project.id}?ticket=${ticket.number}`,
        },
      ]);

      world.tickets.updateTicket(ticket.number, {
        addExternalReferences: [pr(2)],
      });
      expect(kinds(world, 'merge')).toHaveLength(2);
    });

    describe('auto_merged', () => {
      /** A Ticket an Agent run claimed with Auto-merge on and opened a PR for. */
      const autoMergeable = (
        world: ReturnType<typeof setup>,
        extra: { type?: 'Epic'; autoMerge?: boolean } = {},
      ) => {
        world.tickets.setProjectAgentSettings(world.project.id, {
          autoMerge: extra.autoMerge ?? true,
        });
        const ticket = world.tickets.createTicket({
          projectId: world.project.id,
          title: 'Ship it',
          ...(extra.type ? { type: extra.type } : {}),
        });
        if (extra.type === 'Epic') {
          world.tickets.createTicket({
            projectId: world.project.id,
            title: 'Child',
            epicNumber: ticket.number,
          });
        }
        world.agentTickets.claimTicket(ticket.number, { agentRunId: 'r1' });
        world.agentTickets.updateTicket(ticket.number, {
          addExternalReferences: [pr(5)],
        });
        return ticket;
      };

      it('raises one naming the Ticket and its PR when an Agent completes it through an auto-merge', () => {
        const world = setup();
        const ticket = autoMergeable(world);
        world.notices.start();

        world.agentTickets.completeTicket(ticket.number);

        const [notice] = kinds(world, 'auto_merged');
        expect(kinds(world, 'auto_merged')).toHaveLength(1);
        expect(notice).toMatchObject({
          kind: 'auto_merged',
          projectId: world.project.id,
          ticketNumber: ticket.number,
          conversationId: null,
          title: `T${ticket.number} was merged by an Agent`,
          body: `Ship it: ${pr(5)}`,
          path: `/project/${world.project.id}?ticket=${ticket.number}`,
        });
        expect(notice.key).toMatch(`auto_merged:${ticket.number}:`);
      });

      it('raises one for an Epic, not for its children', () => {
        const world = setup();
        const epic = autoMergeable(world, { type: 'Epic' });
        world.notices.start();

        world.agentTickets.completeTicket(epic.number);

        expect(
          kinds(world, 'auto_merged').map(({ ticketNumber }) => ticketNumber),
        ).toEqual([epic.number]);
      });

      it('raises none for the Merged button, even on a Claim taken with Auto-merge on', () => {
        const world = setup();
        const ticket = autoMergeable(world);
        world.notices.start();

        world.tickets.completeTicket(ticket.number);

        expect(kinds(world, 'auto_merged')).toEqual([]);
      });

      it('raises none for Approve merge, which finishes a handed-off Ticket without a Claim', () => {
        const world = setup();
        const ticket = autoMergeable(world, { autoMerge: false });
        world.agentTickets.releaseTicketClaim(ticket.number, {
          agentRunId: 'r1',
        });
        world.notices.start();

        world.agentTickets.completeTicket(ticket.number);

        expect(kinds(world, 'auto_merged')).toEqual([]);
      });

      it('raises none for a Claim taken with Auto-merge off, even if it is on by the merge', () => {
        const world = setup();
        const ticket = autoMergeable(world, { autoMerge: false });
        world.tickets.setProjectAgentSettings(world.project.id, {
          autoMerge: true,
        });
        world.notices.start();

        world.agentTickets.completeTicket(ticket.number);

        expect(kinds(world, 'auto_merged')).toEqual([]);
      });

      it('raises none for an auto-merge before the server started', () => {
        const world = setup();
        const ticket = autoMergeable(world);
        world.agentTickets.completeTicket(ticket.number);
        world.notices.start();

        world.changes.publish({ type: 'project', id: world.project.id });

        expect(kinds(world, 'auto_merged')).toEqual([]);
      });
    });

    it('raises no merge for what is at the gate when the server starts,', () => {
      const world = setup();
      const gated = inProgress(world, 'Gated');
      world.tickets.updateTicket(gated.number, {
        addExternalReferences: [pr(1)],
      });
      world.notices.start();
      world.changes.publish({ type: 'project', id: world.project.id });
      expect(world.raised).not.toHaveBeenCalled();
    });

    it('raises stalled once when a Ticket has no Claim, PR or Conversation', () => {
      vi.useFakeTimers();
      try {
        const world = setup();
        const ticket = inProgress(world);
        world.tickets.claimTicket(ticket.number, { agentRunId: 'r1' });
        world.notices.start();

        vi.advanceTimersByTime(5000);
        world.agentTickets.releaseTicketClaim(ticket.number, {
          agentRunId: 'r1',
        });
        world.changes.publish({ type: 'project', id: world.project.id });

        const [notice] = kinds(world, 'stalled');
        expect(kinds(world, 'stalled')).toHaveLength(1);
        expect(notice).toMatchObject({
          title: `T${ticket.number} is stalled`,
          ticketNumber: ticket.number,
          path: `/project/${world.project.id}?ticket=${ticket.number}`,
        });
        expect(notice.key).toMatch(`stalled:${ticket.number}:`);
      } finally {
        vi.useRealTimers();
      }
    });

    it('raises no stalled when the User releases the claim, and again after the factory stalls it', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const world = setup();
        const ticket = inProgress(world);
        world.agentTickets.claimTicket(ticket.number, { agentRunId: 'r1' });
        world.notices.start();

        vi.advanceTimersByTime(5000);
        world.tickets.releaseTicketClaim(ticket.number, { agentRunId: 'r1' });
        world.changes.publish({ type: 'project', id: world.project.id });
        expect(kinds(world, 'stalled')).toEqual([]);

        vi.advanceTimersByTime(5000);
        world.agentTickets.claimTicket(ticket.number, { agentRunId: 'r2' });
        vi.advanceTimersByTime(5000);
        world.agentTickets.releaseTicketClaim(ticket.number, {
          agentRunId: 'r2',
        });
        expect(kinds(world, 'stalled')).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("raises no stalled when the User closes the Ticket's Conversation", async () => {
      const world = setup();
      const ticket = inProgress(world);
      const conversation = await world.conversations.start({
        startedBy: 'user',
        ticketNumber: ticket.number,
        intent: 'start',
        prompt: 'Go',
      });
      world.notices.start();

      await world.conversations.close(conversation.id);
      world.changes.publish({ type: 'project', id: world.project.id });

      expect(kinds(world, 'stalled')).toEqual([]);
    });

    it('raises stalled for a Ticket whose PR is not Review, but not one with a PR', () => {
      const world = setup();
      const reviewed = inProgress(world, 'Reviewed');
      world.tickets.updateTicket(reviewed.number, {
        addExternalReferences: [pr(3)],
      });
      world.notices.start();
      const stalled = inProgress(world, 'Stuck');

      expect(kinds(world, 'stalled').map((n) => n.ticketNumber)).toEqual([
        stalled.number,
      ]);
    });

    it('raises triage once per pending proposal, and again for a new one', () => {
      const world = setup();
      const ticket = world.tickets.createTicket({
        projectId: world.project.id,
        title: 'Sort me',
      });
      world.notices.start();

      const first = world.tickets.proposeTriage(ticket.number, {
        category: 'bug',
        state: 'ready-for-agent',
        reasoning: 'Clear',
      });
      world.changes.publish({ type: 'project', id: world.project.id });

      expect(kinds(world, 'triage')).toEqual([
        {
          kind: 'triage',
          key: `triage:${first.id}`,
          projectId: world.project.id,
          ticketNumber: ticket.number,
          conversationId: null,
          title: `T${ticket.number} has a triage proposal`,
          body: 'Sort me: bug, ready-for-agent',
          path: `/project/${world.project.id}?ticket=${ticket.number}`,
        },
      ]);

      world.tickets.rejectTriage(first.id);
      world.tickets.proposeTriage(ticket.number, {
        category: 'enhancement',
        state: 'ready-for-human',
        reasoning: 'Again',
      });
      expect(kinds(world, 'triage')).toHaveLength(2);
    });

    it('opens the Ticket over the Cycle Board it shows on', () => {
      const world = setup();
      const ticket = world.tickets.createTicket({
        projectId: world.project.id,
        title: 'Planned',
      });
      const cycle = world.tickets.createCycle({
        projectId: world.project.id,
        title: 'Goal',
      });
      world.tickets.planTicket({ cycleId: cycle.id, number: ticket.number });
      world.notices.start();

      world.tickets.proposeTriage(ticket.number, {
        category: 'bug',
        state: 'needs-info',
        reasoning: 'Why',
      });

      expect(kinds(world, 'triage')[0].path).toBe(
        `/project/${world.project.id}/cycle/${cycle.id}?ticket=${ticket.number}`,
      );
    });
  });

  it('raises waiting once for a pending permission, with its title, body and path', async () => {
    const world = setup();
    const { run, conversation, ticket } = await world.startRun();
    world.notices.start();

    void run.options.askPermission(request);

    expect(world.raised).toHaveBeenCalledTimes(1);
    const entry = world.conversations.transcript(conversation.id).at(-1);
    expect(world.raised).toHaveBeenCalledWith({
      kind: 'waiting',
      key: `waiting:${conversation.id}:${entry?.id}`,
      projectId: world.project.id,
      ticketNumber: ticket.number,
      conversationId: conversation.id,
      title: `T${ticket.number} is waiting for you`,
      body: 'Fix the footer: Bash {"command":"npm test"}',
      path: `/project/${world.project.id}?conversation=${conversation.id}`,
    });

    // Persisting through further changes raises nothing again.
    run.emit({ type: 'agent', text: 'Still here' });
    world.changes.publish({ type: 'conversation', id: conversation.id });
    expect(world.raised).toHaveBeenCalledTimes(1);
  });

  it('raises again for a new pending entry', async () => {
    const world = setup();
    const { run, conversation } = await world.startRun();
    world.notices.start();

    const first = run.options.askPermission(request);
    const entry = world.conversations.transcript(conversation.id).at(-1);
    await world.conversations.answerPermission(entry?.id ?? 0, 'allow');
    await first;
    void run.options.askPermission(request);

    expect(world.raised).toHaveBeenCalledTimes(2);
    const keys = world.raised.mock.calls.map(([notice]) => notice.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("opens a Spar's own page from its waiting Notice", async () => {
    const world = setup();
    const conversation = await world.conversations.start({
      startedBy: 'user',
      projectId: world.project.id,
      intent: 'spar',
      prompt: '/tandembike:spar',
    });
    world.notices.start();

    void world.runner.runs[0].options.askWidget({
      kind: 'choice',
      prompt: 'Which mode?',
      options: [{ label: 'Diverge' }, { label: 'Converge' }],
      multiSelect: false,
    });

    expect(world.raised).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'waiting',
        path: `/project/${world.project.id}/spar/${conversation.id}`,
      }),
    );
  });

  it('raises waiting for a Widget of the Agent', async () => {
    const world = setup();
    const { run } = await world.startRun();
    world.notices.start();

    void run.options.askWidget({
      kind: 'choice',
      prompt: 'Which colour?',
      options: [{ label: 'Red' }],
      multiSelect: false,
    });

    expect(world.raised).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'waiting',
        body: 'Fix the footer: Which colour?',
      }),
    );
  });

  it('raises nothing for what already waits when the server starts', async () => {
    const world = setup();
    const { run } = await world.startRun();
    void run.options.askPermission(request);

    world.notices.start();
    world.changes.publish({ type: 'project', id: world.project.id });

    expect(world.raised).not.toHaveBeenCalled();
  });

  it('raises needs_reply once when a Start run ends needing a reply', async () => {
    const world = setup();
    const { run, conversation, ticket } = await world.startRun();
    world.notices.start();

    run.emit({ type: 'turn', costUsd: 0.1 });
    run.emit({ type: 'agent', text: 'late' });
    world.changes.publish({ type: 'conversation', id: conversation.id });

    expect(world.raised).toHaveBeenCalledTimes(1);
    const outcome = world.conversations.latestRunOutcome(conversation.id);
    expect(world.raised).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'needs_reply',
        key: `needs_reply:${conversation.id}:${outcome?.id}`,
        title: `T${ticket.number} needs a reply`,
        body: 'Fix the footer',
        path: `/project/${world.project.id}?conversation=${conversation.id}`,
      }),
    );
  });

  it('raises needs_reply for a substantive failure with its error', async () => {
    const world = setup();
    const { run, ticket } = await world.startRun();
    world.notices.start();

    run.emit({ type: 'turn', costUsd: 0, error: 'Hit the max turns' });
    expect(world.raised).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'needs_reply',
        title: `T${ticket.number} failed`,
        body: 'Fix the footer: Hit the max turns',
      }),
    );
  });

  it('raises nothing for a transient failure, which Autopilot resumes', async () => {
    const world = setup();
    const { run } = await world.startRun();
    world.notices.start();

    run.emit({ type: 'turn', costUsd: 0, error: 'API Error: 529 overloaded' });

    expect(world.raised).not.toHaveBeenCalled();
  });

  it('raises needs_reply for a Merge run but not for a Triage run or a stop', async () => {
    const world = setup();
    const merge = await world.startRun('Merge it', 'merge');
    const triage = await world.startRun('Triage it', 'triage');
    const stopped = await world.startRun('Stop it');
    world.notices.start();

    triage.run.emit({ type: 'turn', costUsd: 0 });
    await world.conversations.stop(stopped.conversation.id);
    expect(notStalled(world)).toEqual([]);

    merge.run.emit({ type: 'turn', costUsd: 0 });
    expect(notStalled(world)).toHaveLength(1);
  });

  it('raises needs_reply again for a later run end', async () => {
    const world = setup();
    const { run, conversation } = await world.startRun();
    world.notices.start();

    run.emit({ type: 'turn', costUsd: 0 });
    await world.conversations.reply(conversation.id, 'More', 'user');
    world.runner.runs[0].emit({ type: 'turn', costUsd: 0 });

    expect(world.raised).toHaveBeenCalledTimes(2);
  });

  it('raises nothing for a closed Conversation', async () => {
    const world = setup();
    const { run, conversation } = await world.startRun();
    world.notices.start();

    await world.conversations.close(conversation.id);
    run.emit({ type: 'turn', costUsd: 0 });

    // Closing leaves the Ticket Stalled, which is news of another kind.
    expect(notStalled(world)).toEqual([]);
  });

  it('stops raising after the returned function is called', async () => {
    const world = setup();
    const { run } = await world.startRun();
    const stop = world.notices.start();

    stop();
    void run.options.askPermission(request);

    expect(world.raised).not.toHaveBeenCalled();
  });
});

describe('ceiling Notices', () => {
  const ofKind = (world: { raised: { mock: { calls: unknown[][] } } }) =>
    world.raised.mock.calls
      .map(([notice]) => notice as Notice)
      .filter((notice) => notice.kind === 'ceiling');
  const poke = (world: ReturnType<typeof setup>) =>
    world.tickets.createTicket({ projectId: world.project.id, title: 'Poke' });

  it('raises once a day when the machine ceiling pauses Autopilot, opening Settings', () => {
    let clock = new Date(2026, 4, 10, 12);
    const world = setup(() => clock);
    world.notices.start();
    vi.spyOn(world.conversations, 'machineBudget').mockReturnValue({
      spendUsd: 5,
      ceilingUsd: 4,
      paused: true,
    });

    poke(world);
    poke(world);

    expect(ofKind(world)).toEqual([
      expect.objectContaining({
        key: 'ceiling:machine:2026-05-10',
        path: '/settings',
        projectId: null,
        body: '$5.00 spent today of $4.00',
      }),
    ]);

    clock = new Date(2026, 4, 11, 0, 1);
    poke(world);
    expect(ofKind(world).map((notice) => notice.key)).toEqual([
      'ceiling:machine:2026-05-10',
      'ceiling:machine:2026-05-11',
    ]);
  });

  it('raises for the triage ceiling and opens the Project Board', () => {
    const world = setup();
    world.notices.start();
    vi.spyOn(world.conversations, 'triageBudget').mockReturnValue({
      spendUsd: 3,
      ceilingUsd: 2,
      paused: true,
    });

    poke(world);
    poke(world);

    expect(ofKind(world)).toEqual([
      expect.objectContaining({
        projectId: world.project.id,
        path: `/project/${world.project.id}`,
        body: '$3.00 spent today of $2.00',
      }),
    ]);
  });

  it("raises for a Project's Spend ceiling on its Active Cycle", () => {
    const world = setup();
    world.tickets.setProjectAgentSettings(world.project.id, {
      autopilot: true,
      spendCeilingUsd: 1,
    });
    const cycle = world.tickets.createCycle({
      projectId: world.project.id,
      title: 'Sprint',
    });
    world.tickets.startCycle(cycle.id);
    world.notices.start();
    vi.spyOn(world.conversations, 'autopilotSpend').mockReturnValue(1.5);

    poke(world);
    poke(world);

    expect(ofKind(world)).toEqual([
      expect.objectContaining({
        projectId: world.project.id,
        path: `/project/${world.project.id}`,
        body: '$1.50 spent of $1.00 on Sprint',
      }),
    ]);
  });

  it('raises nothing under the ceilings', () => {
    const world = setup();
    world.notices.start();
    poke(world);
    expect(ofKind(world)).toEqual([]);
  });
});

describe('Autopilot and notices', () => {
  it('ignores notice changes', async () => {
    const changes = createChangeChannel();
    const world = createTestConversations(changes);
    const getProject = vi.spyOn(world.tickets, 'getProject');
    const failed = vi.spyOn(console, 'error').mockImplementation(() => {});
    const autopilot = createAutopilot({
      tickets: world.tickets,
      conversations: world.conversations,
      changes,
    });
    autopilot.start();
    await autopilot.idle();
    getProject.mockClear();

    const notice: Change = {
      type: 'notice',
      notice: {
        kind: 'waiting',
        key: 'waiting:1:1',
        projectId: 999,
        ticketNumber: null,
        conversationId: 1,
        title: 't',
        body: 'b',
        path: '/',
      },
    };
    changes.publish(notice);
    await autopilot.idle();

    expect(getProject).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });
});
