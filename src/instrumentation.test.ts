import { afterEach, describe, expect, it, vi } from 'vitest';

const startAppAutopilot = vi.hoisted(() => vi.fn());
vi.mock('./autopilot/app-autopilot', () => ({ startAppAutopilot }));

import { register } from './instrumentation';

describe('register', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    startAppAutopilot.mockClear();
  });

  it('starts Autopilot in the Node.js runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    await register();
    expect(startAppAutopilot).toHaveBeenCalledTimes(1);
  });

  it('starts nothing in the Edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await register();
    expect(startAppAutopilot).not.toHaveBeenCalled();
  });
});
