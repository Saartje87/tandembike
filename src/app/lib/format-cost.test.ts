import { describe, expect, it } from 'vitest';

import { formatCost } from './format-cost';

describe('formatCost', () => {
  it('shows dollars as before: to the cent, or to 4 places under a cent', () => {
    expect(formatCost(1.2, 'usd')).toBe('$1.20');
    expect(formatCost(0.0042, 'usd')).toBe('$0.0042');
    expect(formatCost(0, 'usd')).toBe('$0.00');
  });

  it('labels AI credits by their unit, never as dollars (ADR 0051)', () => {
    expect(formatCost(12.5, 'ai_credits')).toBe('12.50 AI credits');
    expect(formatCost(1, 'ai_credits')).toBe('1.00 AI credit');
  });
});
