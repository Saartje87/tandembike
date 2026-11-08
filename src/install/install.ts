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
 * The folder holding the database: `TANDEMBIKE_DATA_DIR` when set (the
 * `tandembike` command sets it to `~/.tandembike`), else `data` in the
 * checkout, which `npm run dev`, `npm start` and worktree servers keep.
 */
export function dataFolder(
  env: Record<string, string | undefined>,
  checkout: string,
): string {
  return env.TANDEMBIKE_DATA_DIR || join(checkout, 'data');
}

/**
 * The files of the checkout's database to copy into a new data folder: none
 * unless the target has no database yet and the source has one, then the
 * database with any -wal and -shm files that exist.
 */
export function planFirstRunCopy(source: string, target: string): string[] {
  if (resolve(source) === resolve(target)) return [];
  if (existsSync(join(target, databaseFile))) return [];
  if (!existsSync(join(source, databaseFile))) return [];
  return databaseFiles.filter((name) => existsSync(join(source, name)));
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

export type McpRegistration = 'none' | 'outdated' | 'current';

export type McpOfferPlan = {
  action: 'ask' | 'print' | 'skip';
  /** `claude` arguments to run, in order, after a yes. */
  steps: string[][];
  /** The exact command line(s) to show, one per step. */
  text: string;
};

/** Whether to make the MCP registration offer: once, or when asked for. */
export function shouldOfferMcp(made: string[], explicit: boolean): boolean {
  return explicit || !made.includes('mcp');
}

/**
 * What `~/.claude.json` holds for `tandembike` at user scope: `current` when
 * it sends the folder header, `outdated` when it is there without it (it
 * must be removed first, `claude mcp add` refuses duplicates).
 */
export function mcpRegistration(claudeJson: unknown): McpRegistration {
  const servers = (
    claudeJson as { mcpServers?: Record<string, unknown> } | null
  )?.mcpServers;
  const entry = servers?.tandembike as
    | { headers?: Record<string, unknown> }
    | undefined;
  if (!entry || typeof entry !== 'object') return 'none';
  return entry.headers && cwdHeader in entry.headers ? 'current' : 'outdated';
}

const removeStep = ['mcp', 'remove', '--scope', 'user', 'tandembike'];
// ${PWD} stays literal: Claude Code expands it to the session's folder.
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
