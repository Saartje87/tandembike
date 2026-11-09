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
  noWorkMessage,
  parseCommand,
  planClaudeSession,
  type TerminalResumeResult,
  type TerminalStartResult,
} from './session';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir, constants as osConstants } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

/**
 * The `tandembike` command (bin/tandembike.mjs runs it from the checkout).
 * `parseCommand` picks the subcommand: none runs the first-run steps and then
 * the production server with its data in `~/.tandembike`; `mcp` offers the MCP
 * registration; `plugin` offers the Playbook plugin (first run and when the
 * install is older too); `start` opens a terminal session on a Ticket (ADR 0039). The
 * decisions live in `install.ts` and `session.ts`; this only does the I/O.
 */

const checkout = process.env.TANDEMBIKE_PACKAGE_DIR ?? process.cwd();
const home = process.env.TANDEMBIKE_DATA_DIR || join(homedir(), '.tandembike');

// tsx loads this file as CommonJS (package.json has no "type": "module"), so
// it cannot use top-level await: the async steps run in main().
async function main(): Promise<void> {
  const parsed = parseCommand(process.argv.slice(2));
  if (parsed.command === 'usage') {
    console.log(parsed.text);
    process.exit(1);
  }
  if ('ticketNumber' in parsed) {
    return process.exit(
      await startSession({
        action: 'start',
        ticketNumber: parsed.ticketNumber,
        intent: parsed.command,
      }),
    );
  }
  if (parsed.command === 'next') {
    return process.exit(await startNext());
  }

  if (parsed.command === 'resume') {
    process.exit(await resumeSession(parsed.conversationId));
  }

  const blocker = firstRunCopyBlocker(join(checkout, 'data'), home);
  if (blocker) console.log(blocker);
  const copied = copyFirstRunDatabase(join(checkout, 'data'), home);
  if (copied.length > 0) {
    console.log(
      `Copied your existing database (${copied.join(', ')}) from ${join(checkout, 'data')} to ${home}. The originals are untouched.`,
    );
  }

  console.log(`Tandembike data: ${home}`);

  if (parsed.command === 'mcp') {
    if (await offerMcp()) markMcpOffered();
    process.exit(0);
  }

  if (parsed.command === 'plugin') {
    if (await offerPlugin()) markOffersMade(home, 'plugin');
    process.exit(0);
  }

  const registration = mcpRegistration(readClaudeJson());
  if (shouldOfferMcp(offersMade(home), false, registration)) {
    if (await offerMcp()) markMcpOffered();
  }
  if (shouldOfferPlugin(offersMade(home), installedPluginState(), false)) {
    if (await offerPlugin()) markOffersMade(home, 'plugin');
  }

  startServer(parsed.args);
}

const serverUrl = process.env.TANDEMBIKE_URL ?? 'http://localhost:4747';
const notRunning = 'Tandembike is not running. Start it with `tandembike`.';

/** A refusal or failure of the server's terminal route, as text. */
class ServerRefusal extends Error {}

/** Calls the server's terminal route; throws `ServerRefusal` with its text. */
async function callServer<T>(body: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${serverUrl}${terminalApiPath()}`, {
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
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+D or Ctrl+C at the prompt rejects the question: treat it as a no.
  const answer = await rl.question('Run it now? [y/N] ').catch(() => '');
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
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

function startServer(args: string[]): void {
  const server = spawn(
    join(checkout, 'node_modules', '.bin', 'tsx'),
    ['server.ts', ...args],
    {
      cwd: checkout,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        TANDEMBIKE_DATA_DIR: home,
        TANDEMBIKE_PACKAGE_DIR: checkout,
      },
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => server.kill(signal));
  }
  server.on('exit', (code) => process.exit(code ?? 1));
}

void main();
