// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { ValidationError } from './errors';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = () =>
  realpathSync(mkdtempSync(join(tmpdir(), 'tandembike-folder-')));

/** A folder with a `.git` folder inside, as a repository looks. */
const repository = (path = directory()) => {
  mkdirSync(join(path, '.git'), { recursive: true });
  return path;
};

/** A worktree of `repo` at `path`, linked the way `git worktree add` does. */
const worktree = (repo: string, path = directory(), name = 'wt') => {
  const admin = join(repo, '.git', 'worktrees', name);
  mkdirSync(admin, { recursive: true });
  writeFileSync(join(admin, 'commondir'), '../..\n');
  writeFileSync(join(path, '.git'), `gitdir: ${admin}\n`);
  return path;
};

const setup = () => {
  const tickets = createTestTickets();
  const root = repository();
  const website = tickets.createProject({ name: 'Website' });
  tickets.setProjectAgentSettings(website.id, { repositoryPath: root });
  return { tickets, root, website };
};

describe('Resolving a Project from a folder', () => {
  it('finds the Project of a repository root and of a subfolder', () => {
    const { tickets, root, website } = setup();
    const sub = join(root, 'src', 'deep');
    mkdirSync(sub, { recursive: true });

    expect(tickets.resolveProjectId({ cwd: root })).toBe(website.id);
    expect(tickets.resolveProjectId({ cwd: sub })).toBe(website.id);
  });

  it('finds the Project of a worktree inside and outside the repository', () => {
    const { tickets, root, website } = setup();
    const inside = join(root, '.claude', 'worktrees', 'a');
    mkdirSync(inside, { recursive: true });
    worktree(root, inside, 'a');
    const outside = worktree(root, directory(), 'b');
    const outsideSub = join(outside, 'src');
    mkdirSync(outsideSub);

    expect(tickets.resolveProjectId({ cwd: inside })).toBe(website.id);
    expect(tickets.resolveProjectId({ cwd: outside })).toBe(website.id);
    expect(tickets.resolveProjectId({ cwd: outsideSub })).toBe(website.id);
  });

  it('follows a symlinked folder to its repository', () => {
    const { tickets, root, website } = setup();
    const link = join(directory(), 'link');
    symlinkSync(root, link);

    expect(tickets.resolveProjectId({ cwd: link })).toBe(website.id);
  });

  it('prefers the innermost repository of nested ones', () => {
    const { tickets, root } = setup();
    const inner = repository(join(root, 'packages', 'blocks'));
    const blocks = tickets.createProject({ name: 'Blocks' });
    tickets.setProjectAgentSettings(blocks.id, { repositoryPath: inner });
    const sub = join(inner, 'src');
    mkdirSync(sub);

    expect(tickets.resolveProjectId({ cwd: sub })).toBe(blocks.id);
    expect(tickets.resolveProjectId({ cwd: join(root, 'src-other') })).toBe(
      tickets.resolveProjectId({ cwd: root }),
    );
  });

  it('falls back to the outer Project when the inner repository has none', () => {
    const { tickets, root, website } = setup();
    const inner = repository(join(root, 'vendor'));

    expect(tickets.resolveProjectId({ cwd: inner })).toBe(website.id);
  });

  it('refuses an unknown folder, naming it and the Projects', () => {
    const { tickets } = setup();
    tickets.createProject({ name: 'Blog' });
    const elsewhere = repository();

    const error = errorFrom(() => tickets.resolveProjectId({ cwd: elsewhere }));

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toBe(
      `No Project has a repository containing ${elsewhere}. Pass projectName: one of "Blog", "Website".`,
    );
  });

  it('refuses an unknown folder when there are no Projects', () => {
    const tickets = createTestTickets();

    expect(
      (errorFrom(() => tickets.resolveProjectId({ cwd: '/nowhere' })) as Error)
        .message,
    ).toMatch(
      /No Project has a repository containing \/nowhere\. .*no Projects/,
    );
  });

  it("refuses to write in an archived Project's folder, as naming it does", () => {
    const { tickets, root, website } = setup();
    tickets.archiveProject(website.id);

    const projectId = tickets.resolveProjectId({ cwd: root });
    const error = errorFrom(() =>
      tickets.createTicket({ projectId, title: 'A Ticket' }),
    );

    expect((error as Error).message).toMatch(/archived/);
  });

  it('refuses an ambiguous duplicate, naming both Projects', () => {
    const tickets = createTestTickets();
    const root = repository();
    const first = tickets.createProject({ name: 'First' });
    const second = tickets.createProject({ name: 'Second' });
    // Duplicates are refused when set, so build one that predates the rule:
    // the second Project's folder is replaced by a link to the first's.
    const moved = directory();
    tickets.setProjectAgentSettings(first.id, { repositoryPath: root });
    tickets.setProjectAgentSettings(second.id, { repositoryPath: moved });
    rmSync(moved, { recursive: true });
    symlinkSync(root, moved);

    const error = errorFrom(() => tickets.resolveProjectId({ cwd: root }));

    expect((error as Error).message).toContain('"First"');
    expect((error as Error).message).toContain('"Second"');
  });

  it('lets projectName or projectId override the folder', () => {
    const { tickets, root, website } = setup();
    const blog = tickets.createProject({ name: 'Blog' });

    expect(tickets.resolveProjectId({ cwd: root, projectName: 'blog' })).toBe(
      blog.id,
    );
    expect(tickets.resolveProjectId({ cwd: root, projectId: blog.id })).toBe(
      blog.id,
    );
    expect(tickets.resolveProjectId({ cwd: root })).toBe(website.id);
  });

  it('still asks for a Project when neither a name nor a folder is given', () => {
    const { tickets } = setup();

    expect(errorFrom(() => tickets.resolveProjectId({}))).toBeInstanceOf(
      ValidationError,
    );
  });
});
