import { describe, expect, it } from 'vitest';

import {
  findServerUrl,
  lastLines,
  logRollBytes,
  restartServer,
  type ServerEffects,
  type ServerRecord,
  type StopOptions,
  serverLabel,
  serverState,
  serverStatus,
  startServer,
  startTimeoutMs,
  stopServer,
  uptimeText,
} from './server-lifecycle';

type World = {
  record: ServerRecord | null;
  alive: Set<number>;
  /** URLs that answer. */
  answering: Set<string>;
  build: boolean;
  logSize: number | null;
  log: string[];
  rolled: number;
  signals: [number, string][];
  spawned: number[];
  foreground: number[];
  said: string[];
  /** What a spawned server does: answer, die, or hang. */
  spawnedServer: 'answers' | 'dies' | 'hangs';
  /** Whether SIGTERM ends the process. */
  termWorks: boolean;
  now: Date;
};

function fakeEffects(overrides: Partial<World> = {}) {
  const world: World = {
    record: null,
    alive: new Set(),
    answering: new Set(),
    build: true,
    logSize: null,
    log: [],
    rolled: 0,
    signals: [],
    spawned: [],
    foreground: [],
    said: [],
    spawnedServer: 'answers',
    termWorks: true,
    now: new Date('2026-11-11T12:00:00Z'),
    ...overrides,
  };
  let nextPid = 500;
  const effects: ServerEffects = {
    readRecord: () => world.record,
    writeRecord: (record) => {
      world.record = record;
    },
    removeRecord: () => {
      world.record = null;
    },
    isAlive: (pid) => world.alive.has(pid),
    signal: (pid, signal) => {
      world.signals.push([pid, signal]);
      if (signal === 'SIGKILL' || world.termWorks) {
        world.alive.delete(pid);
        for (const url of [...world.answering]) world.answering.delete(url);
      }
    },
    probe: async (url) => world.answering.has(url),
    buildExists: () => world.build,
    spawnServer: (port) => {
      const pid = nextPid++;
      world.spawned.push(port);
      if (world.spawnedServer !== 'dies') world.alive.add(pid);
      if (world.spawnedServer === 'answers') {
        world.answering.add(`http://localhost:${port}`);
      }
      return pid;
    },
    serveInForeground: async (port) => {
      world.foreground.push(port);
      return 0;
    },
    logSize: () => world.logSize,
    rollLog: () => {
      world.rolled++;
      world.logSize = null;
    },
    appendLog: (line) => {
      world.log.push(line);
    },
    sleep: async (ms) => {
      world.now = new Date(world.now.getTime() + ms);
    },
    now: () => world.now,
    say: (line) => {
      world.said.push(line);
    },
    logPath: '/home/.tandembike/server.log',
  };
  return { world, effects };
}

const prepared = () => {
  const calls: string[] = [];
  return { calls, prepare: async () => void calls.push('prepare') };
};

const stopOptions = (overrides: Partial<StopOptions> = {}): StopOptions => ({
  force: false,
  openSessions: async () => [],
  confirm: async () => false,
  ...overrides,
});

const ours = (pid = 42, port = 4747): Partial<World> => ({
  record: { pid, port, startedAt: '2026-11-11T10:00:00.000Z' },
  alive: new Set([pid]),
  answering: new Set([`http://localhost:${port}`]),
});

describe('findServerUrl', () => {
  it('takes TANDEMBIKE_URL first, then the port in server.json, then 4747', () => {
    const record = { pid: 1, port: 4848, startedAt: '' };
    expect(findServerUrl('http://localhost:9000/', record)).toBe(
      'http://localhost:9000',
    );
    expect(findServerUrl(undefined, record)).toBe('http://localhost:4848');
    expect(findServerUrl(undefined, null)).toBe('http://localhost:4747');
  });
});

