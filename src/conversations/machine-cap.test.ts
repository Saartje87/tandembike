// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestConversations } from '../test/conversations';
import { NotAllowedError } from '../tickets/errors';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const capMessage = (cap: number) =>
  `The machine runs its cap of ${cap} runs; wait for one to finish or raise the cap in Settings.`;

function setup(cap = 2) {
  const world = createTestConversations();
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
      maxConcurrentRuns: 9,
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
    expect(conversations.machineSlotsInUse()).toBe(0);

    await startIn(projects[0].id, 'start');
    await startIn(projects[1].id, 'start');

    expect(conversations.machineSlotsInUse()).toBe(2);
  });

  it('counts a Merge and a Triage Autopilot started, but not a Triage the User started or an Ask', async () => {
    const { conversations, projects, startIn, tickets } = setup(9);

    await startIn(projects[0].id, 'triage', 'autopilot');
    expect(conversations.machineSlotsInUse()).toBe(1);

    await startIn(projects[0].id, 'triage', 'user');
    await startIn(projects[0].id, 'ask', 'user');
    expect(conversations.machineSlotsInUse()).toBe(1);

    const ticket = tickets.createTicket({
      projectId: projects[1].id,
      title: 'Ship',
    });
    tickets.updateTicket(ticket.number, { status: 'In progress' });
    tickets.addExternalReferences(ticket.number, [
      'https://github.com/acme/site/pull/12',
    ]);
    await conversations.approveMerge({ ticketNumber: ticket.number });
    expect(conversations.machineSlotsInUse()).toBe(2);
  });

  it('leaves out an idle run and a Terminal Conversation', async () => {
    const { conversations, runner, projects, startIn } = setup(9);

    await startIn(projects[0].id, 'start');
    runner.runs[0].emit({ type: 'turn', costUsd: 1 });
    await startIn(projects[1].id, 'start', 'terminal');

    expect(conversations.machineSlotsInUse()).toBe(0);
  });

  it('counts a run waiting on a permission', async () => {
    const { conversations, runner, projects, startIn } = setup(9);
    await startIn(projects[0].id, 'start');

    void runner.runs[0].options.askPermission({
      toolName: 'Bash',
      input: { command: 'ls' },
      rules: [],
    });

    expect(conversations.machineSlotsInUse()).toBe(1);
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
    ).rejects.toEqual(new NotAllowedError(capMessage(2)));
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
    ).rejects.toEqual(new NotAllowedError(capMessage(1)));
  });

  it('does not limit a Triage or an Ask at the cap', async () => {
    const { conversations, projects, startIn } = setup(1);
    await startIn(projects[0].id, 'start');

    await startIn(projects[1].id, 'triage');
    await startIn(projects[1].id, 'ask');

    expect(conversations.machineSlotsInUse()).toBe(1);
  });

  it('never refuses a reply, which may take the machine over its cap', async () => {
    const { conversations, runner, projects, startIn, tickets } = setup(1);
    await startIn(projects[0].id, 'start');
    const [first] = conversations.list({ projectId: projects[0].id });
    runner.runs[0].emit({ type: 'turn', costUsd: 1 });
    await startIn(projects[1].id, 'start');
    expect(conversations.machineSlotsInUse()).toBe(1);

    await conversations.reply(first.id, 'More', 'user');

    expect(conversations.machineSlotsInUse()).toBe(2);
    expect(tickets.getMachineSettings().maxConcurrentRuns).toBe(1);
  });

  it('frees the slot when the run ends', async () => {
    const { conversations, runner, projects, startIn } = setup();
    await startIn(projects[0].id, 'start');

    runner.runs[0].emit({ type: 'turn', costUsd: 1 });

    expect(conversations.machineSlotsInUse()).toBe(0);
  });
});
