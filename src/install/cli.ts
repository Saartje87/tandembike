import { terminalApiPath } from '../app/lib/paths';
import { terminalHeartbeatMs } from '../conversations/terminal-shared';
import { playbookVersion } from '../playbook/playbook';
import {
  copyFirstRunDatabase,
  decideOffer,
  firstRunCopyBlocker,
  markOffersMade,
  mcpOfferKeys,
  mcpRegistration,
  type OfferPlan,
  type OfferWords,
  offersMade,
  planMcpOffer,
  planPluginOffer,
  pluginInstallState,
  shouldOfferMcp,
  shouldOfferPlugin,
} from './install';
import {
  findServerUrl,
  lastLines,
  liveRecord,
  logTailLines,
  type OpenSession,
  restartServer,
  type ServerEffects,
  type ServerRecord,
  type StopOptions,
  serverStatus,
  startServer,
  stopServer,
} from './server-lifecycle';
import {
  noWorkMessage,
  parseCommand,
  planClaudeSession,
  type TerminalResumeResult,
  type TerminalStartResult,
} from './session';
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, constants as osConstants } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

/**
 * The `tandembike` command (bin/tandembike.mjs runs it from the checkout).
 * `parseCommand` picks the subcommand: `start`, `stop`, `restart` and
 * `status` run the server in the background (ADR 0052) with its data in
 * `~/.tandembike`; `mcp` and `plugin` make the Claude Code offers; the session
 * commands open a Terminal Conversation (ADR 0039). The decisions live in
 * `install.ts`, `server-lifecycle.ts` and `session.ts`; this only does the I/O.
 */

const checkout = process.env.TANDEMBIKE_PACKAGE_DIR ?? process.cwd();
const home = process.env.TANDEMBIKE_DATA_DIR || join(homedir(), '.tandembike');
const recordPath = join(home, 'server.json');
const logPath = join(home, 'server.log');

// tsx loads this file as CommonJS (package.json has no "type": "module"), so
// it cannot use top-level await: the async steps run in main().
async function main(): Promise<void> {
  const parsed = parseCommand(process.argv.slice(2));
  switch (parsed.command) {
    case 'usage':
      console.log(parsed.text);
      return process.exit(1);
    case 'help':
      console.log(parsed.text);
      return process.exit(0);
    case 'start':
      return process.exit(
        await startServer(serverEffects, {
          port: parsed.port,
          foreground: parsed.foreground,
          prepare: () => firstRunSteps({ offers: true }),
        }),
      );
    case 'stop':
      return process.exit(
        await stopServer(serverEffects, stopOptions(parsed.force)),
      );
    case 'restart':
      return process.exit(
        await restartServer(serverEffects, stopOptions(false), {
          prepare: () => firstRunSteps({ offers: true }),
        }),
      );
    case 'status':
      return process.exit(await serverStatus(serverEffects));
    case 'logs':
      return process.exit(await showLogs(parsed.follow));
    case 'mcp':
      await firstRunSteps({ offers: false });
      if (await offerMcp()) markMcpOffered();
      return process.exit(0);
    case 'plugin':
      await firstRunSteps({ offers: false });
      if (await offerPlugin()) markOffersMade(home, 'plugin');
      return process.exit(0);
    case 'triage':
    case 'spec':
      return process.exit(
        await startSession({
          action: 'start',
          ticketNumber: parsed.ticketNumber,
          intent: parsed.command,
        }),
      );
    case 'plan':
      return process.exit(
        await startSession({
          action: 'plan',
          folder: process.cwd(),
          goal: parsed.goal,
        }),
      );
    case 'next':
      return process.exit(await startNext());
    case 'resume':
      return process.exit(await resumeSession(parsed.conversationId));
  }
}

/**
 * The first-run steps: copy the checkout's database into a new data folder,
 * and with `offers`, make the MCP and plugin offers that are due.
 */
async function firstRunSteps({ offers }: { offers: boolean }): Promise<void> {
  const blocker = firstRunCopyBlocker(join(checkout, 'data'), home);
  if (blocker) console.log(blocker);
  const copied = copyFirstRunDatabase(join(checkout, 'data'), home);
  if (copied.length > 0) {
    console.log(
      `Copied your existing database (${copied.join(', ')}) from ${join(checkout, 'data')} to ${home}. The originals are untouched.`,
    );
  }
  if (!offers) return;
  console.log(`Tandembike data: ${home}`);
  const registration = mcpRegistration(readClaudeJson());
  if (shouldOfferMcp(offersMade(home), false, registration)) {
    if (await offerMcp()) markMcpOffered();
  }
  if (shouldOfferPlugin(offersMade(home), installedPluginState(), false)) {
    if (await offerPlugin()) markOffersMade(home, 'plugin');
  }
}

function readRecord(): ServerRecord | null {
  try {
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    return Number.isInteger(record?.pid) && Number.isInteger(record?.port)
      ? record
      : null;
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

const serverEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  NODE_ENV: 'production' as const,
  TANDEMBIKE_DATA_DIR: home,
  TANDEMBIKE_PACKAGE_DIR: checkout,
});

