import { describe, expect, it } from 'vitest';

import type { Status } from '../../tickets/status';
import type { Ticket } from '../../tickets/tickets';
import { boardLanes, laneOf, laneStatus } from './board-lanes';

const placed = (
  status: Status,
  labels: string[] = [],
  rest: Partial<Pick<Ticket, 'claim' | 'externalReferences'>> = {},
) => laneOf({ status, labels, claim: null, externalReferences: [], ...rest });

const claim = { agentRunId: 'run-1', agentName: null };
const pullRequest = 'https://github.com/owner/repo/pull/87';

describe('laneOf', () => {
  it('puts a Todo Ticket with needs-triage in Intake', () => {
    expect(placed('Todo', ['needs-triage']).lane).toBe('Intake');
  });

  it('puts a Todo Ticket with needs-info in Intake', () => {
    expect(placed('Todo', ['needs-info']).lane).toBe('Intake');
  });

  it('puts a Todo Ticket with no state label in Intake', () => {
    expect(placed('Todo').lane).toBe('Intake');
    expect(placed('Todo', ['bug', 'wontfix']).lane).toBe('Intake');
  });

  it('puts a Todo Ticket with ready-for-agent in Todo', () => {
    expect(placed('Todo', ['bug', 'ready-for-agent']).lane).toBe('Todo');
  });

  it('puts a Todo Ticket with ready-for-human in For human', () => {
    expect(placed('Todo', ['ready-for-human']).lane).toBe('For human');
  });

  it('puts an In progress Ticket in In progress whatever its labels', () => {
    expect(placed('In progress', ['ready-for-human']).lane).toBe('In progress');
    expect(placed('In progress').lane).toBe('In progress');
  });

  it('puts a Done Ticket in Done whatever its labels', () => {
    expect(placed('Done', ['needs-triage']).lane).toBe('Done');
  });

  it('has no section outside In progress', () => {
    expect(placed('Todo', [], { claim }).section).toBeNull();
    expect(
      placed('Done', [], { externalReferences: [pullRequest] }).section,
    ).toBeNull();
  });

  it('puts an In progress Ticket with a PR reference in Review', () => {
    expect(
      placed('In progress', [], { externalReferences: [pullRequest] }).section,
    ).toBe('Review');
    expect(
      placed('In progress', [], { claim, externalReferences: [pullRequest] })
        .section,
    ).toBe('Review');
  });

  it('puts a claimed In progress Ticket without a PR reference in Running', () => {
    expect(placed('In progress', [], { claim }).section).toBe('Running');
  });

  it('puts a stalled In progress Ticket in Action needed', () => {
    expect(placed('In progress').section).toBe('Action needed');
  });

  it('does not take a non-PR External reference for a PR', () => {
    const issue = 'https://github.com/owner/repo/issues/87';
    expect(
      placed('In progress', [], { externalReferences: [issue, 'ABC-33'] })
        .section,
    ).toBe('Action needed');
    expect(
      placed('In progress', [], { claim, externalReferences: [issue] }).section,
    ).toBe('Running');
  });
});

describe('boardLanes', () => {
  it('lists the Lanes in Board order', () => {
    expect(boardLanes).toEqual([
      'Intake',
      'Todo',
      'In progress',
      'For human',
      'Done',
    ]);
  });
});

describe('laneStatus', () => {
  it('gives the Status a drop into the Lane gives', () => {
    expect(boardLanes.map(laneStatus)).toEqual([
      'Todo',
      'Todo',
      'In progress',
      'Todo',
      'Done',
    ]);
  });
});
