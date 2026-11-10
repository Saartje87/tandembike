// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { agentCommandEntries } from '../test/fixtures';
import { createTestSpars } from '../test/spars';
import { NotAllowedError, ValidationError } from '../tickets/errors';
import { createSpars } from './spars';

describe('Starting a Spar', () => {
  it('starts a spar Conversation with the Spar command, its topic and focus, and stores the Spar under its id', async () => {
    const { spars, project, tickets, runner, conversations } =
      createTestSpars();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Faster triage',
    });

    const spar = await spars.startSpar({
      projectId: project.id,
      focusTicketNumber: ticket.number,
      topic: '  Speed it up  ',
    });

    expect(spar).toMatchObject({
      projectId: project.id,
      topic: 'Speed it up',
      focusTicketNumber: ticket.number,
      closed: false,
      outcomeTicketNumber: null,
    });
    const conversation = conversations.get(spar.id);
    expect(conversation).toMatchObject({
      intent: 'spar',
      ticketNumber: ticket.number,
      startedBy: 'user',
    });
    expect(runner.runs[0].options.prompt).toBe(
      `/tandembike:spar "Speed it up" T${ticket.number}`,
    );
    expect(spars.getSpar(spar.id)).toEqual(spar);
  });

  it('starts one about the Project with no topic, using the Project’s own Spar command', async () => {
    const { spars, project, tickets, runner, conversations } =
      createTestSpars();
    tickets.setProjectAgentCommands(
      project.id,
      agentCommandEntries({ sparCommand: '/think' }),
    );

    const spar = await spars.startSpar({ projectId: project.id, topic: ' ' });

    expect(spar.topic).toBeNull();
    expect(spar.focusTicketNumber).toBeNull();
    expect(conversations.get(spar.id).ticketNumber).toBeNull();
    expect(runner.runs[0].options.prompt).toBe('/think');
  });

  it('refuses a focus Ticket of another Project and a topic over one line', async () => {
    const { spars, project, tickets } = createTestSpars();
    const other = tickets.createProject({ name: 'Other' });
    const ticket = tickets.createTicket({ projectId: other.id, title: 'X' });

    await expect(
      spars.startSpar({
        projectId: project.id,
        focusTicketNumber: ticket.number,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      spars.startSpar({ projectId: project.id, topic: 'One\nTwo' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a Project without a repository path, as a Conversation does', async () => {
    const { spars, tickets } = createTestSpars();
    const bare = tickets.createProject({ name: 'Bare' });

    await expect(
      spars.startSpar({ projectId: bare.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(spars.listSpars(bare.id)).toEqual([]);
  });

  it('refuses an archived Project', async () => {
    const { spars, project, tickets } = createTestSpars();
    tickets.archiveProject(project.id);

    await expect(
      spars.startSpar({ projectId: project.id }),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });

  it('announces a spar change', async () => {
    const { spars, project, published } = createTestSpars();

    const spar = await spars.startSpar({ projectId: project.id });

    expect(published).toContainEqual({ type: 'spar', id: spar.id });
  });
});

describe('Listing Spars', () => {
  it('lists a Project’s Spars newest first with topic, focus, state and last activity', async () => {
    const { spars, project, tickets, runner } = createTestSpars();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Faster triage',
    });
    const first = await spars.startSpar({ projectId: project.id, topic: 'A' });
    const second = await spars.startSpar({
      projectId: project.id,
      focusTicketNumber: ticket.number,
    });
    runner.runs[0].emit({ type: 'turn', costUsd: 0.5 });

    const listed = spars.listSpars(project.id);

    expect(listed.map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(listed[0]).toMatchObject({
      topic: null,
      focusTicketNumber: ticket.number,
      focusTitle: 'Faster triage',
      state: 'running',
      closed: false,
    });
    expect(listed[1]).toMatchObject({
      topic: 'A',
      state: 'idle',
      costUsd: 0.5,
    });
    expect(listed[1].lastActivity).toBeInstanceOf(Date);
  });

  it('refuses an unknown Spar', () => {
    const { spars } = createTestSpars();
    expect(() => spars.getSpar(99)).toThrow('There is no Spar 99.');
  });
});

describe('The Canvas of a Spar', () => {
  async function started() {
    const world = createTestSpars();
    const spar = await world.spars.startSpar({ projectId: world.project.id });
    world.published.length = 0;
    return { ...world, spar };
  }

  const titles = (canvas: { columns: { title: string }[] }) =>
    canvas.columns.map(({ title }) => title);

  it('starts with the Columns Ideas, Explore, Keep and Park', async () => {
    const { spars, spar } = await started();

    expect(titles(spars.getCanvas(spar.id))).toEqual([
      'Ideas',
      'Explore',
      'Keep',
      'Park',
    ]);
  });

  it('adds, renames, moves and removes Columns, saved', async () => {
    const { spars, spar } = await started();
    const [ideas, , , park] = spars.getCanvas(spar.id).columns;

    spars.addColumn(spar.id, { title: 'Risks', index: 1 }, 'user');
    spars.renameColumn(spar.id, ideas.id, 'Options', 'user');
    spars.moveColumn(spar.id, ideas.id, 3, 'user');
    spars.removeColumn(spar.id, park.id, 'user');

    expect(titles(spars.getCanvas(spar.id))).toEqual([
      'Risks',
      'Explore',
      'Keep',
      'Options',
    ]);
  });

  it('adds Stickies with their author and Ticket, edits, moves and removes them', async () => {
    const { spars, spar, tickets, project } = await started();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'X' });
    const [ideas, explore] = spars.getCanvas(spar.id).columns;

    spars.addSticky(spar.id, { columnId: ideas.id, title: 'Mine' }, 'user');
    let canvas = spars.addSticky(
      spar.id,
      {
        columnId: ideas.id,
        title: 'Yours',
        note: 'Because',
        ticketNumber: ticket.number,
      },
      'agent',
    );
    const [mine, yours] = canvas.columns[0].stickies;
    expect(yours).toMatchObject({
      title: 'Yours',
      note: 'Because',
      author: 'agent',
      ticketNumber: ticket.number,
    });
    expect(mine.author).toBe('user');

    spars.editSticky(spar.id, mine.id, { title: 'Mine, edited' }, 'user');
    spars.moveSticky(spar.id, mine.id, { columnId: explore.id }, 'user');
    canvas = spars.moveSticky(
      spar.id,
      yours.id,
      { columnId: explore.id, index: 0 },
      'user',
    );
    expect(canvas.columns[1].stickies.map(({ title }) => title)).toEqual([
      'Yours',
      'Mine, edited',
    ]);

    canvas = spars.removeSticky(spar.id, yours.id, 'user');
    expect(canvas.columns[1].stickies.map(({ id }) => id)).toEqual([mine.id]);
    expect(spars.getCanvas(spar.id)).toEqual(canvas);
  });

  it('refuses to remove a Column that holds Stickies, and changes nothing', async () => {
    const { spars, spar } = await started();
    const [ideas] = spars.getCanvas(spar.id).columns;
    spars.addSticky(spar.id, { columnId: ideas.id, title: 'A' }, 'user');
    const before = spars.getCanvas(spar.id);

    expect(() => spars.removeColumn(spar.id, ideas.id, 'user')).toThrow(
      NotAllowedError,
    );
    expect(spars.getCanvas(spar.id)).toEqual(before);
  });

  it('applies a batch all or nothing', async () => {
    const { spars, spar } = await started();
    const [ideas] = spars.getCanvas(spar.id).columns;
    const before = spars.getCanvas(spar.id);

    expect(() =>
      spars.editCanvas(
        spar.id,
        [
          { op: 'addSticky', columnId: ideas.id, title: 'A' },
          { op: 'removeColumn', columnId: ideas.id },
        ],
        'agent',
      ),
    ).toThrow(NotAllowedError);
    expect(spars.getCanvas(spar.id)).toEqual(before);
  });

  it('refuses a link to a Ticket that does not exist', async () => {
    const { spars, spar } = await started();
    const [ideas] = spars.getCanvas(spar.id).columns;

    expect(() =>
      spars.addSticky(
        spar.id,
        { columnId: ideas.id, title: 'A', ticketNumber: 999 },
        'user',
      ),
    ).toThrow('There is no Ticket T999.');
  });

  it('announces a spar change per edit', async () => {
    const { spars, spar, published } = await started();
    const [ideas] = spars.getCanvas(spar.id).columns;

    spars.addSticky(spar.id, { columnId: ideas.id, title: 'A' }, 'user');
    spars.renameColumn(spar.id, ideas.id, 'B', 'user');

    expect(published).toEqual([
      { type: 'spar', id: spar.id },
      { type: 'spar', id: spar.id },
    ]);
  });
});

describe('Turns of a Spar', () => {
  async function started() {
    const world = createTestSpars();
    const spar = await world.spars.startSpar({ projectId: world.project.id });
    const run = world.runner.runs[0];
    const [ideas, explore] = world.spars.getCanvas(spar.id).columns;
    return { ...world, spar, run, ideas, explore };
  }

  it('sends nothing to the run for a Canvas edit', async () => {
    const { spars, spar, run, ideas } = await started();

    spars.addSticky(spar.id, { columnId: ideas.id, title: 'A' }, 'user');

    expect(run.sent).toEqual([]);
  });

  it("tells the Agent, with the User's next message, what changed since its last turn, then starts again from there", async () => {
    const { spars, spar, run, ideas, explore } = await started();
    const canvas = spars.addSticky(
      spar.id,
      { columnId: ideas.id, title: 'A' },
      'user',
    );
    spars.moveSticky(
      spar.id,
      canvas.columns[0].stickies[0].id,
      { columnId: explore.id },
      'user',
    );
    expect(spars.canvasDiff(spar.id)).toEqual([
      'Added Sticky "A" to "Explore"',
    ]);

    await spars.sendTurn(spar.id, 'What do you think?');

    expect(run.sent.at(-1)).toBe(
      'What do you think?\n\nCanvas changes since your last turn:\n- Added Sticky "A" to "Explore"',
    );
    expect(spars.canvasDiff(spar.id)).toEqual([]);
    await spars.sendTurn(spar.id, 'And now?');
    expect(run.sent.at(-1)).toBe('And now?');
  });

  it("leaves the Agent's own edits out of what it is told", async () => {
    const { spars, spar, ideas } = await started();

    spars.addColumn(spar.id, { title: 'Risks' }, 'agent');
    const canvas = spars.addSticky(
      spar.id,
      { columnId: ideas.id, title: 'Its idea' },
      'agent',
    );
    spars.renameColumn(spar.id, ideas.id, 'Options', 'user');
    spars.editSticky(
      spar.id,
      canvas.columns[0].stickies[0].id,
      { note: 'Mine too' },
      'user',
    );

    expect(spars.canvasDiff(spar.id)).toEqual([
      'Renamed Column "Ideas" to "Options"',
      'Edited Sticky "Its idea": note now "Mine too"',
    ]);
  });

  it('sends Your move with only the changes, or says nothing changed', async () => {
    const { spars, spar, run, ideas } = await started();

    await spars.sendTurn(spar.id, '');
    expect(run.sent.at(-1)).toBe(
      'Your move.\n\nThe Canvas has not changed since your last turn.',
    );

    spars.removeColumn(spar.id, ideas.id, 'user');
    await spars.sendTurn(spar.id, '  ');
    expect(run.sent.at(-1)).toBe(
      'Your move.\n\nCanvas changes since your last turn:\n- Removed Column "Ideas"',
    );
  });
});

describe('The Write-up of a Spar', () => {
  it('starts empty and keeps the sections it is given, announcing each change', async () => {
    const { spars, project, published } = createTestSpars();
    const spar = await spars.startSpar({ projectId: project.id });
    expect(spar.writeUp).toEqual({
      decisions: '',
      openQuestions: '',
      nextSteps: '',
    });
    published.length = 0;

    spars.updateWriteUp(spar.id, { decisions: '- Use a cache' }, 'agent');
    const writeUp = spars.updateWriteUp(
      spar.id,
      { nextSteps: ' - Try it ' },
      'user',
    );

    expect(writeUp).toEqual({
      decisions: '- Use a cache',
      openQuestions: '',
      nextSteps: '- Try it',
    });
    expect(spars.getSpar(spar.id).writeUp).toEqual(writeUp);
    expect(published).toHaveLength(2);
  });

  it('refuses an empty update', async () => {
    const { spars, project } = createTestSpars();
    const spar = await spars.startSpar({ projectId: project.id });

    expect(() => spars.updateWriteUp(spar.id, {}, 'user')).toThrow(
      ValidationError,
    );
  });
});

describe('Closing and reopening a Spar', () => {
  async function started() {
    const world = createTestSpars();
    const spar = await world.spars.startSpar({ projectId: world.project.id });
    const run = world.runner.runs[0];
    run.emit({ type: 'session', sessionId: 'sess-1' });
    run.emit({ type: 'turn', costUsd: 0.1 });
    return { ...world, spar, run };
  }

  it('sends Summarise, and closes the Spar and stops its run once that turn ends', async () => {
    const { spars, spar, run, conversations } = await started();

    const closing = await spars.closeSpar(spar.id);

    expect(run.sent.at(-1)).toMatch(/^Summarise: update the Write-up/);
    expect(closing).toMatchObject({ closing: true, closed: false });

    run.emit({ type: 'turn', costUsd: 0.2 });
    await Promise.resolve();

    expect(spars.getSpar(spar.id)).toMatchObject({
      closing: false,
      closed: true,
    });
    expect(conversations.get(spar.id)).toMatchObject({
      state: 'stopped',
      hidden: false,
    });
    expect(spars.listSpars(spar.projectId)[0].closed).toBe(true);
  });

  it('refuses Canvas and Write-up edits and replies on a closed Spar, with a reason', async () => {
    const { spars, spar, run } = await started();
    const [ideas] = spars.getCanvas(spar.id).columns;
    await spars.closeSpar(spar.id);
    run.emit({ type: 'turn', costUsd: 0.2 });

    expect(() =>
      spars.addSticky(spar.id, { columnId: ideas.id, title: 'A' }, 'user'),
    ).toThrow('This Spar is closed. Reopen it to change it.');
    expect(() =>
      spars.updateWriteUp(spar.id, { decisions: 'X' }, 'agent'),
    ).toThrow(NotAllowedError);
    await expect(spars.sendTurn(spar.id, 'Hi')).rejects.toThrow(
      'This Spar is closed. Reopen it to reply.',
    );
  });

  it('expires a Widget left unanswered, so the Summarise turn can run and the Spar close', async () => {
    const { spars, spar, run } = await started();
    const pending = run.options.askWidget({
      kind: 'choice',
      prompt: 'Which mode?',
      options: [{ label: 'Diverge' }, { label: 'Converge' }],
      multiSelect: false,
    });

    await spars.closeSpar(spar.id);

    expect(await pending).toEqual({ expired: true });
    run.emit({ type: 'turn', costUsd: 0 });
    expect(spars.getSpar(spar.id).closed).toBe(true);
  });

  it('closes a Spar left closing when the server restarts', async () => {
    const world = await started();
    await world.spars.closeSpar(world.spar.id);

    const conversations = world.restart();
    conversations.interruptStale();
    const spars = createSpars({
      db: world.db,
      tickets: world.tickets,
      conversations,
    });

    expect(spars.getSpar(world.spar.id)).toMatchObject({
      closed: true,
      closing: false,
    });
  });

  it('refuses a reply while it is closing', async () => {
    const { spars, spar } = await started();
    await spars.closeSpar(spar.id);

    await expect(spars.sendTurn(spar.id, 'Wait')).rejects.toThrow(
      'This Spar is closing.',
    );
  });

  it('reopens: editable again, and the next reply resumes the run from its session', async () => {
    const { spars, spar, run, runner } = await started();
    await spars.closeSpar(spar.id);
    run.emit({ type: 'turn', costUsd: 0.2 });

    expect(spars.reopenSpar(spar.id).closed).toBe(false);
    const [ideas] = spars.getCanvas(spar.id).columns;
    spars.addSticky(spar.id, { columnId: ideas.id, title: 'A' }, 'user');
    await spars.sendTurn(spar.id, 'Back again');

    expect(runner.runs).toHaveLength(2);
    expect(runner.runs[1].options.resume).toBe('sess-1');
  });
});

describe('The Hand-off of a Spar', () => {
  async function started(focus = false) {
    const world = createTestSpars();
    const idea = world.tickets.createTicket({
      projectId: world.project.id,
      title: 'Faster triage',
    });
    const spar = await world.spars.startSpar({
      projectId: world.project.id,
      topic: 'Speed',
      ...(focus ? { focusTicketNumber: idea.number } : {}),
    });
    return { ...world, spar, idea };
  }

  const draft = {
    title: 'Cache triage results',
    description: '## Decisions\n- Cache',
    path: 'spec' as const,
  };

  it("keeps the Agent's draft until the User approves it", async () => {
    const { spars, spar } = await started();

    spars.proposeHandOff(spar.id, draft);

    expect(spars.getSpar(spar.id).handOffDraft).toEqual(draft);
  });

  it('refuses a draft without a title or path', async () => {
    const { spars, spar } = await started();

    expect(() =>
      spars.proposeHandOff(spar.id, { ...draft, title: ' ' }),
    ).toThrow(ValidationError);
    expect(() =>
      spars.proposeHandOff(spar.id, { ...draft, path: 'later' as never }),
    ).toThrow(ValidationError);
  });

  it('files the idea Ticket in Intake with a link back, and records it as the outcome', async () => {
    const { spars, spar, tickets, runner, project } = await started();
    spars.proposeHandOff(spar.id, draft);

    const result = await spars.handOff(spar.id, {
      title: 'Cache the results',
      description: 'Edited by me',
      path: 'ticket',
    });

    const ticket = tickets.getTicket(result.ticketNumber);
    expect(ticket).toMatchObject({
      projectId: project.id,
      title: 'Cache the results',
      status: 'Todo',
      labels: [],
      origin: null,
      cycle: null,
    });
    expect(ticket.description).toBe(
      `Edited by me\n\nFrom the Spar [Speed](/project/${project.id}/spar/${spar.id}).`,
    );
    expect(result.conversation).toBeNull();
    expect(runner.runs).toHaveLength(1);
    expect(spars.getSpar(spar.id)).toMatchObject({
      outcomeTicketNumber: ticket.number,
      handOffDraft: null,
    });
    expect(spars.listSpars(project.id)[0]).toMatchObject({
      outcomeTicketNumber: ticket.number,
      outcomeTitle: 'Cache the results',
    });
  });

  it('gives the new Ticket the focus Ticket as its Origin, and with Spec it starts a Spec on it', async () => {
    const { spars, spar, tickets, runner, idea } = await started(true);

    const result = await spars.handOff(spar.id, draft);

    expect(tickets.getTicket(result.ticketNumber).origin).toMatchObject({
      number: idea.number,
    });
    expect(result.conversation).toMatchObject({
      intent: 'spec',
      ticketNumber: result.ticketNumber,
      startedBy: 'user',
    });
    expect(runner.runs.at(-1)?.options.prompt).toBe(
      `/tandembike:spec T${result.ticketNumber}`,
    );
  });

  it('files the Ticket and says why when its Spec cannot start', async () => {
    const { spars, spar, tickets, project } = await started();
    tickets.setProjectAgentSettings(project.id, { repositoryPath: null });

    const result = await spars.handOff(spar.id, draft);

    expect(tickets.getTicket(result.ticketNumber).title).toBe(draft.title);
    expect(result.conversation).toBeNull();
    expect(result.specError).toMatch(
      new RegExp(
        `^T${result.ticketNumber} is filed, but its Spec could not start`,
      ),
    );
    expect(spars.getSpar(spar.id).outcomeTicketNumber).toBe(
      result.ticketNumber,
    );
  });

  it('refuses a second Hand-off, and one on a closed Spar', async () => {
    const { spars, spar, runner } = await started();
    await spars.handOff(spar.id, { ...draft, path: 'ticket' });

    await expect(spars.handOff(spar.id, draft)).rejects.toThrow(
      /already handed off/,
    );
    expect(() => spars.proposeHandOff(spar.id, draft)).toThrow(
      /already handed off/,
    );

    const other = await started();
    runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    await other.spars.closeSpar(other.spar.id);
    other.runner.runs[0].emit({ type: 'turn', costUsd: 0 });
    await expect(other.spars.handOff(other.spar.id, draft)).rejects.toThrow(
      NotAllowedError,
    );
  });
});
