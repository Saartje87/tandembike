import { describe, expect, it } from 'vitest';

import { completed } from './board-changes';

describe('completed', () => {
  it('sets Done and drops the triage state label but keeps the others', () => {
    expect(
      completed({
        status: 'In progress',
        labels: ['ready-for-agent', 'bug', 'wontfix'],
      }),
    ).toEqual({ status: 'Done', labels: ['bug', 'wontfix'] });
  });

  it('keeps the rest of the Ticket', () => {
    expect(
      completed({ number: 3, status: 'Todo', labels: ['needs-info'] }),
    ).toEqual({ number: 3, status: 'Done', labels: [] });
  });
});
