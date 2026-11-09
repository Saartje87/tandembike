// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestSpars } from '../test/spars';
import { NotAllowedError, ValidationError } from '../tickets/errors';

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
    tickets.setProjectAgentCommands(project.id, {
      triageCommand: '',
      startCommand: '',
      startEpicCommand: '',
      retroCommand: '',
      specCommand: '',
      mergeCommand: '',
      planCommand: '',
      sparCommand: '/think',
    });

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
