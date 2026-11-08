import { describe, expect, it } from 'vitest';

import { isRowLabel } from './triage-labels';

describe('isRowLabel', () => {
  it.each([
    'needs-triage',
    'needs-info',
    'ready-for-agent',
    'ready-for-human',
    'wontfix',
  ])('hides the state label %s, which the section already shows', (label) => {
    expect(isRowLabel(label)).toBe(false);
  });

  it.each(['bug', 'enhancement', 'from:tandembike', 'from:agent-run'])(
    'shows %s',
    (label) => {
      expect(isRowLabel(label)).toBe(true);
    },
  );
});
