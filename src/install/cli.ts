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
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

/**
 * The `tandembike` command (bin/tandembike.mjs runs it from the checkout):
 * first-run steps, then the production server with its data in
 * `~/.tandembike`. The decisions live in `install.ts`; this only prints.
 */

const checkout = process.env.TANDEMBIKE_PACKAGE_DIR ?? process.cwd();
const home = process.env.TANDEMBIKE_DATA_DIR || join(homedir(), '.tandembike');

const blocker = firstRunCopyBlocker(join(checkout, 'data'), home);
if (blocker) console.log(blocker);
const copied = copyFirstRunDatabase(join(checkout, 'data'), home);
if (copied.length > 0) {
  console.log(
    `Copied your existing database (${copied.join(', ')}) from ${join(checkout, 'data')} to ${home}. The originals are untouched.`,
  );
}

console.log(`Tandembike data: ${home}`);

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
  const answer = await rl.question('Run it now? [y/N] ');
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

if (process.argv[2] === 'mcp') {
  if (await offerMcp()) markOffersMade(home, 'mcp');
  process.exit(0);
}

if (shouldOfferMcp(offersMade(home), false)) {
  if (await offerMcp()) markOffersMade(home, 'mcp');
}

const server = spawn(
  join(checkout, 'node_modules', '.bin', 'tsx'),
  ['server.ts', ...process.argv.slice(2)],
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
