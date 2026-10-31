// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError, NotFoundError, type ValidationError } from './errors';

const fieldError = (run: () => unknown) =>
  (errorFrom(run) as ValidationError).fieldErrors.skills;

describe("A Project's Skills", () => {
  it('start with the mattpocock-skills commands', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(tickets.getProjectSkills(project.id)).toEqual([
      '/mattpocock-skills:grilling',
      '/mattpocock-skills:grill-with-docs',
      '/mattpocock-skills:retro',
      '/mattpocock-skills:to-spec',
      '/mattpocock-skills:to-tickets',
    ]);
  });

  it('are replaced in order, trimmed, with a missing slash added and blank entries dropped', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      tickets.setProjectSkills(project.id, [' review ', '', '/plan', '  ']),
    ).toEqual(['/review', '/plan']);
    expect(tickets.getProjectSkills(project.id)).toEqual(['/review', '/plan']);

    expect(tickets.setProjectSkills(project.id, [])).toEqual([]);
    expect(tickets.getProjectSkills(project.id)).toEqual([]);
  });

  it('refuse an entry with a space or a duplicate, naming it, and change nothing', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const before = tickets.getProjectSkills(project.id);

    expect(
      fieldError(() =>
        tickets.setProjectSkills(project.id, ['/review', '/to spec']),
      ),
    ).toBe('"/to spec" has a space. Enter one command per line.');
    expect(
      fieldError(() => tickets.setProjectSkills(project.id, ['/plan', 'plan'])),
    ).toBe('"/plan" is listed twice.');
    expect(tickets.getProjectSkills(project.id)).toEqual(before);
  });

  it('refuse more than 20 entries or one over 100 characters', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      fieldError(() =>
        tickets.setProjectSkills(
          project.id,
          Array.from({ length: 21 }, (_, index) => `/skill-${index}`),
        ),
      ),
    ).toBe('Enter at most 20 Skills.');
    expect(
      fieldError(() =>
        tickets.setProjectSkills(project.id, [`/${'a'.repeat(100)}`]),
      ),
    ).toBe(`"/${'a'.repeat(100)}" is longer than 100 characters.`);
  });

  it('are refused for an archived Project, and read from a missing one fails', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() => tickets.setProjectSkills(project.id, ['/review'])),
    ).toBeInstanceOf(NotAllowedError);
    expect(errorFrom(() => tickets.getProjectSkills(999))).toBeInstanceOf(
      NotFoundError,
    );
  });
});
