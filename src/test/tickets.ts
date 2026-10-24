import { openDatabase } from '../db/connection';
import type { ChangeChannel } from '../tickets/changes';
import { createTickets } from '../tickets/tickets';

/**
 * A Tickets module backed by a fresh in-memory database with the real
 * migrations applied. Call it in each test; nothing is shared between calls.
 * Test files that use it need `// @vitest-environment node` on line 1.
 */
export function createTestTickets(changes?: ChangeChannel) {
  return createTickets(openDatabase(':memory:'), changes);
}

/**
 * Runs `fn` and returns what it threw, so a test can compare the whole
 * error: `expect(errorFrom(() => ...)).toEqual(new NotFoundError('...'))`.
 * `toEqual` checks the error's class name, message and fields.
 */
export function errorFrom(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw, but it returned.');
}
