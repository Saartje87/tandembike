import { copyFirstRunDatabase } from './install';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The `tandembike` command (bin/tandembike.mjs runs it from the checkout):
 * first-run steps, then the production server with its data in
 * `~/.tandembike`. The decisions live in `install.ts`; this only prints.
 */

const checkout = process.env.TANDEMBIKE_PACKAGE_DIR ?? process.cwd();
const home = process.env.TANDEMBIKE_DATA_DIR || join(homedir(), '.tandembike');

const copied = copyFirstRunDatabase(join(checkout, 'data'), home);
if (copied.length > 0) {
  console.log(
    `Copied your existing database (${copied.join(', ')}) from ${join(checkout, 'data')} to ${home}. The originals are untouched.`,
  );
}

console.log(`Tandembike data: ${home}`);

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
