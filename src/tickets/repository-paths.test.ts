import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { ValidationError } from './errors';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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
    const path = gitRepository();

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
    const path = gitRepository();
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

/** A git repository as files: a `.git` with HEAD on `main`, and `origin` when given. */
const gitRepository = (origin?: string) => {
  const path = directory();
  mkdirSync(join(path, '.git'));
  writeFileSync(join(path, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  if (origin) {
    writeFileSync(
      join(path, '.git', 'config'),
      `[remote "origin"]\n\turl = ${origin}\n`,
    );
  }
  return path;
};

describe('Creating a Project for a folder (tandembike add)', () => {
  it("creates the Project of the folder's repository with what the New Project form detects", () => {
    const tickets = createTestTickets();
    const path = gitRepository('git@github.com:acme/web-site.git');
    writeFileSync(
      join(path, 'package.json'),
      JSON.stringify({ scripts: { check: 'biome check' } }),
    );

    const added = tickets.addProject({ folder: path });

    expect(added.created).toBe(true);
    expect(added.project.name).toBe('web-site');
    expect(tickets.getProjectAgentSettings(added.project.id)).toMatchObject({
      repositoryPath: path,
      checkCommand: 'npm run check',
      agentMode: true,
      parallelRuns: true,
    });
    expect(tickets.listReferenceTemplates(added.project.id)).toMatchObject([
      { prefix: '#', url: 'https://github.com/acme/web-site/issues/{n}' },
    ]);
  });

  it('names the Project from the folder without a remote, and resolves a subfolder to its root', () => {
    const tickets = createTestTickets();
    const path = gitRepository();
    const sub = join(path, 'src', 'deep');
    mkdirSync(sub, { recursive: true });

    const added = tickets.addProject({ folder: sub });

    expect(added.project.name).toBe(path.split('/').pop());
    expect(
      tickets.getProjectAgentSettings(added.project.id).repositoryPath,
    ).toBe(path);
  });

  it('reports the Project the repository already is, changing nothing', () => {
    const tickets = createTestTickets();
    const path = gitRepository();
    const first = tickets.addProject({ folder: path });

    const again = tickets.addProject({ folder: join(path, '.') });

    expect(again).toEqual({ project: first.project, created: false });
    expect(tickets.listProjects()).toHaveLength(1);
  });

  it("refuses a folder that is not a git repository with the New Project form's message", () => {
    const tickets = createTestTickets();
    const plain = directory();

    const error = errorFrom(() => tickets.addProject({ folder: plain }));

    expect(error).toEqual(
      new ValidationError({
        repositoryPath:
          'This folder is not a git repository: it has no .git inside.',
      }),
    );
    expect(tickets.listProjects()).toEqual([]);
  });

  it('refuses a repository without a branch', () => {
    const tickets = createTestTickets();
    const path = gitRepository();
    writeFileSync(join(path, '.git', 'HEAD'), 'a'.repeat(40));

    const error = errorFrom(() => tickets.addProject({ folder: path }));

    expect((error as ValidationError).fieldErrors.repositoryPath).toMatch(
      /no branch/,
    );
  });

  it('refuses a missing folder', () => {
    const tickets = createTestTickets();

    const error = errorFrom(() =>
      tickets.addProject({ folder: '/no/such/folder' }),
    );

    expect((error as ValidationError).fieldErrors.repositoryPath).toBe(
      'There is no directory at this path.',
    );
  });
});

describe('Creating a Project with a repository folder', () => {
  it('refuses a folder that is not a git repository, as the New Project form does', () => {
    const tickets = createTestTickets();

    const error = errorFrom(() =>
      tickets.createProject({ name: 'Website', repositoryPath: directory() }),
    );

    expect((error as ValidationError).fieldErrors.repositoryPath).toBe(
      'This folder is not a git repository: it has no .git inside.',
    );
    expect(tickets.listProjects()).toEqual([]);
  });
});
