// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  claudeCommandText,
  copyFirstRunDatabase,
  decideOffer,
  firstRunCopyBlocker,
  markOffersMade,
  mcpRegistration,
  offersMade,
  planFirstRunCopy,
  planMcpOffer,
  planPluginOffer,
  pluginInstallState,
  shouldOfferMcp,
  shouldOfferPlugin,
} from './install';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('first-run copy', () => {
  let root: string;
  let source: string;
  let target: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tandembike-install-'));
    source = join(root, 'checkout', 'data');
    target = join(root, 'home', '.tandembike');
    mkdirSync(source, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('plans nothing when the checkout has no database', () => {
    expect(planFirstRunCopy(source, target)).toEqual([]);
  });

  it('plans the database with its -wal and -shm files', () => {
    for (const name of ['ticket.db', 'ticket.db-wal', 'ticket.db-shm']) {
      writeFileSync(join(source, name), name);
    }

    expect(planFirstRunCopy(source, target)).toEqual([
      'ticket.db',
      'ticket.db-wal',
      'ticket.db-shm',
    ]);
  });

  it('skips a -wal file that does not exist', () => {
    writeFileSync(join(source, 'ticket.db'), 'db');

    expect(planFirstRunCopy(source, target)).toEqual(['ticket.db']);
  });

  it('plans nothing when the target already has a database', () => {
    writeFileSync(join(source, 'ticket.db'), 'old');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'ticket.db'), 'mine');

    expect(planFirstRunCopy(source, target)).toEqual([]);
  });

  it('plans nothing when source and target are the same folder', () => {
    writeFileSync(join(source, 'ticket.db'), 'db');

    expect(planFirstRunCopy(source, source)).toEqual([]);
  });

  it('copies the files, creating the folder, and keeps the originals', () => {
    writeFileSync(join(source, 'ticket.db'), 'db');
    writeFileSync(join(source, 'ticket.db-wal'), 'wal');

    const copied = copyFirstRunDatabase(source, target);

    expect(copied).toEqual(['ticket.db', 'ticket.db-wal']);
    expect(readFileSync(join(target, 'ticket.db'), 'utf8')).toBe('db');
    expect(readFileSync(join(target, 'ticket.db-wal'), 'utf8')).toBe('wal');
    expect(existsSync(join(source, 'ticket.db'))).toBe(true);
  });

  it('never overwrites an existing database', () => {
    writeFileSync(join(source, 'ticket.db'), 'old');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'ticket.db'), 'mine');

    expect(copyFirstRunDatabase(source, target)).toEqual([]);
    expect(readFileSync(join(target, 'ticket.db'), 'utf8')).toBe('mine');
  });
});

