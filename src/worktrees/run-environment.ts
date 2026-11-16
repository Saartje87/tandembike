/**
 * The environment a run's processes get: the Agent of either runner and the
 * worktree's prepare command. It is the server's environment without two
 * variables that describe the server, not the run:
 *
 * - `NODE_ENV`, which the server sets to `production` for itself: a run that
 *   inherits it gets `npm ci` without devDependencies and React's production
 *   build in its tests (T1555).
 * - `TANDEMBIKE_PACKAGE_DIR`, which the `tandembike` CLI sets to the main
 *   checkout: a run that inherits it has scripts such as `npm run
 *   playbook:lock` read and write the main checkout's files, not its
 *   worktree's (T1565). Without it they resolve from the working folder.
 *
 * Everything else, such as PATH, HOME, auth and `TANDEMBIKE_DATA_DIR` (the
 * shared data folder), passes through.
 */
export function runEnvironment(
  env: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const {
    NODE_ENV: _serverMode,
    TANDEMBIKE_PACKAGE_DIR: _serverCheckout,
    ...rest
  } = env;
  return rest;
}