const tsxBin = () => join(checkout, 'node_modules', '.bin', 'tsx');

/** The real effects of the server lifecycle. */
const serverEffects: ServerEffects = {
  readRecord,
  writeRecord: (record) => {
    mkdirSync(home, { recursive: true });
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  },
  removeRecord: () => rmSync(recordPath, { force: true }),
  isAlive,
  signal: (pid, signal) => {
    // The server was spawned detached, as the leader of its own process
    // group: signal the group, so tsx's Node child gets it too.
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // Already gone.
      }
    }
  },
  probe: async (url) => {
    try {
      await fetch(`${url}${terminalApiPath()}`, {
        signal: AbortSignal.timeout(1000),
      });
      return true;
    } catch {
      return false;
    }
  },
  buildExists: () => existsSync(join(checkout, '.next', 'BUILD_ID')),
  spawnServer: (port) => {
    mkdirSync(home, { recursive: true });
    const log = openSync(logPath, 'a');
    const server = spawn(tsxBin(), ['server.ts', '-p', String(port)], {
      cwd: checkout,
      detached: true,
      stdio: ['ignore', log, log],
      env: serverEnv(),
    });
    server.unref();
    closeSync(log);
    if (server.pid === undefined)
      throw new Error('Could not spawn the server.');
    return server.pid;
  },
  serveInForeground,
  logSize: () => {
    try {
      return statSync(logPath).size;
    } catch {
      return null;
    }
  },
  rollLog: () => renameSync(logPath, `${logPath}.1`),
  appendLog: (line) => {
    mkdirSync(home, { recursive: true });
    appendFileSync(logPath, `${line}\n`);
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  say: (line) => console.log(line),
  logPath,
  envUrl: process.env.TANDEMBIKE_URL,
};

/**
 * `tandembike logs`: the log's last lines; with `follow`, `tail -F` prints
 * them and follows the log until Ctrl+C.
 */
async function showLogs(follow: boolean): Promise<number> {
  if (!existsSync(logPath)) {
    console.log(`There is no server log yet at ${logPath}.`);
    return 0;
  }
  if (!follow) {
    for (const line of lastLines(readFileSync(logPath, 'utf8'), logTailLines)) {
      console.log(line);
    }
    return 0;
  }
  return new Promise((resolve) => {
    const tail = spawn('tail', ['-n', String(logTailLines), '-F', logPath], {
      stdio: 'inherit',
    });
    // In a terminal Ctrl+C reaches tail with the foreground group; leave
    // quietly with it. Without one nothing else delivers it, so forward.
    process.on('SIGINT', () => {
      if (!process.stdin.isTTY) tail.kill('SIGINT');
    });
    tail.on('error', (error) => {
      console.error(`Could not run tail: ${error.message}`);
      resolve(1);
    });
    tail.on('exit', (code, signal) => resolve(signal ? 130 : (code ?? 0)));
  });
}

/** `stop`'s question, asked only in a terminal. */
function stopOptions(force: boolean): StopOptions {
  return {
    force,
    openSessions: async (url) => {
      // A server that cannot say has no sessions to warn about.
      try {
        return await callServer<OpenSession[]>({ action: 'sessions' }, url);
      } catch {
        return [];
      }
    },
    confirm: process.stdin.isTTY ? askYesNo : null,
  };
}

async function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+D or Ctrl+C at the prompt rejects the question: treat it as a no.
  const answer = await rl.question(question).catch(() => '');
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

/** Where the server is: `TANDEMBIKE_URL`, else `server.json`'s port, else 4747. */
const serverUrl = () =>
  findServerUrl(process.env.TANDEMBIKE_URL, liveRecord(serverEffects));
const notRunning =
  'Tandembike is not running. Start it with `tandembike start`.';

/** A refusal or failure of the server's terminal route, as text. */
class ServerRefusal extends Error {}

/** Calls the server's terminal route; throws `ServerRefusal` with its text. */
async function callServer<T>(
  body: object,
  url: string = serverUrl(),
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${url}${terminalApiPath()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ServerRefusal(notRunning);
  }
  if (!response.ok) {
    throw new ServerRefusal((await response.text()) || response.statusText);
  }
  return (await response.json()) as T;
}

/**
 * Calls the server, or prints why it could not and returns null. The three
 * session starts share it.
 */
