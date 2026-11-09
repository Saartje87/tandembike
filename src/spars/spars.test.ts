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
