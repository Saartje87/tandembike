import { describe, expect, it } from 'vitest';

import { formatCost } from './format-cost';

describe('formatCost', () => {
  it('shows cents, and 4 places under a cent', () => {
    expect(formatCost(1.5)).toBe('$1.50');
    expect(formatCost(0)).toBe('$0.00');
    expect(formatCost(0.0042)).toBe('$0.0042');
  });
});
