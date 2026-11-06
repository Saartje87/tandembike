import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNow } from './use-now';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks once a minute', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(new Date('2026-11-07T10:00:00Z').getTime());

    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(result.current).toBe(new Date('2026-11-07T10:00:00Z').getTime());

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(new Date('2026-11-07T10:01:00Z').getTime());
  });

  it('stops ticking when unmounted', () => {
    const { unmount } = renderHook(() => useNow());
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