describe('startServer', () => {
  it('refuses a missing build with exit 1 and starts nothing', async () => {
    const { world, effects } = fakeEffects({ build: false });
    const { calls, prepare } = prepared();

    expect(await startServer(effects, { port: null, prepare })).toBe(1);
    expect(world.said.join('\n')).toContain('run `npm run build` first');
    expect(world.spawned).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('says already running and exits 0 when a server answers', async () => {
    const { world, effects } = fakeEffects({
      answering: new Set(['http://localhost:4747']),
    });
    const { calls, prepare } = prepared();

    expect(await startServer(effects, { port: null, prepare })).toBe(0);
    expect(world.said).toEqual([
      'Tandembike is already running at http://localhost:4747.',
    ]);
    expect(world.spawned).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('says already running for its own recorded server on its port', async () => {
    const { world, effects } = fakeEffects(ours(42, 4848));

    expect(await startServer(effects, { port: null, ...prepared() })).toBe(0);
    expect(world.said).toEqual([
      'Tandembike is already running at http://localhost:4848.',
    ]);
  });

  it('runs the first-run steps, spawns, records, waits and prints the URL and log', async () => {
    const { world, effects } = fakeEffects();
    const { calls, prepare } = prepared();

    expect(await startServer(effects, { port: null, prepare })).toBe(0);
    expect(calls).toEqual(['prepare']);
    expect(world.spawned).toEqual([4747]);
    expect(world.record).toEqual({
      pid: 500,
      port: 4747,
      startedAt: '2026-11-11T12:00:00.000Z',
    });
    expect(world.said.join('\n')).toContain(
      'Tandembike is running at http://localhost:4747 (pid 500).',
    );
    expect(world.said.join('\n')).toContain(
      'Logs: /home/.tandembike/server.log',
    );
  });

  it('serves on the port asked for and records it', async () => {
    const { world, effects } = fakeEffects();

    expect(await startServer(effects, { port: 4848, ...prepared() })).toBe(0);
    expect(world.spawned).toEqual([4848]);
    expect(world.record?.port).toBe(4848);
    expect(findServerUrl(undefined, world.record)).toBe(
      'http://localhost:4848',
    );
  });

  it('reports a timeout with the log path and exit 1 when the server never answers', async () => {
    const { world, effects } = fakeEffects({ spawnedServer: 'hangs' });

    expect(await startServer(effects, { port: null, ...prepared() })).toBe(1);
    expect(world.said.join('\n')).toContain(
      `did not answer at http://localhost:4747 within ${startTimeoutMs / 1000} seconds`,
    );
    expect(world.said.join('\n')).toContain('/home/.tandembike/server.log');
  });

  it('reports a server that exits before it answers and forgets it', async () => {
    const { world, effects } = fakeEffects({ spawnedServer: 'dies' });

    expect(await startServer(effects, { port: null, ...prepared() })).toBe(1);
    expect(world.said.join('\n')).toContain('exited before it answered');
    expect(world.record).toBeNull();
  });

  it('serves in the foreground after the same steps, writing no server.json', async () => {
    const { world, effects } = fakeEffects();
    const { calls, prepare } = prepared();

    expect(
      await startServer(effects, { port: 4848, foreground: true, prepare }),
    ).toBe(0);
    expect(calls).toEqual(['prepare']);
    expect(world.foreground).toEqual([4848]);
    expect(world.spawned).toEqual([]);
    expect(world.record).toBeNull();
  });

  it('refuses a missing build in the foreground too', async () => {
    const { world, effects } = fakeEffects({ build: false });

    expect(
      await startServer(effects, {
        port: null,
        foreground: true,
        ...prepared(),
      }),
    ).toBe(1);
    expect(world.foreground).toEqual([]);
  });

  it('removes a stale server.json and starts', async () => {
    const { world, effects } = fakeEffects({
      record: { pid: 7, port: 4747, startedAt: '2026-11-10T00:00:00.000Z' },
    });

    expect(await startServer(effects, { port: null, ...prepared() })).toBe(0);
    expect(world.spawned).toEqual([4747]);
    expect(world.record?.pid).toBe(500);
  });
});

describe('the automatic start (T1354)', () => {
  it('prints one line on success', async () => {
    const { world, effects } = fakeEffects();

    expect(
      await startServer(effects, {
        port: null,
        automatic: true,
        ...prepared(),
      }),
    ).toBe(0);
    expect(world.said).toEqual([
      'Started Tandembike on :4747 (logs: /home/.tandembike/server.log)',
    ]);
  });

  it.each([
    [{ build: false }, 'npm run build'],
    [{ spawnedServer: 'hangs' as const }, 'did not answer'],
  ])(
    'prints why, the log path and the start hint on failure (%j)',
    async (overrides, why) => {
      const { world, effects } = fakeEffects(overrides);

      expect(
        await startServer(effects, {
          port: null,
          automatic: true,
          ...prepared(),
        }),
      ).toBe(1);
      const said = world.said.join('\n');
      expect(said).toContain(why);
      expect(said).toContain('Logs: /home/.tandembike/server.log');
      expect(said).toContain('`tandembike start`');
    },
  );
});

describe('the log roll-over (T1351)', () => {
  it('appends a started-at line to a small log without rolling it', async () => {
    const { world, effects } = fakeEffects({ logSize: logRollBytes });

    await startServer(effects, { port: null, ...prepared() });
    expect(world.rolled).toBe(0);
    expect(world.log).toEqual(['started at 2026-11-11T12:00:00.000Z']);
  });

  it('rolls a log over 5 MB to server.log.1 before the started-at line', async () => {
    const { world, effects } = fakeEffects({ logSize: logRollBytes + 1 });

    await startServer(effects, { port: null, ...prepared() });
    expect(world.rolled).toBe(1);
    expect(world.log).toEqual(['started at 2026-11-11T12:00:00.000Z']);
  });

  it('starts a log when there is none', async () => {
    const { world, effects } = fakeEffects({ logSize: null });

    await startServer(effects, { port: null, ...prepared() });
    expect(world.rolled).toBe(0);
    expect(world.log).toHaveLength(1);
  });
});

describe('stopServer', () => {
  it('says not running and exits 0 when nothing runs', async () => {
    const { world, effects } = fakeEffects();

    expect(await stopServer(effects, stopOptions())).toBe(0);
    expect(world.said).toEqual(['Tandembike is not running.']);
  });

  it('refuses a server it did not start', async () => {
    const { world, effects } = fakeEffects({
      answering: new Set(['http://localhost:4747']),
    });

    expect(await stopServer(effects, stopOptions())).toBe(1);
    expect(world.said.join('\n')).toContain(
      'not started by `tandembike start`',
    );
    expect(world.signals).toEqual([]);
  });

  it('sends SIGTERM, waits for the exit and removes server.json', async () => {
    const { world, effects } = fakeEffects(ours());

    expect(await stopServer(effects, stopOptions())).toBe(0);
    expect(world.signals).toEqual([[42, 'SIGTERM']]);
    expect(world.record).toBeNull();
    expect(world.said).toEqual(['Stopped Tandembike (pid 42).']);
  });

  it('escalates to SIGKILL after the timeout, saying so', async () => {
    const { world, effects } = fakeEffects({ ...ours(), termWorks: false });

    expect(await stopServer(effects, stopOptions())).toBe(0);
    expect(world.signals).toEqual([
      [42, 'SIGTERM'],
      [42, 'SIGKILL'],
    ]);
    expect(world.said.join('\n')).toContain('sending SIGKILL');
    expect(world.record).toBeNull();
  });

  it('removes a stale server.json and says not running', async () => {
    const { world, effects } = fakeEffects({
      record: { pid: 7, port: 4747, startedAt: '' },
    });

    expect(await stopServer(effects, stopOptions())).toBe(0);
    expect(world.record).toBeNull();
    expect(world.signals).toEqual([]);
    expect(world.said).toEqual(['Tandembike is not running.']);
  });
});

describe('stopServer with open Terminal sessions (T1352)', () => {
  const sessions = async () => [
    { conversationId: 3, ticketNumber: 42 },
    { conversationId: 4, ticketNumber: 7 },
  ];

  it('names them by Ticket and stops on a yes', async () => {
    const { world, effects } = fakeEffects(ours());
    const asked: string[] = [];

    expect(
      await stopServer(
        effects,
        stopOptions({
          openSessions: sessions,
          confirm: async (question) => {
            asked.push(question);
            return true;
          },
        }),
      ),
    ).toBe(0);
    expect(world.said[0]).toContain('T42, T7');
    expect(asked).toEqual(['Stop anyway? [y/N] ']);
    expect(world.signals).toEqual([[42, 'SIGTERM']]);
  });

  it('leaves the server running on anything but yes', async () => {
    const { world, effects } = fakeEffects(ours());

    expect(
      await stopServer(
        effects,
        stopOptions({ openSessions: sessions, confirm: async () => false }),
      ),
    ).toBe(1);
    expect(world.signals).toEqual([]);
    expect(world.record?.pid).toBe(42);
  });

  it('names a Plan session, which has no Ticket, as a Plan', async () => {
    const { world, effects } = fakeEffects(ours());

    await stopServer(
      effects,
      stopOptions({
        openSessions: async () => [{ conversationId: 9, ticketNumber: null }],
        confirm: null,
      }),
    );
    expect(world.said[0]).toContain('A Terminal session is open: a Plan.');
  });

  it('stops without asking with --force', async () => {
    const { world, effects } = fakeEffects(ours());
    let asked = false;

    expect(
      await stopServer(
        effects,
        stopOptions({
          force: true,
          openSessions: sessions,
          confirm: async () => {
            asked = true;
            return false;
          },
        }),
      ),
    ).toBe(0);
    expect(asked).toBe(false);
    expect(world.signals).toEqual([[42, 'SIGTERM']]);
  });

  it('refuses without a terminal, mentioning --force', async () => {
    const { world, effects } = fakeEffects(ours());

    expect(
      await stopServer(
        effects,
        stopOptions({ openSessions: sessions, confirm: null }),
      ),
    ).toBe(1);
    expect(world.said.join('\n')).toContain('tandembike stop --force');
    expect(world.signals).toEqual([]);
  });
});

describe('restartServer', () => {
  it('stops then starts on the port recorded in server.json', async () => {
    const { world, effects } = fakeEffects(ours(42, 4848));

    expect(await restartServer(effects, stopOptions(), prepared())).toBe(0);
    expect(world.signals).toEqual([[42, 'SIGTERM']]);
    expect(world.spawned).toEqual([4848]);
    expect(world.record?.port).toBe(4848);
  });

  it('starts nothing when stop refuses a server it did not start', async () => {
    const { world, effects } = fakeEffects({
      answering: new Set(['http://localhost:4747']),
    });

    expect(await restartServer(effects, stopOptions(), prepared())).toBe(1);
    expect(world.spawned).toEqual([]);
  });
});

describe('serverStatus', () => {
  it('prints pid, URL, uptime and log path and exits 0 when running', async () => {
    const { world, effects } = fakeEffects(ours(42, 4848));

    expect(await serverStatus(effects)).toBe(0);
    const said = world.said.join('\n');
    expect(said).toContain('http://localhost:4848');
    expect(said).toContain('42');
    expect(said).toContain('2h 0m');
    expect(said).toContain('/home/.tandembike/server.log');
  });

  it('exits 1 when not running, cleaning up a stale server.json', async () => {
    const { world, effects } = fakeEffects({
      record: { pid: 7, port: 4747, startedAt: '' },
    });

    expect(await serverStatus(effects)).toBe(1);
    expect(world.record).toBeNull();
    expect(world.said.join('\n')).toContain('not running');
  });

  it('reports a server it did not start as running, not started by tandembike start', async () => {
    const { world, effects } = fakeEffects({
      answering: new Set(['http://localhost:4747']),
    });

    expect(await serverStatus(effects)).toBe(0);
    expect(world.said).toEqual([
      'Tandembike is running at http://localhost:4747, not started by `tandembike start`.',
    ]);
  });

  it('looks at TANDEMBIKE_URL when set', async () => {
    const { world, effects } = fakeEffects({
      answering: new Set(['http://localhost:9000']),
    });
    effects.envUrl = 'http://localhost:9000';

    expect(await serverStatus(effects)).toBe(0);
    expect(world.said[0]).toContain('http://localhost:9000');
  });
});

describe('serverLabel', () => {
  it('names the state and the port', async () => {
    expect(
      serverLabel(await serverState(fakeEffects(ours(42, 4848)).effects)),
    ).toBe('Server: running on :4848');
    expect(serverLabel(await serverState(fakeEffects().effects))).toBe(
      'Server: not running',
    );
    expect(
      serverLabel(
        await serverState(
          fakeEffects({ answering: new Set(['http://localhost:4747']) })
            .effects,
        ),
      ),
    ).toContain('not started by');
  });
});

describe('uptimeText', () => {
  const at = new Date('2026-11-11T00:00:00Z');
  it.each([
    [5, '5m'],
    [125, '2h 5m'],
    [60 * 24 * 2 + 90, '2d 1h'],
  ])('%i minutes is %s', (minutes, text) => {
    expect(uptimeText(at, new Date(at.getTime() + minutes * 60000))).toBe(text);
  });
});

describe('lastLines (T1351)', () => {
  it('keeps the last lines, ignoring the final newline', () => {
    const text = `${Array.from({ length: 150 }, (_, i) => `line ${i + 1}`).join('\n')}\n`;
    const lines = lastLines(text, 100);
    expect(lines).toHaveLength(100);
    expect(lines[0]).toBe('line 51');
    expect(lines[99]).toBe('line 150');
  });

  it('keeps a short log whole and an empty one empty', () => {
    expect(lastLines('a\nb\n', 100)).toEqual(['a', 'b']);
    expect(lastLines('', 100)).toEqual([]);
  });
});
