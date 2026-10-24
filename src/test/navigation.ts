import type { useRouter } from 'next/navigation';
import { vi } from 'vitest';

/**
 * A `next/navigation` router whose methods are spies. Use it with
 * `vi.mock('next/navigation', () => ({ useRouter: vi.fn() }))` and
 * `vi.mocked(useRouter).mockReturnValue(mockRouter())`.
 */
export function mockRouter(): ReturnType<typeof useRouter> {
  return {
    bfcacheId: 'test',
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  };
}
