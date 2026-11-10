import { appPort } from '../http/server-port';
import type { Worktrees } from '../worktrees/worktrees';
import type { AgentRunner } from './agent-runner';
import {
  createScriptedRunner,
  createScriptedWorktrees,
} from './scripted-runner';

type Env = Record<string, string | undefined>;

export type AgentBackends = { runner: AgentRunner; worktrees: Worktrees };

/**
 * Fake runs (T678): with `TANDEMBIKE_FAKE_RUNS=1`, a throwaway server runs
 * no Agent and no git, and each run moves to the state its messages ask for
 * (see `scripted-runner.ts`), for browser checks. Off by default.
 */
const fakeRunsOn = (env: Env): boolean => env.TANDEMBIKE_FAKE_RUNS === '1';

/**
 * The runner and worktrees the app's Conversations use: the scripted ones
 * with fake runs on, else the `real` ones, built only then.
 */
export function agentBackends(
  env: Env,
  real: () => AgentBackends,
): AgentBackends {
  if (!fakeRunsOn(env)) {
    return real();
  }
  return {
    runner: createScriptedRunner(),
    worktrees: createScriptedWorktrees(),
  };
}

/**
 * Throws when fake runs are on and the server would serve on the User's
 * app port, so the User's app never fakes its runs.
 */
export function refuseFakeRunsOnAppPort(env: Env, port: number): void {
  if (fakeRunsOn(env) && port === appPort) {
    throw new Error(
      `TANDEMBIKE_FAKE_RUNS is for throwaway servers: it cannot serve on port ${appPort}, the User's app. Pass another port, such as -p 3100.`,
    );
  }
}
