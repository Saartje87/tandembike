#!/usr/bin/env node
// The `tandembike` command: a thin shim that runs src/install/cli.ts with the
// checkout's own tsx, from the checkout, so it works from any folder.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = join(
  dirname(realpathSync(fileURLToPath(import.meta.url))),
  '..',
);
const tsx = join(checkout, 'node_modules', '.bin', 'tsx');

const child = spawn(
  tsx,
  [join('src', 'install', 'cli.ts'), ...process.argv.slice(2)],
  {
    cwd: checkout,
    stdio: 'inherit',
    // The CLI runs from the checkout; TANDEMBIKE_CWD keeps the folder the
    // User typed the command in, which picks the Project.
    env: {
      ...process.env,
      TANDEMBIKE_PACKAGE_DIR: checkout,
      TANDEMBIKE_CWD: process.cwd(),
    },
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