async function callServerOrReport<T>(body: object): Promise<T | null> {
  try {
    return await callServer<T>(body);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * `tandembike start`: asks the server for a Terminal Conversation, opens
 * interactive `claude` in it with inherited stdio, and reports the end.
 * Returns `claude`'s exit code.
 */
async function startSession(request: object): Promise<number> {
  const started = await callServerOrReport<TerminalStartResult>(request);
  return started ? runSession(started) : 1;
}

/**
 * `tandembike next`: the Project is the one whose repository holds this
 * folder; the server starts its next Eligible item, or says why there is none.
 */
async function startNext(): Promise<number> {
  const next = await callServerOrReport<
    | { started: true; session: TerminalStartResult }
    | { started: false; reason: Parameters<typeof noWorkMessage>[0] }
  >({ action: 'next', folder: process.cwd() });
  if (!next) return 1;
  if (!next.started) {
    console.log(noWorkMessage(next.reason));
    return 0;
  }
  return runSession(next.session);
}

/**
 * `tandembike resume`: asks the server to hand a Conversation over to this
 * terminal, then resumes its `claude` session there and reports the end.
 */
async function resumeSession(conversationId: number): Promise<number> {
  const resumed = await callServerOrReport<TerminalResumeResult>({
    action: 'resume',
    conversationId,
  });
  return resumed ? runSession(resumed) : 1;
}

/** Runs interactive `claude` for a Terminal Conversation and reports its end. */
async function runSession(
  started: TerminalStartResult | TerminalResumeResult,
): Promise<number> {
  const plan = planClaudeSession(started);
  // A heartbeat every minute tells the server the session is alive; a failure,
  // such as a server restart, is ignored (ADR 0039).
  const heartbeat = setInterval(() => {
    callServer({
      action: 'heartbeat',
      conversationId: started.conversationId,
    }).catch(() => undefined);
  }, terminalHeartbeatMs);
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(plan.command, plan.args, {
      cwd: plan.cwd,
      stdio: 'inherit',
      env: { ...process.env, ...plan.env },
    });
    // In a terminal, Ctrl+C reaches `claude` with the whole foreground group;
    // forwarding it again would count as a second press. Without a terminal
    // nothing else delivers it, so forward.
    const forwarded = process.stdin.isTTY
      ? (['SIGTERM', 'SIGHUP'] as const)
      : (['SIGINT', 'SIGTERM', 'SIGHUP'] as const);
    for (const signal of forwarded) {
      process.on(signal, () => child.kill(signal));
    }
    if (process.stdin.isTTY) process.on('SIGINT', () => undefined);
    child.on('error', (error) => {
      console.error(`Could not run claude: ${error.message}`);
      resolve(127);
    });
    child.on('exit', (code, signal) =>
      resolve(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 1) : 1)),
    );
  });
  clearInterval(heartbeat);
  try {
    await callServer({
      action: 'end',
      conversationId: started.conversationId,
      exitCode,
    });
  } catch (error) {
    console.error(
      `Could not report the end of the session: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return exitCode;
}

function markMcpOffered(): void {
  for (const key of mcpOfferKeys) markOffersMade(home, key);
}

function readClaudeJson(): unknown {
  try {
    return JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'));
  } catch {
    return null;
  }
}

function readInstalledPlugins(): unknown {
  try {
    return JSON.parse(
      readFileSync(
        join(homedir(), '.claude', 'plugins', 'installed_plugins.json'),
        'utf8',
      ),
    );
  } catch {
    return null;
  }
}

function installedPluginState() {
  return pluginInstallState(readInstalledPlugins(), playbookVersion());
}

const claudeOnPath = () => spawnSync('claude', ['--version']).status === 0;

/** Runs the MCP offer; returns whether it counts as made. */
function offerMcp(): Promise<boolean> {
  return runOffer(
    planMcpOffer({
      claudeOnPath: claudeOnPath(),
      registration: mcpRegistration(readClaudeJson()),
    }),
    {
      done: 'Tandembike is already registered in Claude Code.',
      intro:
        'To reach Tandembike from Claude Code in every repository, register its MCP server at user scope:',
      again: 'tandembike mcp',
    },
  );
}

/** Runs the Playbook plugin offer; returns whether it counts as made. */
function offerPlugin(): Promise<boolean> {
  return runOffer(
    planPluginOffer({
      claudeOnPath: claudeOnPath(),
      state: installedPluginState(),
      checkout,
    }),
    {
      done: 'The Playbook plugin is already installed in Claude Code.',
      intro:
        'To use /tandembike:implement and the other Playbook commands in every repository, install the Playbook plugin at user scope:',
      again: 'tandembike plugin',
    },
  );
}

async function runOffer(plan: OfferPlan, words: OfferWords): Promise<boolean> {
  const decision = decideOffer(plan, Boolean(process.stdin.isTTY));
  if (decision.mode === 'skip') {
    console.log(words.done);
    return decision.markMade;
  }
  console.log(`${words.intro}\n\n${plan.text}\n`);
  if (decision.mode === 'print') return decision.markMade;
  if (!(await askYesNo('Run it now? [y/N] '))) {
    console.log(`Skipped. Run \`${words.again}\` to be asked again.`);
    return true;
  }
  for (const step of plan.steps) {
    if (spawnSync('claude', step, { stdio: 'inherit' }).status !== 0) {
      console.log(`That failed. Run it yourself later:\n\n${plan.text}`);
      return true;
    }
  }
  return true;
}

/** `start --foreground`: the server in this terminal, until it exits. */
function serveInForeground(port: number): Promise<number> {
  const server = spawn(tsxBin(), ['server.ts', '-p', String(port)], {
    cwd: checkout,
    stdio: 'inherit',
    env: serverEnv(),
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => server.kill(signal));
  }
  return new Promise((resolve) => {
    server.on('exit', (code) => resolve(code ?? 1));
  });
}

void main();
