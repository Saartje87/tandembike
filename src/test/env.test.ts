import { describe, expect, it } from 'vitest';

// Guards the `test.env` in vitest.config.mts (T1266).
describe('the test environment', () => {
  it('empties TANDEMBIKE_PACKAGE_DIR and TANDEMBIKE_DATA_DIR', () => {
    expect(process.env.TANDEMBIKE_PACKAGE_DIR).toBe('');
    expect(process.env.TANDEMBIKE_DATA_DIR).toBe('');
  });
});
