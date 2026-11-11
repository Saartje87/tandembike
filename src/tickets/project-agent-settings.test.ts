import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = () => mkdtempSync(join(tmpdir(), 'tandembike-repo-'));

describe("A Project's agent settings", () => {
  it('start with no repository path, Parallel runs off, agent mode off and auto run mode', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(tickets.getProjectAgentSettings(project.id)).toEqual({
      repositoryPath: null,
      checkCommand: null,
      prepareCommand: null,
      parallelRuns: false,
      agentMode: false,
      runMode: 'auto',
      models: {
        'claude-code': { runModel: null, triageModel: null },
        copilot: { runModel: null, triageModel: null },
      },
      autopilot: false,
      spendCeilingUsd: null,
      spendCeilingAiCredits: null,
      autoTriage: false,
      triageCeilingUsd: null,
      triageCeilingAiCredits: null,
      autoMerge: false,
      defaultAgentKind: 'claude-code',
    });
  });

  describe('default Agent kind (ADR 0051)', () => {
    it('is Claude Code for a new Project', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });

      expect(tickets.getProjectAgentSettings(project.id).defaultAgentKind).toBe(
        'claude-code',
      );
    });

    it('changes to another Agent kind, and back, without refusal', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });

      expect(
        tickets.setProjectAgentSettings(project.id, {
          defaultAgentKind: 'copilot',
        }).defaultAgentKind,
      ).toBe('copilot');
      expect(
        tickets.setProjectAgentSettings(project.id, {
          defaultAgentKind: 'claude-code',
        }).defaultAgentKind,
      ).toBe('claude-code');
    });

    it('refuses a kind that is not an Agent kind, naming the field', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });

      const error = errorFrom(() =>
        tickets.setProjectAgentSettings(project.id, {
          defaultAgentKind: 'cursor' as never,
        }),
      );

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors).toHaveProperty(
        'defaultAgentKind',
      );
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

  describe('AI-credit ceilings (ADR 0051)', () => {
    it('keep a Spend and a Triage ceiling in AI credits beside the dollar ones', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });

      tickets.setProjectAgentSettings(project.id, {
        spendCeilingUsd: 20,
        spendCeilingAiCredits: 300,
        triageCeilingAiCredits: 40,
      });

      expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
        spendCeilingUsd: 20,
        spendCeilingAiCredits: 300,
        triageCeilingUsd: null,
        triageCeilingAiCredits: 40,
      });
    });

    it('refuse a credit ceiling that is not a positive number', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });

      for (const field of [
        'spendCeilingAiCredits',
        'triageCeilingAiCredits',
      ] as const) {
        const error = errorFrom(() =>
          tickets.setProjectAgentSettings(project.id, { [field]: 0 }),
        );
        expect((error as ValidationError).fieldErrors).toEqual({
          [field]: 'Enter an amount of AI credits above 0.',
        });
      }
    });

    it("turn Autopilot and Auto-triage on only with a ceiling in the default agent's unit", () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      tickets.setProjectAgentSettings(project.id, {
        defaultAgentKind: 'copilot',
        spendCeilingUsd: 20,
        triageCeilingUsd: 2,
      });

      const refused = errorFrom(() =>
        tickets.setProjectAgentSettings(project.id, {
          autopilot: true,
          autoTriage: true,
        }),
      );
      expect((refused as ValidationError).fieldErrors).toEqual({
        spendCeilingAiCredits:
          'Set a Spend ceiling in AI credits before turning on Autopilot.',
        triageCeilingAiCredits:
          'Set a Triage ceiling in AI credits before turning on Auto-triage.',
      });

      expect(
        tickets.setProjectAgentSettings(project.id, {
          autopilot: true,
          autoTriage: true,
          spendCeilingAiCredits: 300,
          triageCeilingAiCredits: 40,
        }),
      ).toMatchObject({ autopilot: true, autoTriage: true });
    });

    it('never refuse a change of the default agent, though Autopilot has no ceiling in its unit', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      tickets.setProjectAgentSettings(project.id, {
        autopilot: true,
        spendCeilingUsd: 20,
      });

      expect(
        tickets.setProjectAgentSettings(project.id, {
          defaultAgentKind: 'copilot',
        }),
      ).toMatchObject({ autopilot: true, defaultAgentKind: 'copilot' });
    });
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
        models: { 'claude-code': { runModel: ' claude-opus-5-5 ' } },
      }),
    ).toMatchObject({
      runMode: 'auto',
      models: { 'claude-code': { runModel: 'claude-opus-5-5' } },
    });
    tickets.setProjectAgentSettings(project.id, { parallelRuns: true });
    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      runMode: 'auto',
      models: { 'claude-code': { runModel: 'claude-opus-5-5' } },
    });
    tickets.setProjectAgentSettings(project.id, {
      runMode: 'default',
      models: { 'claude-code': { runModel: null } },
    });
    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      runMode: 'default',
      models: { 'claude-code': { runModel: null } },
    });
    tickets.setProjectAgentSettings(project.id, {
      models: { 'claude-code': { runModel: 'x' } },
    });
    tickets.setProjectAgentSettings(project.id, {
      models: { 'claude-code': { runModel: '  ' } },
    });
    expect(
      tickets.getProjectAgentSettings(project.id).models['claude-code']
        .runModel,
    ).toBe(null);
  });

  it('keep run and triage models per Agent kind, each blank for its own default (ADR 0051)', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    tickets.setProjectAgentSettings(project.id, {
      models: {
        'claude-code': { runModel: 'claude-opus-5-5', triageModel: 'haiku' },
        copilot: { runModel: 'gpt-5' },
      },
    });
    tickets.setProjectAgentSettings(project.id, {
      models: { copilot: { triageModel: 'gpt-5-mini' } },
    });

    expect(tickets.getProjectAgentSettings(project.id).models).toEqual({
      'claude-code': { runModel: 'claude-opus-5-5', triageModel: 'haiku' },
      copilot: { runModel: 'gpt-5', triageModel: 'gpt-5-mini' },
    });
  });

  it('set, trim and clear the triage model, and refuse one with spaces', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const triageModel = () =>
      tickets.getProjectAgentSettings(project.id).models['claude-code']
        .triageModel;

    expect(triageModel()).toBe(null);
    tickets.setProjectAgentSettings(project.id, {
      models: { 'claude-code': { triageModel: ' claude-haiku-5 ' } },
    });
    expect(triageModel()).toBe('claude-haiku-5');
    const error = errorFrom(() =>
      tickets.setProjectAgentSettings(project.id, {
        models: { 'claude-code': { triageModel: 'two words' } },
      }),
    );
    expect((error as ValidationError).fieldErrors).toHaveProperty([
      'models.claude-code.triageModel',
    ]);
    tickets.setProjectAgentSettings(project.id, {
      models: { 'claude-code': { triageModel: null } },
    });
    expect(triageModel()).toBe(null);
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
      tickets.setProjectAgentSettings(project.id, {
        models: { copilot: { runModel: 'two words' } },
      }),
    );
    expect((model as ValidationError).fieldErrors).toHaveProperty([
      'models.copilot.runModel',
    ]);
    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      runMode: 'auto',
      models: { copilot: { runModel: null } },
    });
  });

  it('keep the run mode and model out of the MCP-visible Project', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, {
      runMode: 'auto',
      models: { 'claude-code': { runModel: 'm' } },
    });

    expect(tickets.getProject(project.id)).not.toHaveProperty('runMode');
    expect(tickets.getProject(project.id)).not.toHaveProperty('models');
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

  it('turn Parallel runs on, with no run count of their own: the Machine cap is the one number (T1330)', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const settings = tickets.setProjectAgentSettings(project.id, {
      parallelRuns: true,
    });

    expect(settings).toMatchObject({ parallelRuns: true });
    expect(settings).not.toHaveProperty('maxConcurrentRuns');
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

    tickets.setProjectAgentSettings(project.id, { checkCommand: 'npm test' });

    expect(tickets.getProjectAgentSettings(project.id)).toMatchObject({
      parallelRuns: true,
      checkCommand: 'npm test',
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

  it('turn Auto-merge on and off on its own, without Autopilot or a Spend ceiling', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      tickets.setProjectAgentSettings(project.id, { autoMerge: true }),
    ).toMatchObject({ autoMerge: true, autopilot: false });
    expect(tickets.getProjectAgentSettings(project.id).autoMerge).toBe(true);
    expect(tickets.getProject(project.id)).not.toHaveProperty('autoMerge');

    tickets.setProjectAgentSettings(project.id, { checkCommand: 'npm test' });
    expect(tickets.getProjectAgentSettings(project.id).autoMerge).toBe(true);

    tickets.setProjectAgentSettings(project.id, { autoMerge: false });
    expect(tickets.getProjectAgentSettings(project.id).autoMerge).toBe(false);
  });
});
