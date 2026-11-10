import { describe, expect, it } from 'vitest';

import type { Worktrees } from '../worktrees/worktrees';
import type { AgentRunner } from './agent-runner';
import { agentBackends, refuseFakeRunsOnAppPort } from './fake-runs';

const real = () => ({
  runner: { start: () => ({}) } as unknown as AgentRunner,
  worktrees: {} as Worktrees,
});

describe('Fake runs (TANDEMBIKE_FAKE_RUNS)', () => {
  it('uses the real runner and worktrees without the setting', () => {
    const backends = real();

    expect(agentBackends({}, () => backends)).toBe(backends);
    expect(agentBackends({ TANDEMBIKE_FAKE_RUNS: '' }, () => backends)).toBe(
      backends,
    );
  });

  it('uses the scripted runner and worktrees with the setting, never building the real ones', () => {
    const backends = agentBackends({ TANDEMBIKE_FAKE_RUNS: '1' }, () => {
      throw new Error('The real runner was built.');
    });

    expect(backends.runner).toBeDefined();
    expect(backends.worktrees).toBeDefined();
  });

  it('refuses to serve on port 4747 with the setting', () => {
    expect(() =>
      refuseFakeRunsOnAppPort({ TANDEMBIKE_FAKE_RUNS: '1' }, 4747),
    ).toThrow(/4747/);
  });

  it('serves on a throwaway port with the setting, and on 4747 without it', () => {
    expect(() =>
      refuseFakeRunsOnAppPort({ TANDEMBIKE_FAKE_RUNS: '1' }, 3100),
    ).not.toThrow();
    expect(() => refuseFakeRunsOnAppPort({}, 4747)).not.toThrow();
  });
});
