import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { ValidationError } from './errors';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = () =>
  realpathSync(mkdtempSync(join(tmpdir(), 'tandembike-repo-')));

describe('Repository paths', () => {
  it('are refused when another Project uses them, naming that Project', () => {
    const tickets = createTestTickets();
    const path = directory();
    const first = tickets.createProject({ name: 'Website' });
    const second = tickets.createProject({ name: 'Blog' });
    tickets.setProjectAgentSettings(first.id, { repositoryPath: path });

    expect(
      errorFrom(() =>
        tickets.setProjectAgentSettings(second.id, { repositoryPath: path }),
      ),
    ).toEqual(
      new ValidationError({
        repositoryPath:
          'The Project "Website" already uses this repository. A repository belongs to one Project.',
      }),
    );
    expect(tickets.getProjectAgentSettings(second.id).repositoryPath).toBe(
      null,
    );
  });

  it('are compared after resolving trailing slashes and symlinks', () => {
    const tickets = createTestTickets();
    const path = directory();
    const link = join(directory(), 'link');
    symlinkSync(path, link);
    const first = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(first.id, { repositoryPath: path });

    for (const alias of [`${path}/`, link]) {
      const project = tickets.createProject({ name: `Alias ${alias.length}` });
      expect(
        errorFrom(() =>
          tickets.setProjectAgentSettings(project.id, {
            repositoryPath: alias,
          }),
        ),
      ).toBeInstanceOf(ValidationError);
    }
  });

  it('let a Project save its own path again, and different folders coexist', () => {
    const tickets = createTestTickets();
    const path = directory();
    const other = join(path, 'nested');
    mkdirSync(other);
    const first = tickets.createProject({ name: 'Website' });
    const second = tickets.createProject({ name: 'Blog' });

    tickets.setProjectAgentSettings(first.id, { repositoryPath: path });
    tickets.setProjectAgentSettings(first.id, { repositoryPath: path });
    tickets.setProjectAgentSettings(second.id, { repositoryPath: other });

    expect(tickets.getProjectAgentSettings(second.id).repositoryPath).toBe(
      other,
    );
  });
});

describe('Creating a Project with a repository', () => {
  it('saves its path, Check command and accepted template together', () => {
    const tickets = createTestTickets();
    const path = directory();

    const project = tickets.createProject({
      name: 'Website',
      repositoryPath: path,
      checkCommand: ' npm run check ',
      referenceTemplate: { prefix: '#', url: 'https://example.com/{n}' },
    });

    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      repositoryPath: path,
      checkCommand: 'npm run check',
    });
    expect(tickets.listReferenceTemplates(project.id)).toMatchObject([
      { prefix: '#', url: 'https://example.com/{n}' },
    ]);
  });

  it('creates nothing when the path is a duplicate, naming the holder', () => {
    const tickets = createTestTickets();
    const path = directory();
    tickets.setProjectAgentSettings(
      tickets.createProject({ name: 'Website' }).id,
      { repositoryPath: path },
    );

    const error = errorFrom(() =>
      tickets.createProject({ name: 'Blog', repositoryPath: path }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors.repositoryPath).toContain(
      '"Website"',
    );
    expect(tickets.listProjects().map((p) => p.name)).toEqual(['Website']);
  });

  it('creates nothing when the template is refused', () => {
    const tickets = createTestTickets();

    const error = errorFrom(() =>
      tickets.createProject({
        name: 'Blog',
        repositoryPath: directory(),
        referenceTemplate: { prefix: '#', url: 'not a url' },
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(tickets.listProjects()).toEqual([]);
  });
});
