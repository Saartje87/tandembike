// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = () => mkdtempSync(join(tmpdir(), 'tandembike-repo-'));

describe("A Project's agent settings", () => {
  it('start with no repository path, Parallel runs off, a cap of 3, agent mode off and auto run mode', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(tickets.getProjectAgentSettings(project.id)).toEqual({
      repositoryPath: null,
      checkCommand: null,
      prepareCommand: null,
      parallelRuns: false,
      maxConcurrentRuns: 3,
      agentMode: false,
      runMode: 'auto',
      runModel: null,
      triageModel: null,
      autopilot: false,
      spendCeilingUsd: null,
      autoTriage: false,
      triageCeilingUsd: null,
    });
  });

  describe('of a Project created with a repository folder (T1228)', () => {
    /** A git repository with `main` checked out, as `git init` leaves it. */
    const repository = () => {
      const path = directory();
      mkdirSync(join(path, '.git'));
      writeFileSync(join(path, '.git', 'HEAD'), 'ref: refs/heads/main\n');
      return path;
    };

    it('start with agent mode and Parallel runs on', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({
        name: 'Website',
        repositoryPath: repository(),
      });

      expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
        agentMode: true,
        parallelRuns: true,
      });
    });

    it('can still turn both off afterwards', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({
        name: 'Website',
        repositoryPath: repository(),
      });

      expect(
        tickets.setProjectAgentSettings(project.id, {
          agentMode: false,
          parallelRuns: false,
        }),
      ).toMatchObject({ agentMode: false, parallelRuns: false });
    });

    it('keep Parallel runs off for a folder that is not a git repository, which a run worktree needs', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({
        name: 'Website',
        repositoryPath: directory(),
      });

      expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
        agentMode: true,
        parallelRuns: false,
      });
    });

    it('keep both off for an empty folder field', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({
        name: 'Website',
        repositoryPath: '  ',
      });

      expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
        repositoryPath: null,
        agentMode: false,
        parallelRuns: false,
      });
    });
  });

  it('save the Check command trimmed and clear it when empty', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      tickets.setProjectAgentSettings(project.id, {
        checkCommand: '  npm run check  ',
      }).checkCommand,
    ).toBe('npm run check');
    expect(
      tickets.setProjectAgentSettings(project.id, { runMode: 'auto' })
        .checkCommand,
    ).toBe('npm run check');
    expect(
      tickets.setProjectAgentSettings(project.id, { checkCommand: '   ' })
        .checkCommand,
    ).toBeNull();
  });

  it('save the Prepare command trimmed and clear it when empty', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      tickets.setProjectAgentSettings(project.id, {
        prepareCommand: '  npm ci  ',
      }).prepareCommand,
    ).toBe('npm ci');
    expect(
      tickets.setProjectAgentSettings(project.id, { runMode: 'auto' })
        .prepareCommand,
    ).toBe('npm ci');
    expect(
      tickets.setProjectAgentSettings(project.id, { prepareCommand: '  ' })
        .prepareCommand,
    ).toBeNull();
    expect(JSON.stringify(tickets.getProject(project.id))).not.toContain(
      'prepare',
    );
  });

  it('turn Autopilot on only with a Spend ceiling, and keep the ceiling while it is on', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const refused = errorFrom(() =>
      tickets.setProjectAgentSettings(project.id, { autopilot: true }),
    );
    expect(refused).toBeInstanceOf(ValidationError);
    expect((refused as ValidationError).fieldErrors).toHaveProperty(
      'spendCeilingUsd',
    );
    expect(tickets.getProjectAgentSettings(project.id).autopilot).toBe(false);

    expect(
      tickets.setProjectAgentSettings(project.id, {
        autopilot: true,
        spendCeilingUsd: 25.5,
      }),
    ).toMatchObject({ autopilot: true, spendCeilingUsd: 25.5 });

    const cleared = errorFrom(() =>
      tickets.setProjectAgentSettings(project.id, { spendCeilingUsd: null }),
    );
    expect((cleared as ValidationError).fieldErrors).toHaveProperty(
      'spendCeilingUsd',
    );
    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      autopilot: true,
      spendCeilingUsd: 25.5,
    });

    expect(
      tickets.setProjectAgentSettings(project.id, {
        autopilot: false,
        spendCeilingUsd: null,
      }),
    ).toMatchObject({ autopilot: false, spendCeilingUsd: null });
  });

  it('turn on Auto-triage only with a Triage ceiling, and refuse clearing it while on', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const refused = errorFrom(() =>
      tickets.setProjectAgentSettings(project.id, { autoTriage: true }),
    );
    expect(refused).toBeInstanceOf(ValidationError);
    expect((refused as ValidationError).fieldErrors).toHaveProperty(
      'triageCeilingUsd',
    );
    expect(tickets.getProjectAgentSettings(project.id).autoTriage).toBe(false);

    expect(
      tickets.setProjectAgentSettings(project.id, {
        autoTriage: true,
        triageCeilingUsd: 2.5,
      }),
    ).toMatchObject({
      autoTriage: true,
      triageCeilingUsd: 2.5,
      autopilot: false,
    });

    const cleared = errorFrom(() =>
      tickets.setProjectAgentSettings(project.id, { triageCeilingUsd: null }),
    );
    expect((cleared as ValidationError).fieldErrors).toHaveProperty(
      'triageCeilingUsd',
    );

    for (const triageCeilingUsd of [0, -1, Number.NaN]) {
      const error = errorFrom(() =>
        tickets.setProjectAgentSettings(project.id, { triageCeilingUsd }),
      );
      expect((error as ValidationError).fieldErrors).toHaveProperty(
        'triageCeilingUsd',
      );
    }

    expect(
      tickets.setProjectAgentSettings(project.id, {
        autoTriage: false,
        triageCeilingUsd: null,
      }),
    ).toMatchObject({ autoTriage: false, triageCeilingUsd: null });
  });

  it('refuse a Spend ceiling that is not a positive number', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    for (const spendCeilingUsd of [
      0,
      -3,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const error = errorFrom(() =>
        tickets.setProjectAgentSettings(project.id, { spendCeilingUsd }),
      );
      expect((error as ValidationError).fieldErrors).toHaveProperty(
        'spendCeilingUsd',
      );
    }
  });

  it('set and change the run mode and the run model, and clear the model', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      tickets.setProjectAgentSettings(project.id, {
        runMode: 'auto',
        runModel: ' claude-opus-5-5 ',
      }),
    ).toMatchObject({ runMode: 'auto', runModel: 'claude-opus-5-5' });
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });
    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      runMode: 'auto',
      runModel: 'claude-opus-5-5',
    });
    tickets.setProjectAgentSettings(project.id, {
      runMode: 'default',
      runModel: null,
    });
    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      runMode: 'default',
      runModel: null,
    });
    tickets.setProjectAgentSettings(project.id, { runModel: 'x' });
    tickets.setProjectAgentSettings(project.id, { runModel: '  ' });
    expect(tickets.getProjectAgentSettings(project.id).runModel).toBe(null);
  });

  it('set, trim and clear the triage model, and refuse one with spaces', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(tickets.getProjectAgentSettings(project.id).triageModel).toBe(null);
    expect(
      tickets.setProjectAgentSettings(project.id, {
        triageModel: ' claude-haiku-5 ',
      }).triageModel,
    ).toBe('claude-haiku-5');
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });
    expect(tickets.getProjectAgentSettings(project.id).triageModel).toBe(
      'claude-haiku-5',
    );
    const error = errorFrom(() =>
      tickets.setProjectAgentSettings(project.id, { triageModel: 'two words' }),
    );
    expect((error as ValidationError).fieldErrors).toHaveProperty(
      'triageModel',
    );
    tickets.setProjectAgentSettings(project.id, { triageModel: null });
    expect(tickets.getProjectAgentSettings(project.id).triageModel).toBe(null);
  });

  it('refuse an unknown run mode or a run model with spaces, naming the field', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const mode = errorFrom(() =>
      tickets.setProjectAgentSettings(project.id, {
        runMode: 'bypassPermissions' as never,
      }),
    );
    expect((mode as ValidationError).fieldErrors).toHaveProperty('runMode');
    const model = errorFrom(() =>
      tickets.setProjectAgentSettings(project.id, { runModel: 'two words' }),
    );
    expect((model as ValidationError).fieldErrors).toHaveProperty('runModel');
    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      runMode: 'auto',
      runModel: null,
    });
  });

  it('keep the run mode and model out of the MCP-visible Project', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, {
      runMode: 'auto',
      runModel: 'm',
    });

    expect(tickets.getProject(project.id)).not.toHaveProperty('runMode');
    expect(tickets.getProject(project.id)).not.toHaveProperty('runModel');
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