describe('first-run copy blocker', () => {
  let root: string;
  let source: string;
  let target: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tandembike-blocker-'));
    source = join(root, 'data');
    target = join(root, 'home');
    mkdirSync(source, { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(join(source, 'ticket.db'), 'old');
    writeFileSync(join(source, 'ticket.db-wal'), 'wal');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('has no blocker when the target is empty', () => {
    expect(firstRunCopyBlocker(source, target)).toBeUndefined();
  });

  it('names an existing -wal file and copies nothing, not even the database', () => {
    writeFileSync(join(target, 'ticket.db-wal'), 'mine');

    expect(firstRunCopyBlocker(source, target)).toContain('ticket.db-wal');
    expect(copyFirstRunDatabase(source, target)).toEqual([]);
    expect(existsSync(join(target, 'ticket.db'))).toBe(false);
    expect(readFileSync(join(target, 'ticket.db-wal'), 'utf8')).toBe('mine');
  });

  it('stays quiet when the data folder has its database, and copies nothing', () => {
    writeFileSync(join(target, 'ticket.db'), 'mine');

    expect(firstRunCopyBlocker(source, target)).toBeUndefined();
    expect(copyFirstRunDatabase(source, target)).toEqual([]);
    expect(existsSync(join(target, 'ticket.db-wal'))).toBe(false);
  });

  it('has no blocker when the checkout has no database', () => {
    rmSync(join(source, 'ticket.db'));
    writeFileSync(join(target, 'ticket.db'), 'mine');

    expect(firstRunCopyBlocker(source, target)).toBeUndefined();
  });
});

describe('decideOffer', () => {
  const ask = { action: 'ask' as const, steps: [], text: 'x' };

  it('asks and marks the offer made on a terminal', () => {
    expect(decideOffer(ask, true)).toEqual({ mode: 'ask', markMade: true });
  });

  it('prints without marking the offer made when there is no terminal', () => {
    expect(decideOffer(ask, false)).toEqual({
      mode: 'print',
      markMade: false,
    });
  });

  it('prints and marks when claude is not on the path', () => {
    expect(decideOffer({ ...ask, action: 'print' }, false)).toEqual({
      mode: 'print',
      markMade: true,
    });
  });

  it('skips and marks when already registered', () => {
    expect(decideOffer({ ...ask, action: 'skip' }, true)).toEqual({
      mode: 'skip',
      markMade: true,
    });
  });
});

describe('offers made', () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tandembike-config-'));
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('are not made before anything is recorded', () => {
    expect(offersMade(folder)).toEqual([]);
  });

  it('are remembered in config.json, once each', () => {
    markOffersMade(folder, 'mcp');
    markOffersMade(folder, 'mcp');
    markOffersMade(folder, 'plugin');

    expect(offersMade(folder)).toEqual(['mcp', 'plugin']);
    expect(
      JSON.parse(readFileSync(join(folder, 'config.json'), 'utf8')),
    ).toEqual({ offersMade: ['mcp', 'plugin'] });
  });

  it('are empty when config.json is unreadable', () => {
    writeFileSync(join(folder, 'config.json'), 'not json');

    expect(offersMade(folder)).toEqual([]);
  });
});

const addText =
  "claude mcp add --scope user --transport http tandembike http://localhost:4747/api/mcp --header 'X-Tandembike-Cwd: ${PWD}' --header 'X-Tandembike-Run: ${TANDEMBIKE_RUN:-}'";
const removeText = 'claude mcp remove --scope user tandembike';

describe('shouldOfferMcp', () => {
  it('offers on the first start only', () => {
    expect(shouldOfferMcp([], false)).toBe(true);
    expect(shouldOfferMcp(['mcp'], false)).toBe(false);
  });

  it('offers again when asked with tandembike mcp', () => {
    expect(shouldOfferMcp(['mcp'], true)).toBe(true);
  });
});

describe('the run header update offer (T1238)', () => {
  it('offers an outdated registration once more under mcp-run-header', () => {
    expect(shouldOfferMcp(['mcp'], false, 'outdated')).toBe(true);
    expect(shouldOfferMcp(['mcp', 'mcp-run-header'], false, 'outdated')).toBe(
      false,
    );
  });

  it('does not re-offer a current or missing registration', () => {
    expect(shouldOfferMcp(['mcp'], false, 'current')).toBe(false);
    expect(shouldOfferMcp(['mcp'], false, 'none')).toBe(false);
  });
});

describe('mcpRegistration', () => {
  it('is none without a tandembike server', () => {
    expect(mcpRegistration({})).toBe('none');
    expect(mcpRegistration({ mcpServers: {} })).toBe('none');
    expect(mcpRegistration(null)).toBe('none');
  });

  it('is outdated for a registration without the folder header', () => {
    expect(
      mcpRegistration({
        mcpServers: {
          tandembike: { type: 'http', url: 'http://localhost:4747/api/mcp' },
        },
      }),
    ).toBe('outdated');
  });

  it('is outdated with the folder header only (T1238)', () => {
    expect(
      mcpRegistration({
        mcpServers: {
          tandembike: {
            type: 'http',
            url: 'http://localhost:4747/api/mcp',
            headers: { 'X-Tandembike-Cwd': '${PWD}' },
          },
        },
      }),
    ).toBe('outdated');
  });

  it('is current with the folder header and the run header', () => {
    expect(
      mcpRegistration({
        mcpServers: {
          tandembike: {
            type: 'http',
            url: 'http://localhost:4747/api/mcp',
            headers: {
              'X-Tandembike-Cwd': '${PWD}',
              'X-Tandembike-Run': '${TANDEMBIKE_RUN:-}',
            },
          },
        },
      }),
    ).toBe('current');
  });
});

describe('planMcpOffer', () => {
  it('asks to add when nothing is registered', () => {
    const plan = planMcpOffer({ claudeOnPath: true, registration: 'none' });
    expect(plan.action).toBe('ask');
    expect(plan.text).toBe(addText);
    expect(plan.steps).toEqual([
      [
        'mcp',
        'add',
        '--scope',
        'user',
        '--transport',
        'http',
        'tandembike',
        'http://localhost:4747/api/mcp',
        '--header',
        'X-Tandembike-Cwd: ${PWD}',
        '--header',
        'X-Tandembike-Run: ${TANDEMBIKE_RUN:-}',
      ],
    ]);
  });

  it('asks to replace an outdated registration: remove, then add', () => {
    const plan = planMcpOffer({ claudeOnPath: true, registration: 'outdated' });
    expect(plan.action).toBe('ask');
    expect(plan.text).toBe(`${removeText}\n${addText}`);
    expect(plan.steps.map((s) => s[1])).toEqual(['remove', 'add']);
  });

  it('only prints the command when claude is not on the PATH', () => {
    const plan = planMcpOffer({ claudeOnPath: false, registration: 'none' });
    expect(plan.action).toBe('print');
    expect(plan.text).toBe(addText);
  });

  it('prints the replacing commands when claude is missing and one exists', () => {
    const plan = planMcpOffer({
      claudeOnPath: false,
      registration: 'outdated',
    });
    expect(plan.action).toBe('print');
    expect(plan.text).toBe(`${removeText}\n${addText}`);
  });

  it('does nothing when the current registration exists', () => {
    expect(
      planMcpOffer({ claudeOnPath: true, registration: 'current' }).action,
    ).toBe('skip');
  });
});

describe('claudeCommandText', () => {
  it('quotes arguments with spaces', () => {
    expect(claudeCommandText([['mcp', 'x', 'a b']])).toBe("claude mcp x 'a b'");
  });
});

describe('pluginInstallState', () => {
  const file = (entries: unknown) => ({ version: 2, plugins: entries });
  const user = (version: string) => [{ scope: 'user', version }];

  it('is none without a user-scope tandembike install', () => {
    expect(pluginInstallState(null, '1.4.1')).toBe('none');
    expect(pluginInstallState(file({}), '1.4.1')).toBe('none');
    expect(
      pluginInstallState(
        file({
          'tandembike@tandembike': [{ scope: 'project', version: '1.4.1' }],
        }),
        '1.4.1',
      ),
    ).toBe('none');
  });

  it('is older when the installed version is below the bundled one', () => {
    for (const installed of ['1.4.0', '1.3.9', '0.9.9', '1.4.1-beta']) {
      expect(
        pluginInstallState(
          file({ 'tandembike@tandembike': user(installed) }),
          '1.4.1',
        ),
      ).toBe('older');
    }
    expect(
      pluginInstallState(
        file({ 'tandembike@tandembike': user('1.10.0') }),
        '1.9.0',
      ),
    ).toBe('current');
  });

  it('is current at or above the bundled version', () => {
    expect(
      pluginInstallState(
        file({ 'tandembike@tandembike': user('1.4.1') }),
        '1.4.1',
      ),
    ).toBe('current');
    expect(
      pluginInstallState(
        file({ 'tandembike@tandembike': user('2.0.0') }),
        '1.4.1',
      ),
    ).toBe('current');
  });

  it('treats an install with no readable version as older', () => {
    expect(
      pluginInstallState(
        file({ 'tandembike@tandembike': [{ scope: 'user' }] }),
        '1.4.1',
      ),
    ).toBe('older');
  });
});

describe('planPluginOffer', () => {
  it('adds the checkout as a marketplace and installs when none', () => {
    const plan = planPluginOffer({
      claudeOnPath: true,
      state: 'none',
      checkout: '/src/tandembike',
    });
    expect(plan.action).toBe('ask');
    expect(plan.steps).toEqual([
      ['plugin', 'marketplace', 'add', '/src/tandembike'],
      ['plugin', 'install', 'tandembike@tandembike', '--scope', 'user'],
    ]);
    expect(plan.text).toBe(
      'claude plugin marketplace add /src/tandembike\nclaude plugin install tandembike@tandembike --scope user',
    );
  });

  it('updates the marketplace and the plugin when older', () => {
    const plan = planPluginOffer({
      claudeOnPath: true,
      state: 'older',
      checkout: '/src/tandembike',
    });
    expect(plan.action).toBe('ask');
    expect(plan.steps).toEqual([
      ['plugin', 'marketplace', 'update', 'tandembike'],
      ['plugin', 'update', 'tandembike@tandembike'],
    ]);
  });

  it('skips when current', () => {
    expect(
      planPluginOffer({ claudeOnPath: true, state: 'current', checkout: '/x' }),
    ).toEqual({ action: 'skip', steps: [], text: '' });
  });

  it('prints the steps when claude is not on PATH', () => {
    const plan = planPluginOffer({
      claudeOnPath: false,
      state: 'none',
      checkout: '/x',
    });
    expect(plan.action).toBe('print');
    expect(plan.steps).toHaveLength(2);
  });

  it('quotes a checkout path with spaces', () => {
    const plan = planPluginOffer({
      claudeOnPath: true,
      state: 'none',
      checkout: '/my src/t',
    });
    expect(plan.text.split('\n')[0]).toBe(
      "claude plugin marketplace add '/my src/t'",
    );
  });
});

describe('shouldOfferPlugin', () => {
  it('offers on first run, when older, or when asked for', () => {
    expect(shouldOfferPlugin([], 'none', false)).toBe(true);
    expect(shouldOfferPlugin(['plugin'], 'older', false)).toBe(true);
    expect(shouldOfferPlugin(['plugin'], 'none', true)).toBe(true);
  });

  it('stays quiet once made and not older', () => {
    expect(shouldOfferPlugin(['plugin'], 'none', false)).toBe(false);
    expect(shouldOfferPlugin(['plugin'], 'current', false)).toBe(false);
  });
});
