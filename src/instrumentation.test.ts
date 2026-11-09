import { afterEach, describe, expect, it, vi } from 'vitest';

const startAppAutopilot = vi.hoisted(() => vi.fn());
vi.mock('./autopilot/app-autopilot', () => ({ startAppAutopilot }));
const startAppNotices = vi.hoisted(() => vi.fn());
vi.mock('./notices/app-notices', () => ({ startAppNotices }));

import { register } from './instrumentation';

describe('register', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    startAppAutopilot.mockClear();
    startAppNotices.mockClear();
  });

  it('starts Autopilot and Notices in the Node.js runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    await register();
    expect(startAppAutopilot).toHaveBeenCalledTimes(1);
    expect(startAppNotices).toHaveBeenCalledTimes(1);
  });

  it('starts nothing in the Edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await register();
    expect(startAppAutopilot).not.toHaveBeenCalled();
    expect(startAppNotices).not.toHaveBeenCalled();
  });
});
