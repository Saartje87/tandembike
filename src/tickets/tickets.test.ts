// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { NameTakenError, NotFoundError, ValidationError } from './errors';

describe('Projects', () => {
  it('creates a Project and lists it', () => {
    const tickets = createTestTickets();

    const project = tickets.createProject({ name: 'Website' });

    expect(project.name).toBe('Website');
    expect(tickets.listProjects()).toEqual([project]);
  });

  it('trims surrounding spaces from the name', () => {
    const tickets = createTestTickets();

    const project = tickets.createProject({ name: '  Website \n' });

    expect(project.name).toBe('Website');
  });

  it('lists Projects in the order they were created', () => {
    const tickets = createTestTickets();

    tickets.createProject({ name: 'Website' });
    tickets.createProject({ name: 'App' });
    tickets.createProject({ name: 'Marketing' });

    expect(tickets.listProjects().map((project) => project.name)).toEqual([
      'Website',
      'App',
      'Marketing',
    ]);
  });

  it('requires a name', () => {
    const tickets = createTestTickets();

    expect(errorFrom(() => tickets.createProject({ name: '   ' }))).toEqual(
      new ValidationError({ name: 'Enter a Project name.' }),
    );
    expect(tickets.listProjects()).toEqual([]);
  });

  it('refuses a name that is taken, ignoring case and surrounding spaces', () => {
    const tickets = createTestTickets();
    tickets.createProject({ name: 'Website' });

    const error = errorFrom(() =>
      tickets.createProject({ name: '  wEBSITE ' }),
    );

    expect(error).toBeInstanceOf(NameTakenError);
    expect(error).toHaveProperty(
      'message',
      'A Project named "Website" already exists. Choose another name.',
    );
    expect(tickets.listProjects()).toHaveLength(1);
  });

  it('gets a Project by id', () => {
    const tickets = createTestTickets();
    tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });

    expect(tickets.getProject(app.id)).toEqual(app);
  });

  it('says when a Project does not exist', () => {
    const tickets = createTestTickets();

    expect(errorFrom(() => tickets.getProject(7))).toEqual(
      new NotFoundError('There is no Project with id 7.'),
    );
  });
});

describe('Renaming a Project', () => {
  it('renames a Project, trimming the new name', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const renamed = tickets.renameProject(project.id, { name: '  Homepage ' });

    expect(renamed).toEqual({ ...project, name: 'Homepage' });
    expect(tickets.getProject(project.id).name).toBe('Homepage');
  });

  it('requires a name', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      errorFrom(() => tickets.renameProject(project.id, { name: ' ' })),
    ).toEqual(new ValidationError({ name: 'Enter a Project name.' }));
    expect(tickets.getProject(project.id).name).toBe('Website');
  });

  it("refuses another Project's name, ignoring case and surrounding spaces", () => {
    const tickets = createTestTickets();
    tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });

    const error = errorFrom(() =>
      tickets.renameProject(app.id, { name: ' wEBSITE ' }),
    );

    expect(error).toBeInstanceOf(NameTakenError);
    expect(error).toHaveProperty(
      'message',
      'A Project named "Website" already exists. Choose another name.',
    );
    expect(tickets.getProject(app.id).name).toBe('App');
  });

  it('allows changing only the casing of its own name', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'website' });

    const renamed = tickets.renameProject(project.id, { name: 'Website' });

    expect(renamed.name).toBe('Website');
  });

  it('says when the Project does not exist', () => {
    const tickets = createTestTickets();

    expect(
      errorFrom(() => tickets.renameProject(7, { name: 'Website' })),
    ).toEqual(new NotFoundError('There is no Project with id 7.'));
  });
});

describe('Changes', () => {
  it('announces a created Project to subscribers', () => {
    const tickets = createTestTickets();
    const listener = vi.fn();
    tickets.subscribe(listener);

    const project = tickets.createProject({ name: 'Website' });

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: 'project',
      id: project.id,
    });
  });

  it('announces a renamed Project to subscribers', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const listener = vi.fn();
    tickets.subscribe(listener);

    tickets.renameProject(project.id, { name: 'Homepage' });

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: 'project',
      id: project.id,
    });
  });

  it('stops announcing after unsubscribing', () => {
    const tickets = createTestTickets();
    const listener = vi.fn();
    const unsubscribe = tickets.subscribe(listener);

    unsubscribe();
    tickets.createProject({ name: 'Website' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('announces nothing when a write fails', () => {
    const tickets = createTestTickets();
    const listener = vi.fn();
    tickets.subscribe(listener);

    errorFrom(() => tickets.createProject({ name: '' }));

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps one app-wide channel when modules are reloaded, as in dev mode', async () => {
    const before = (await import('./changes')).appChangeChannel();
    vi.resetModules();
    const after = (await import('./changes')).appChangeChannel();
    const listener = vi.fn();
    before.subscribe(listener);

    after.publish({ type: 'project', id: 1 });

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: 'project',
      id: 1,
    });
  });

  it('shares announcements between modules on the same channel', () => {
    const changes = createChangeChannel();
    const writer = createTestTickets(changes);
    const reader = createTestTickets(changes);
    const listener = vi.fn();
    reader.subscribe(listener);

    const project = writer.createProject({ name: 'Website' });

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: 'project',
      id: project.id,
    });
  });
});
