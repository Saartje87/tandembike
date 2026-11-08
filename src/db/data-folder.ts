import { join } from 'node:path';

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
