/**
 * The environment a run's processes get: the Agent of either runner and the
 * worktree's prepare command. It is the server's environment without
 * `NODE_ENV`, which the server sets to `production` for itself: a run that
 * inherits it gets `npm ci` without devDependencies and React's production
 * build in its tests (T1555). Everything else, such as PATH, HOME, auth and
 * `TANDEMBIKE_*`, passes through.
 */
export function runEnvironment(
  env: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const { NODE_ENV: _server, ...rest } = env;
  return rest;
}
