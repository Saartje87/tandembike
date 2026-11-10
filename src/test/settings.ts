import { openDatabase } from '../db/connection';
import { createSettings } from '../settings/settings';

/**
 * A Settings module backed by a fresh in-memory database with the real
 * migrations applied. Call it in each test; nothing is shared between calls.
 */
export function createTestSettings() {
  return createSettings(openDatabase(':memory:'));
}
