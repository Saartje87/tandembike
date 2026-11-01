// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = () => mkdtempSync(join(tmpdir(), 'tandembike-repo-'));

describe("A Project's agent settings", () => {
  it('start with no repository path, Parallel runs off, a cap of 3 and agent mode off', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(tickets.getProjectAgentSettings(project.id)).toEqual({
      repositoryPath: null,
      parallelRuns: false,
      maxConcurrentRuns: 3,
      agentMode: false,
    });
  });

  it('set, change and clear the repository path', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const first = directory();
    const second = directory();

    expect(
      tickets.setProjectAgentSettings(project.id, { repositoryPath: first }),
    ).toMatchObject({ repositoryPath: first });
    tickets.setProjectAgentSettings(project.id, { repositoryPath: second });
    expect(tickets.getProjectAgentSettings(project.id).repositoryPath).toBe(
      second,
    );
    tickets.setProjectAgentSettings(project.id, { repositoryPath: null });
    expect(tickets.getProjectAgentSettings(project.id).repositoryPath).toBe(
      null,
    );
  });

  it('refuse a path that is relative, missing or not a directory, changing nothing', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const file = join(directory(), 'file.txt');
    writeFileSync(file, 'x');

    for (const repositoryPath of ['relative/path', '/no/such/dir-xyz', file]) {
      const error = errorFrom(() =>
        tickets.setProjectAgentSettings(project.id, { repositoryPath }),
      );
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors).toHaveProperty(
        'repositoryPath',
      );
    }
    expect(tickets.getProjectAgentSettings(project.id).repositoryPath).toBe(
      null,
    );
  });

  it('turn Parallel runs on and set the cap, which is at least 1', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      tickets.setProjectAgentSettings(project.id, {
        parallelRuns: true,
        maxConcurrentRuns: 5,
      }),
    ).toMatchObject({ parallelRuns: true, maxConcurrentRuns: 5 });
    for (const maxConcurrentRuns of [0, -1, 1.5]) {
      const error = errorFrom(() =>
        tickets.setProjectAgentSettings(project.id, { maxConcurrentRuns }),
      );
      expect((error as ValidationError).fieldErrors).toHaveProperty(
        'maxConcurrentRuns',
      );
    }
    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      parallelRuns: true,
      maxConcurrentRuns: 5,
    });
  });

  it('turn agent mode on only while a repository path is set, and clearing the path turns it off', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const error = errorFrom(() =>
      tickets.setProjectAgentSettings(project.id, { agentMode: true }),
    );
    expect((error as ValidationError).fieldErrors).toHaveProperty('agentMode');

    expect(
      tickets.setProjectAgentSettings(project.id, {
        repositoryPath: directory(),
        agentMode: true,
      }),
    ).toMatchObject({ agentMode: true });
    expect(
      tickets.setProjectAgentSettings(project.id, { repositoryPath: null }),
    ).toMatchObject({ repositoryPath: null, agentMode: false });
  });

  it('leave fields that are left out as they are', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });

    tickets.setProjectAgentSettings(project.id, { maxConcurrentRuns: 2 });

    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      parallelRuns: true,
      maxConcurrentRuns: 2,
    });
  });

  it('are refused for an archived Project, and read from a missing one fails', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.setProjectAgentSettings(project.id, { parallelRuns: true }),
      ),
    ).toBeInstanceOf(NotAllowedError);
    expect(
      errorFrom(() => tickets.getProjectAgentSettings(999)),
    ).toBeInstanceOf(NotFoundError);
  });

  it('are not part of the Project the module lists', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, {
      repositoryPath: directory(),
    });

    expect(tickets.getProject(project.id)).not.toHaveProperty('repositoryPath');
    expect(tickets.listProjects()[0]).not.toHaveProperty('repositoryPath');
  });
});
