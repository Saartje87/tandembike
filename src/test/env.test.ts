// @vitest-environment node

import { describe, expect, it } from 'vitest';

// The shell may export these for the installed app; tests must still use this
// checkout's migrations and Playbook, so the Vitest config empties them (T1266).
describe('the test environment', () => {
  it('empties TANDEMBIKE_PACKAGE_DIR and TANDEMBIKE_DATA_DIR', () => {
    expect(process.env.TANDEMBIKE_PACKAGE_DIR).toBe('');
    expect(process.env.TANDEMBIKE_DATA_DIR).toBe('');
  });
});
