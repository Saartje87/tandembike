import { openDatabase } from '../db/connection';
import { createSettings } from '../settings/settings';

/**
 * A Settings module backed by a fresh in-memory database with the real
 * migrations applied. Call it in each test; nothing is shared between calls.
 * Test files that use it need `// @vitest-environment node` on line 1.
 */
export function createTestSettings() {
  return createSettings(openDatabase(':memory:'));
}
