import { describe, expect, it } from 'vitest';

import type { LiveConversation } from '../../conversations/conversation-activity';
import { liveConversation } from '../../test/conversation-activity';
import type { Status } from '../../tickets/status';
import type { Ticket } from '../../tickets/tickets';
import { isInReview, isParked, isStalled, laneOf } from './board-lanes';

const placed = (
  status: Status,
  labels: string[] = [],
  rest: Partial<
    Pick<Ticket, 'claim' | 'externalReferences' | 'type' | 'children'>
  > = {},
  live?: LiveConversation,
) =>
  laneOf(
    {
      status,
      labels,
      claim: null,
      externalReferences: [],
      type: 'Ticket',
      children: [],
      ...rest,
    },
    live,
  );

const child = (number: number, archived = false) => ({
  number,
  title: `Child ${number}`,
  status: 'Todo' as const,
  archived,
  blockedBy: [],
  blocked: false,
});

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

  it('puts a Todo Ticket with ready-for-agent in Queued', () => {
    expect(placed('Todo', ['bug', 'ready-for-agent']).lane).toBe('Queued');
  });

  describe('an Epic without children (T1139)', () => {
    const epic = (children: ReturnType<typeof child>[]) =>
      ({ type: 'Epic', children }) as const;

    it('puts a Todo ready-for-agent Epic with no children in Intake', () => {
      expect(placed('Todo', ['ready-for-agent'], epic([])).lane).toBe('Intake');
    });

    it('does not count archived children', () => {
      expect(
        placed('Todo', ['ready-for-agent'], epic([child(1, true)])).lane,
      ).toBe('Intake');
    });

    it('keeps an Epic with an unarchived child, on any Board, Queued', () => {
      // Ticket.children lists every child, whichever Board it is on.
      expect(
        placed('Todo', ['ready-for-agent'], epic([child(1, true), child(2)]))
          .lane,
      ).toBe('Queued');
    });

    it('keeps an empty ready-for-human Epic in Your work', () => {
      expect(placed('Todo', ['ready-for-human'], epic([])).lane).toBe(
        'Your work',
      );
    });

    it('leaves In progress and Done Epics in their own Lanes', () => {
      expect(placed('In progress', ['ready-for-agent'], epic([])).lane).toBe(
        'In progress',
      );
      expect(placed('Done', ['ready-for-agent'], epic([])).lane).toBe('Done');
    });
  });

  it('puts a Todo Ticket with ready-for-human in Your work', () => {
    expect(placed('Todo', ['ready-for-human']).lane).toBe('Your work');
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

describe('placing a Ticket', () => {
  describe('with a live Conversation', () => {
    const inProgress = (
      state: LiveConversation['state'],
      rest: Partial<Pick<Ticket, 'claim' | 'externalReferences'>> = {},
    ) => placed('In progress', [], rest, liveConversation({ state })).section;

    it('puts a running Conversation in Running', () => {
      expect(inProgress('running')).toBe('Running');
    });

    it('puts a waiting, interrupted or errored Conversation in Action needed', () => {
      expect(inProgress('waiting', { claim })).toBe('Action needed');
      expect(inProgress('interrupted', { claim })).toBe('Action needed');
      expect(inProgress('error', { claim })).toBe('Action needed');
    });

    it('puts an idle Conversation in Review with a PR reference and no Claim', () => {
      expect(inProgress('idle', { externalReferences: [pullRequest] })).toBe(
        'Review',
      );
    });

    it('puts an idle Conversation in Action needed while it holds a Claim or has no PR', () => {
      expect(
        inProgress('idle', { claim, externalReferences: [pullRequest] }),
      ).toBe('Action needed');
      expect(inProgress('idle', { claim })).toBe('Action needed');
      expect(inProgress('idle')).toBe('Action needed');
    });

    it('decides ahead of a PR reference and a Claim', () => {
      const references = { externalReferences: [pullRequest] };
      expect(inProgress('running', references)).toBe('Running');
      expect(inProgress('waiting', { claim, ...references })).toBe(
        'Action needed',
      );
    });

    it('leaves Claim and PR reference to decide without one', () => {
      expect(placed('In progress', [], { claim }, undefined).section).toBe(
        'Running',
      );
    });

    it('does not move a Ticket out of its Lane', () => {
      expect(
        placed('Todo', ['ready-for-agent'], {}, liveConversation()),
      ).toEqual({
        lane: 'Queued',
        section: null,
      });
    });
  });
});

describe('isStalled and isInReview', () => {
  const base = {
    status: 'In progress' as const,
    labels: [],
    claim: null,
    externalReferences: [],
    type: 'Ticket' as const,
    children: [],
  };
  const live = liveConversation();

  it('does not stall a Ticket whose Conversation is idle: it still has one to answer', () => {
    expect(isStalled(base, liveConversation({ state: 'idle' }))).toBe(false);
  });

  it('puts an idle Ticket with a PR and no Claim in Review', () => {
    expect(
      isInReview(
        { ...base, externalReferences: [pullRequest] },
        liveConversation({ state: 'idle' }),
      ),
    ).toBe(true);
  });

  it('stalls an In progress Ticket with no Claim, PR or live Conversation', () => {
    expect(isStalled(base)).toBe(true);
    expect(isStalled({ ...base, claim })).toBe(false);
    expect(isStalled({ ...base, externalReferences: [pullRequest] })).toBe(
      false,
    );
    expect(isStalled(base, live)).toBe(false);
    expect(isStalled({ ...base, status: 'Todo' })).toBe(false);
  });

  it('puts a Ticket in Review for a PR reference without a live Conversation', () => {
    const withPullRequest = { ...base, externalReferences: [pullRequest] };
    expect(isInReview(withPullRequest)).toBe(true);
    expect(isInReview(withPullRequest, live)).toBe(false);
    expect(isInReview(base)).toBe(false);
    expect(isInReview({ ...withPullRequest, status: 'Done' })).toBe(false);
  });
});

describe('isParked', () => {
  const base = {
    status: 'In progress' as const,
    labels: [],
    claim: null,
    externalReferences: [],
    type: 'Ticket' as const,
    children: [],
  };

  it.each([
    ['Action needed', base],
    ['Running', { ...base, claim }],
    ['Review', { ...base, externalReferences: [pullRequest] }],
  ])('is true in %s without a live Conversation', (_section, ticket) => {
    expect(isParked(ticket)).toBe(true);
  });

  it.each([
    ['running', 'running' as const],
    ['idle', 'idle' as const],
  ])('is false with a %s Conversation', (_name, state) => {
    expect(isParked(base, liveConversation({ state }))).toBe(false);
  });

  it.each(['Todo', 'Done'] as const)('is false for a %s Ticket', (status) => {
    expect(isParked({ ...base, status })).toBe(false);
  });

  it('is true for an Epic In progress without a live Conversation', () => {
    expect(isParked({ ...base, type: 'Epic' })).toBe(true);
  });
});
