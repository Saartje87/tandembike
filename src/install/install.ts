import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const databaseFile = 'ticket.db';
const databaseFiles = [
  databaseFile,
  `${databaseFile}-wal`,
  `${databaseFile}-shm`,
];

/**
 * The files of the checkout's database to copy into a new data folder: none
 * unless the target has no database yet and the source has one, then the
 * database with any -wal and -shm files that exist.
 */
export function planFirstRunCopy(source: string, target: string): string[] {
  if (resolve(source) === resolve(target)) return [];
  if (!existsSync(join(source, databaseFile))) return [];
  if (databaseFiles.some((name) => existsSync(join(target, name)))) return [];
  return databaseFiles.filter((name) => existsSync(join(source, name)));
}

/**
 * What to tell the User when the copy is skipped because the data folder has
 * only some of the database files (a -wal or -shm without the database): a
 * partial copy or an overwrite would corrupt it. `undefined` when the copy
 * may go ahead or the data folder simply has its database already.
 */
export function firstRunCopyBlocker(
  source: string,
  target: string,
): string | undefined {
  if (resolve(source) === resolve(target)) return undefined;
  if (!existsSync(join(source, databaseFile))) return undefined;
  if (existsSync(join(target, databaseFile))) return undefined;
  const present = databaseFiles.filter((name) =>
    existsSync(join(target, name)),
  );
  return present.length === 0
    ? undefined
    : `Not copying your existing database: ${present.join(', ')} already in ${target}.`;
}

/** Copies what `planFirstRunCopy` plans, never moving or overwriting. */
export function copyFirstRunDatabase(source: string, target: string): string[] {
  const files = planFirstRunCopy(source, target);
  if (files.length === 0) return files;
  mkdirSync(target, { recursive: true });
  for (const name of files) {
    // COPYFILE_EXCL: fail rather than overwrite, whatever the plan said.
    copyFileSync(join(source, name), join(target, name), 1);
  }
  return files;
}

const configName = 'config.json';

/** The first-run offers (such as `mcp`) already made, from `config.json`. */
export function offersMade(folder: string): string[] {
  try {
    const config = JSON.parse(readFileSync(join(folder, configName), 'utf8'));
    return Array.isArray(config.offersMade)
      ? config.offersMade.filter((o: unknown) => typeof o === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Records that an offer was made, so later starts stay quiet. */
export function markOffersMade(folder: string, offer: string): void {
  const made = offersMade(folder);
  if (made.includes(offer)) return;
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, configName),
    `${JSON.stringify({ offersMade: [...made, offer] }, null, 2)}\n`,
  );
}

const mcpUrl = 'http://localhost:4747/api/mcp';
const cwdHeader = 'X-Tandembike-Cwd';
const runHeader = 'X-Tandembike-Run';

/** Offer keys in `config.json`: both are recorded when the offer is made. */
export const mcpOfferKeys = ['mcp', 'mcp-run-header'];

export type McpRegistration = 'none' | 'outdated' | 'current';

export type McpOfferPlan = {
  action: 'ask' | 'print' | 'skip';
  /** `claude` arguments to run, in order, after a yes. */
  steps: string[][];
  /** The exact command line(s) to show, one per step. */
  text: string;
};

/**
 * Whether to make the MCP registration offer: once, or when asked for. A
 * registration that predates the run header (T1238) is offered the update
 * once more, under its own key.
 */
export function shouldOfferMcp(
  made: string[],
  explicit: boolean,
  registration: McpRegistration = 'none',
): boolean {
  return (
    explicit ||
    !made.includes('mcp') ||
    (registration === 'outdated' && !made.includes('mcp-run-header'))
  );
}

/**
 * What `~/.claude.json` holds for `tandembike` at user scope: `current` when
 * it sends the folder and run headers, `outdated` when it is there without
 * both (it must be removed first, `claude mcp add` refuses duplicates).
 */
export function mcpRegistration(claudeJson: unknown): McpRegistration {
  const servers = (
    claudeJson as { mcpServers?: Record<string, unknown> } | null
  )?.mcpServers;
  const entry = servers?.tandembike as
    | { headers?: Record<string, unknown> }
    | undefined;
  if (!entry || typeof entry !== 'object') return 'none';
  return entry.headers &&
    cwdHeader in entry.headers &&
    runHeader in entry.headers
    ? 'current'
    : 'outdated';
}

const removeStep = ['mcp', 'remove', '--scope', 'user', 'tandembike'];
// ${PWD} and ${TANDEMBIKE_RUN:-} stay literal: Claude Code expands them.
const addStep = [
  'mcp',
  'add',
  '--scope',
  'user',
  '--transport',
  'http',
  'tandembike',
  mcpUrl,
  '--header',
  `${cwdHeader}: \${PWD}`,
  '--header',
  // Empty in a bare `claude` session, which the server treats as no run.
  `${runHeader}: \${TANDEMBIKE_RUN:-}`,
];

function quote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`;
}

/** The shell text of `claude` steps, one command per line. */
export function mcpCommandText(steps: string[][]): string {
  return steps.map((s) => ['claude', ...s].map(quote).join(' ')).join('\n');
}

/** Decides what the offer does; the script only prompts and runs. */
export function planMcpOffer(state: {
  claudeOnPath: boolean;
  registration: McpRegistration;
}): McpOfferPlan {
  if (state.registration === 'current') {
    return { action: 'skip', steps: [], text: '' };
  }
  const steps =
    state.registration === 'outdated' ? [removeStep, addStep] : [addStep];
  return {
    action: state.claudeOnPath ? 'ask' : 'print',
    steps,
    text: mcpCommandText(steps),
  };
}

/**
 * How to run the offer: `ask` prompts, `print` only shows the command. The
 * offer counts as made once it was prompted, skipped, or printed because
 * `claude` is missing; a start with no terminal shows no prompt, so the next
 * interactive start asks.
 */
export function decideMcpOffer(
  plan: McpOfferPlan,
  isTTY: boolean,
): { mode: 'ask' | 'print' | 'skip'; markMade: boolean } {
  if (plan.action === 'skip') return { mode: 'skip', markMade: true };
  if (plan.action === 'ask' && isTTY) return { mode: 'ask', markMade: true };
  return { mode: 'print', markMade: plan.action !== 'ask' };
}
