import { isLoopbackAddress } from '../http/loopback-address';
import { appPort } from '../http/server-port';

/**
 * The lifecycle of the background server (`tandembike start`, `stop`,
 * `restart`, `status`; ADR 0052): every decision and message, over effects
 * the CLI entry injects (`cli.ts` wires the real ones, tests fake them).
 * `server.json` records the server `tandembike start` spawned; a recorded pid
 * that is no longer alive is removed and treated as not running.
 */

/** What `server.json` holds for the server `tandembike start` spawned. */
export type ServerRecord = { pid: number; port: number; startedAt: string };

/** A Terminal Conversation open in a terminal, named for `stop`'s question. */
export type OpenSession = {
  conversationId: number;
  /** Null for a Plan, which is about its Project. */
  ticketNumber: number | null;
};

export type ServerEffects = {
  readRecord(): ServerRecord | null;
  writeRecord(record: ServerRecord): void;
  removeRecord(): void;
  isAlive(pid: number): boolean;
  signal(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void;
  /** Whether anything answers HTTP at the URL. */
  probe(url: string): Promise<boolean>;
  buildExists(): boolean;
  /** Spawns the production server detached, its output appended to the log; returns its pid. */
  spawnServer(port: number): number;
  /** Serves in this terminal until the server exits; returns its exit code. */
  serveInForeground(port: number): Promise<number>;
  /** The log's size in bytes, or null when there is none. */
  logSize(): number | null;
  /** Renames the log to `server.log.1`, replacing an earlier one. */
  rollLog(): void;
  appendLog(line: string): void;
  sleep(ms: number): Promise<void>;
  now(): Date;
  say(line: string): void;
  logPath: string;
  /** `TANDEMBIKE_URL`, when set. */
  envUrl?: string;
};

/** How long `start` waits for the server to answer. */
export const startTimeoutMs = 60_000;
/** How long `stop` waits for the server to exit before SIGKILL. */
export const stopTimeoutMs = 10_000;
/** How often `start` and `stop` look again. */
export const pollMs = 250;
/** The log is rolled over on start once it passes this size. */
export const logRollBytes = 5 * 1024 * 1024;

export const localUrl = (port: number): string => `http://localhost:${port}`;

/**
 * Where clients find the server: `TANDEMBIKE_URL`, else the port in
 * `server.json`, else the app port.
 */
export function findServerUrl(
  envUrl: string | undefined,
  record: ServerRecord | null,
): string {
  if (envUrl) return envUrl.replace(/\/+$/, '');
  return localUrl(record?.port ?? appPort);
}

/**
 * Whether `url` names this machine: only then can the automatic start serve
 * it (a `TANDEMBIKE_URL` naming another host is never started here).
 */
export function isLocalUrl(url: string): boolean {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  return host === 'localhost' || isLoopbackAddress(host);
}

/** The recorded server, after removing a `server.json` whose pid is gone. */
export function liveRecord(effects: ServerEffects): ServerRecord | null {
  const record = effects.readRecord();
  if (!record) return null;
  if (effects.isAlive(record.pid)) return record;
  effects.removeRecord();
  return null;
}

export type ServerState =
  | { state: 'ours'; record: ServerRecord; url: string }
  | { state: 'foreign'; url: string }
  | { state: 'stopped'; url: string };

/** Whether a server runs, and whether `tandembike start` started it. */
export async function serverState(
  effects: ServerEffects,
): Promise<ServerState> {
  const record = liveRecord(effects);
  const url = findServerUrl(effects.envUrl, record);
  if (record) return { state: 'ours', record, url };
  return (await effects.probe(url))
    ? { state: 'foreign', url }
    : { state: 'stopped', url };
}

/** The Server entry's label in the wizard. */
export function serverLabel(state: ServerState): string {
  if (state.state === 'stopped') return 'Server: not running';
  const port = new URL(state.url).port || String(appPort);
  return state.state === 'ours'
    ? `Server: running on :${port}`
    : `Server: running on :${port}, not started by \`tandembike start\``;
}

const notStartedHere = (url: string) =>
  `Tandembike is running at ${url}, not started by \`tandembike start\`.`;

export type StartOptions = {
  /** `-p`/`--port`; null for the default. */
  port: number | null;
  foreground?: boolean;
  /**
   * The first-run steps run once the build is there and no server answers:
   * the database copy and, for a typed `start`, the MCP and plugin offers.
   */
  prepare(): Promise<void>;
  /**
   * The automatic start of a session command (T1354): one line on success,
   * and the `tandembike start` hint on failure.
   */
  automatic?: boolean;
};

const startHint = (logPath: string) =>
  `Logs: ${logPath}\nRun \`tandembike start\` to start Tandembike and see why.`;

/**
 * `tandembike start`: refuse a missing build, say "already running" when a
 * server answers, run the first-run steps, roll the log, spawn the server,
 * record it and wait until it answers. Returns the exit code.
 */
export async function startServer(
  effects: ServerEffects,
  options: StartOptions,
): Promise<number> {
  const fail = (message: string) => {
    effects.say(
      options.automatic ? `${message}\n${startHint(effects.logPath)}` : message,
    );
    return 1;
  };
  if (!effects.buildExists()) {
    return fail(
      'Tandembike has no production build: run `npm run build` first, in its checkout.',
    );
  }
  const record = liveRecord(effects);
  if (record) {
    effects.say(`Tandembike is already running at ${localUrl(record.port)}.`);
    return 0;
  }
  const port = options.port ?? appPort;
  const url = localUrl(port);
  if (await effects.probe(url)) {
    effects.say(`Tandembike is already running at ${url}.`);
    return 0;
  }
  await options.prepare();
  if (options.foreground) return effects.serveInForeground(port);

  const startedAt = effects.now();
  rollLog(effects, startedAt);
  const pid = effects.spawnServer(port);
  effects.writeRecord({ pid, port, startedAt: startedAt.toISOString() });

  for (let waited = 0; ; waited += pollMs) {
    if (await effects.probe(url)) break;
    if (!effects.isAlive(pid)) {
      effects.removeRecord();
      return fail(
        `Tandembike exited before it answered at ${url}. See the log: ${effects.logPath}`,
      );
    }
    if (waited >= startTimeoutMs) {
      return fail(
        `Tandembike did not answer at ${url} within ${startTimeoutMs / 1000} seconds. See the log: ${effects.logPath}`,
      );
    }
    await effects.sleep(pollMs);
  }
  effects.say(
    options.automatic
      ? `Started Tandembike on :${port} (logs: ${effects.logPath})`
      : `Tandembike is running at ${url} (pid ${pid}).\nLogs: ${effects.logPath}`,
  );
  return 0;
}

/**
 * Rolls the log over to `server.log.1` once it passes 5 MB, then marks the
 * start in it.
 */
function rollLog(effects: ServerEffects, startedAt: Date): void {
  const size = effects.logSize();
  if (size !== null && size > logRollBytes) effects.rollLog();
  effects.appendLog(`started at ${startedAt.toISOString()}`);
}

/** How many lines `tandembike logs` prints. */
export const logTailLines = 100;

/** The last `count` lines of a log's text, without the final newline. */
export function lastLines(text: string, count: number): string[] {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.slice(-count);
}

export type StopOptions = {
  force: boolean;
  /** The open Terminal sessions, asked of the server; empty when it cannot say. */
  openSessions(url: string): Promise<OpenSession[]>;
  /** Asks `Stop anyway? [y/N]`; null without a terminal to ask in. */
  confirm: ((question: string) => Promise<boolean>) | null;
};

/**
 * `tandembike stop`: SIGTERM the recorded server and wait until it is gone,
 * escalating to SIGKILL; refuse a server it did not start. Returns the exit
 * code.
 */
export async function stopServer(
  effects: ServerEffects,
  options: StopOptions,
): Promise<number> {
  const state = await serverState(effects);
  if (state.state === 'stopped') {
    effects.say('Tandembike is not running.');
    return 0;
  }
  if (state.state === 'foreign') {
    effects.say(
      `${notStartedHere(state.url)} \`tandembike stop\` only stops a server \`tandembike start\` started.`,
    );
    return 1;
  }
  const { pid } = state.record;

  if (!options.force) {
    const sessions = await options.openSessions(state.url);
    if (sessions.length > 0) {
      const named = sessions
        .map((s) => (s.ticketNumber === null ? 'a Plan' : `T${s.ticketNumber}`))
        .join(', ');
      effects.say(
        `${sessions.length === 1 ? 'A Terminal session is' : `${sessions.length} Terminal sessions are`} open: ${named}. Stopping Tandembike cuts them off.`,
      );
      if (!options.confirm) {
        effects.say(
          'Not stopped. Run `tandembike stop --force` to stop anyway.',
        );
        return 1;
      }
      if (!(await options.confirm('Stop anyway? [y/N] '))) {
        effects.say('Not stopped.');
        return 1;
      }
    }
  }

  effects.signal(pid, 'SIGTERM');
  if (!(await waitForExit(effects, pid))) {
    effects.say(
      `Tandembike did not stop within ${stopTimeoutMs / 1000} seconds; sending SIGKILL.`,
    );
    effects.signal(pid, 'SIGKILL');
    await waitForExit(effects, pid);
  }
  effects.removeRecord();
  effects.say(`Stopped Tandembike (pid ${pid}).`);
  return 0;
}

async function waitForExit(
  effects: ServerEffects,
  pid: number,
): Promise<boolean> {
  for (let waited = 0; waited < stopTimeoutMs; waited += pollMs) {
    if (!effects.isAlive(pid)) return true;
    await effects.sleep(pollMs);
  }
  return !effects.isAlive(pid);
}

/**
 * `tandembike restart`: `stop`, then `start` on the port recorded in
 * `server.json`. Returns the exit code.
 */
export async function restartServer(
  effects: ServerEffects,
  stop: StopOptions,
  start: Omit<StartOptions, 'port' | 'foreground' | 'automatic'>,
): Promise<number> {
  const port = liveRecord(effects)?.port ?? null;
  const stopped = await stopServer(effects, stop);
  if (stopped !== 0) return stopped;
  return startServer(effects, { ...start, port });
}

/** The time since `startedAt` in words, such as `2h 5m`. */
export function uptimeText(startedAt: Date, now: Date): string {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - startedAt.getTime()) / 60000),
  );
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${rest}m`;
  return `${rest}m`;
}

/**
 * `tandembike status`: pid, URL, uptime and log path when running, exit 1
 * when not. Returns the exit code.
 */
export async function serverStatus(effects: ServerEffects): Promise<number> {
  const state = await serverState(effects);
  if (state.state === 'stopped') {
    effects.say(`Tandembike is not running.\nLogs: ${effects.logPath}`);
    return 1;
  }
  if (state.state === 'foreign') {
    effects.say(notStartedHere(state.url));
    return 0;
  }
  const { pid, startedAt } = state.record;
  effects.say(
    [
      `Tandembike is running at ${state.url}.`,
      `  pid:    ${pid}`,
      `  uptime: ${uptimeText(new Date(startedAt), effects.now())}`,
      `  logs:   ${effects.logPath}`,
    ].join('\n'),
  );
  return 0;
}
