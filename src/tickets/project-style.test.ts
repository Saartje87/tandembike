// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import type { Change } from './changes';
import { NotFoundError, ValidationError } from './errors';

describe("A Project's colour and icon", () => {
  it('starts with neither', () => {
    const tickets = createTestTickets();

    const project = tickets.createProject({ name: 'Website' });

    expect(project).toMatchObject({ color: null, icon: null });
  });

  it('sets a colour and an icon from the fixed sets, and clears them again', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      tickets.styleProject(project.id, {
        color: 'teal',
        icon: 'rocket-launch',
      }),
    ).toMatchObject({ color: 'teal', icon: 'rocket-launch' });
    expect(tickets.styleProject(project.id, { color: null })).toMatchObject({
      color: null,
      icon: 'rocket-launch',
    });
    expect(tickets.getProject(project.id)).toMatchObject({
      color: null,
      icon: 'rocket-launch',
    });
    expect(tickets.listProjects()[0]).toMatchObject({ icon: 'rocket-launch' });
  });

  it('refuses a colour or icon outside the fixed sets, changing nothing', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      errorFrom(() =>
        tickets.styleProject(project.id, {
          color: 'beige' as never,
          icon: 'trash' as never,
        }),
      ),
    ).toEqual(
      new ValidationError({
        color:
          'Choose one of these colours: red, orange, amber, green, teal, blue, indigo, purple, pink, grey.',
        icon: 'Choose one of the Project icons.',
      }),
    );
    expect(tickets.getProject(project.id)).toMatchObject({
      color: null,
      icon: null,
    });
  });

  it('refuses a Project that does not exist', () => {
    const tickets = createTestTickets();

    expect(errorFrom(() => tickets.styleProject(7, { color: 'red' }))).toEqual(
      new NotFoundError('There is no Project with id 7.'),
    );
  });

  it('is announced, so other tabs show it', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.styleProject(project.id, { color: 'pink' });

    expect(changes).toEqual([{ type: 'project', id: project.id }]);
  });
});
