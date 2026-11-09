import { terminalApiPath } from '../app/lib/paths';
import {
  copyFirstRunDatabase,
  decideMcpOffer,
  firstRunCopyBlocker,
  markOffersMade,
  mcpRegistration,
  offersMade,
  planMcpOffer,
  shouldOfferMcp,
} from './install';
import {
  parseCommand,
  planClaudeSession,
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
 * registration; `start` opens a terminal session on a Ticket (ADR 0039). The
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
  if (parsed.command === 'start') {
    process.exit(await startSession(parsed.ticketNumber));
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
    if (await offerMcp()) markOffersMade(home, 'mcp');
    process.exit(0);
  }

  if (shouldOfferMcp(offersMade(home), false)) {
    if (await offerMcp()) markOffersMade(home, 'mcp');
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
 * `tandembike start`: asks the server for a Terminal Conversation, opens
 * interactive `claude` in it with inherited stdio, and reports the end.
 * Returns `claude`'s exit code.
 */
async function startSession(ticketNumber: number): Promise<number> {
  let started: TerminalStartResult;
  try {
    started = await callServer<TerminalStartResult>({
      action: 'start',
      ticketNumber,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const plan = planClaudeSession(started);
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

function readClaudeJson(): unknown {
  try {
    return JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Runs the offer; returns whether it counts as made. */
async function offerMcp(): Promise<boolean> {
  const claudeOnPath = spawnSync('claude', ['--version']).status === 0;
  const plan = planMcpOffer({
    claudeOnPath,
    registration: mcpRegistration(readClaudeJson()),
  });
  const decision = decideMcpOffer(plan, Boolean(process.stdin.isTTY));
  if (decision.mode === 'skip') {
    console.log('Tandembike is already registered in Claude Code.');
    return decision.markMade;
  }
  const intro =
    'To reach Tandembike from Claude Code in every repository, register its MCP server at user scope:';
  if (decision.mode === 'print') {
    console.log(`${intro}\n\n${plan.text}\n`);
    return decision.markMade;
  }
  console.log(`${intro}\n\n${plan.text}\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+D or Ctrl+C at the prompt rejects the question: treat it as a no.
  const answer = await rl.question('Run it now? [y/N] ').catch(() => '');
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Skipped. Run `tandembike mcp` to be asked again.');
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
