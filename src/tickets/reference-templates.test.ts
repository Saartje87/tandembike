// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { type Change, createChangeChannel } from './changes';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';

const github = 'https://github.com/acme/web/issues/{n}';
const jira = 'https://acme.atlassian.net/browse/ABC-{n}';

function ticketsWithProject() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  return { tickets, project };
}

describe('Reference templates', () => {
  it('gives a new Project none', () => {
    const { tickets, project } = ticketsWithProject();

    expect(tickets.listReferenceTemplates(project.id)).toEqual([]);
  });

  it('adds templates, trimmed, kept in the order they were added', () => {
    const { tickets, project } = ticketsWithProject();

    const first = tickets.addReferenceTemplate(project.id, {
      prefix: ' # ',
      url: ` ${github} `,
    });
    tickets.addReferenceTemplate(project.id, { prefix: 'ABC-', url: jira });

    expect(first).toEqual({
      id: first.id,
      projectId: project.id,
      prefix: '#',
      url: github,
    });
    expect(
      tickets
        .listReferenceTemplates(project.id)
        .map(({ prefix, url }) => ({ prefix, url })),
    ).toEqual([
      { prefix: '#', url: github },
      { prefix: 'ABC-', url: jira },
    ]);
  });

  describe('refusing invalid templates', () => {
    it.each([
      ['an empty prefix', '  ', 'Enter a prefix, such as # or ABC-.'],
      [
        'a prefix with spaces',
        'AB C-',
        'Keep the prefix to one word without spaces, such as # or ABC-.',
      ],
      [
        'a prefix over 100 characters',
        'p'.repeat(101),
        'Keep the prefix to 100 characters or fewer.',
      ],
    ])('refuses %s', (_, prefix, reason) => {
      const { tickets, project } = ticketsWithProject();

      expect(
        errorFrom(() =>
          tickets.addReferenceTemplate(project.id, { prefix, url: github }),
        ),
      ).toEqual(new ValidationError({ prefix: reason }));
      expect(tickets.listReferenceTemplates(project.id)).toEqual([]);
    });

    it.each([
      ['an empty URL', ' '],
      ['a URL that is not http(s)', 'ftp://example.com/{n}'],
      ['a URL without a scheme', 'github.com/acme/web/issues/{n}'],
      ['a URL with spaces', 'https://example.com/a b/{n}'],
      [
        'a URL over 2,000 characters',
        `https://example.com/${'p'.repeat(1980)}{n}`,
      ],
    ])('refuses %s', (_, url) => {
      const { tickets, project } = ticketsWithProject();

      expect(
        errorFrom(() =>
          tickets.addReferenceTemplate(project.id, { prefix: '#', url }),
        ),
      ).toEqual(
        new ValidationError({
          url: 'Enter an http(s) URL of at most 2,000 characters, such as https://github.com/owner/repo/issues/{n}.',
        }),
      );
    });

    it('refuses a URL without {n}', () => {
      const { tickets, project } = ticketsWithProject();

      expect(
        errorFrom(() =>
          tickets.addReferenceTemplate(project.id, {
            prefix: '#',
            url: 'https://github.com/acme/web/issues/',
          }),
        ),
      ).toEqual(
        new ValidationError({
          url: 'Put {n} in the URL where the rest of the key goes, such as https://github.com/owner/repo/issues/{n}.',
        }),
      );
    });

    it('names every field that breaks a rule', () => {
      const { tickets, project } = ticketsWithProject();

      const error = errorFrom(() =>
        tickets.addReferenceTemplate(project.id, { prefix: '', url: '' }),
      );

      expect(error).toBeInstanceOf(ValidationError);
      expect(Object.keys((error as ValidationError).fieldErrors)).toEqual([
        'prefix',
        'url',
      ]);
    });

    it('refuses a prefix the Project already has', () => {
      const { tickets, project } = ticketsWithProject();
      tickets.addReferenceTemplate(project.id, { prefix: '#', url: github });

      expect(
        errorFrom(() =>
          tickets.addReferenceTemplate(project.id, {
            prefix: ' # ',
            url: jira,
          }),
        ),
      ).toEqual(
        new ValidationError({
          prefix:
            'This Project already has a Reference template for #. Edit that one instead.',
        }),
      );
    });

    it('allows the same prefix in another Project', () => {
      const { tickets, project } = ticketsWithProject();
      const other = tickets.createProject({ name: 'App' });
      tickets.addReferenceTemplate(project.id, { prefix: '#', url: github });

      tickets.addReferenceTemplate(other.id, { prefix: '#', url: jira });

      expect(tickets.listReferenceTemplates(other.id)).toMatchObject([
        { prefix: '#', url: jira },
      ]);
    });
  });

  it('refuses a template for a missing or archived Project', () => {
    const { tickets, project } = ticketsWithProject();
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.addReferenceTemplate(999, { prefix: '#', url: github }),
      ),
    ).toEqual(new NotFoundError('There is no Project with id 999.'));
    expect(
      errorFrom(() =>
        tickets.addReferenceTemplate(project.id, { prefix: '#', url: github }),
      ),
    ).toBeInstanceOf(NotAllowedError);
  });

  describe('editing', () => {
    it("changes a template's prefix and URL and keeps its place", () => {
      const { tickets, project } = ticketsWithProject();
      const first = tickets.addReferenceTemplate(project.id, {
        prefix: '#',
        url: github,
      });
      tickets.addReferenceTemplate(project.id, { prefix: 'ABC-', url: jira });

      const edited = tickets.updateReferenceTemplate(first.id, {
        prefix: ' GH- ',
        url: 'https://github.com/acme/app/issues/{n}',
      });

      expect(edited).toEqual({
        id: first.id,
        projectId: project.id,
        prefix: 'GH-',
        url: 'https://github.com/acme/app/issues/{n}',
      });
      expect(
        tickets.listReferenceTemplates(project.id).map(({ prefix }) => prefix),
      ).toEqual(['GH-', 'ABC-']);
    });

    it('keeps its own prefix but refuses another template’s', () => {
      const { tickets, project } = ticketsWithProject();
      const first = tickets.addReferenceTemplate(project.id, {
        prefix: '#',
        url: github,
      });
      tickets.addReferenceTemplate(project.id, { prefix: 'ABC-', url: jira });

      tickets.updateReferenceTemplate(first.id, { prefix: '#', url: jira });

      expect(
        errorFrom(() =>
          tickets.updateReferenceTemplate(first.id, {
            prefix: 'ABC-',
            url: jira,
          }),
        ),
      ).toEqual(
        new ValidationError({
          prefix:
            'This Project already has a Reference template for ABC-. Edit that one instead.',
        }),
      );
    });

    it('refuses an invalid edit and leaves the template as it was', () => {
      const { tickets, project } = ticketsWithProject();
      const template = tickets.addReferenceTemplate(project.id, {
        prefix: '#',
        url: github,
      });

      expect(
        errorFrom(() =>
          tickets.updateReferenceTemplate(template.id, {
            prefix: '#',
            url: 'https://github.com/acme/web/issues/',
          }),
        ),
      ).toBeInstanceOf(ValidationError);
      expect(tickets.listReferenceTemplates(project.id)).toEqual([template]);
    });

    it('refuses a missing template', () => {
      const tickets = createTestTickets();

      expect(
        errorFrom(() =>
          tickets.updateReferenceTemplate(999, { prefix: '#', url: github }),
        ),
      ).toEqual(
        new NotFoundError('There is no Reference template with id 999.'),
      );
    });
  });

  describe('removing', () => {
    it('removes a template and keeps the others in order', () => {
      const { tickets, project } = ticketsWithProject();
      const first = tickets.addReferenceTemplate(project.id, {
        prefix: '#',
        url: github,
      });
      tickets.addReferenceTemplate(project.id, { prefix: 'ABC-', url: jira });

      tickets.removeReferenceTemplate(first.id);

      expect(
        tickets.listReferenceTemplates(project.id).map(({ prefix }) => prefix),
      ).toEqual(['ABC-']);
    });

    it('frees its prefix', () => {
      const { tickets, project } = ticketsWithProject();
      const template = tickets.addReferenceTemplate(project.id, {
        prefix: '#',
        url: github,
      });

      tickets.removeReferenceTemplate(template.id);
      tickets.addReferenceTemplate(project.id, { prefix: '#', url: jira });

      expect(tickets.listReferenceTemplates(project.id)).toMatchObject([
        { prefix: '#', url: jira },
      ]);
    });

    it('refuses a missing template', () => {
      const tickets = createTestTickets();

      expect(errorFrom(() => tickets.removeReferenceTemplate(999))).toEqual(
        new NotFoundError('There is no Reference template with id 999.'),
      );
    });
  });

  it('refuses editing or removing a template of an archived Project', () => {
    const { tickets, project } = ticketsWithProject();
    const template = tickets.addReferenceTemplate(project.id, {
      prefix: '#',
      url: github,
    });
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.updateReferenceTemplate(template.id, {
          prefix: '#',
          url: jira,
        }),
      ),
    ).toBeInstanceOf(NotAllowedError);
    expect(
      errorFrom(() => tickets.removeReferenceTemplate(template.id)),
    ).toBeInstanceOf(NotAllowedError);
    expect(tickets.listReferenceTemplates(project.id)).toEqual([template]);
  });

  it('publishes a change of the Project for each write', () => {
    const changes = createChangeChannel();
    const published: Change[] = [];
    changes.subscribe((change) => published.push(change));
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    published.length = 0;

    const template = tickets.addReferenceTemplate(project.id, {
      prefix: '#',
      url: github,
    });
    tickets.updateReferenceTemplate(template.id, { prefix: '#', url: jira });
    tickets.removeReferenceTemplate(template.id);

    expect(published).toEqual([
      { type: 'project', id: project.id },
      { type: 'project', id: project.id },
      { type: 'project', id: project.id },
    ]);
  });
});
