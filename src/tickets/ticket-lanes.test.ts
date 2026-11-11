import { describe, expect, it } from 'vitest';

import type { LiveConversation } from '../conversations/conversation-activity';
import { liveConversation } from '../test/conversation-activity';
import { anEpicChild } from '../test/fixtures';
import type { Status } from './status';
import { type LiveMap, type PlacementInput, placementOf } from './ticket-lanes';
import type { Ticket } from './tickets';

/** The Ticket the tests place, and the Epic a child of it links to. */
const ticketNumber = 7;
const epicNumber = 50;

/**
 * The live map of a Board with `own` on the Ticket and `epicLive` on its
 * Epic, as `ConversationActivity.live` holds it.
 */
const liveMap = (
  own?: LiveConversation,
  epicLive?: LiveConversation,
): LiveMap => {
  const live: Record<number, LiveConversation> = {};
  if (own) {
    live[ticketNumber] = own;
  }
  if (epicLive) {
    live[epicNumber] = epicLive;
  }
  return live;
};

/** `placementOf` for `ticket`, numbered `ticketNumber`. */
const place = (
  ticket: Omit<PlacementInput, 'number'>,
  own?: LiveConversation,
  epicLive?: LiveConversation,
) => placementOf({ number: ticketNumber, ...ticket }, liveMap(own, epicLive));

// The placement's parts, one per question a consumer asks.
const laneAndSection = (
  ticket: Omit<PlacementInput, 'number'>,
  own?: LiveConversation,
  epicLive?: LiveConversation,
) => {
  const { lane, section } = place(ticket, own, epicLive);
  return { lane, section };
};
const stalledOf = (
  ticket: Omit<PlacementInput, 'number'>,
  own?: LiveConversation,
  epicLive?: LiveConversation,
) => place(ticket, own, epicLive).stalled;
const placedByEpicOf = (
  ticket: Omit<PlacementInput, 'number'>,
  own?: LiveConversation,
) => place(ticket, own).placedByEpic;
const offersMerged = (
  ticket: Omit<PlacementInput, 'number'>,
  own?: LiveConversation,
) => place(ticket, own).offers.merged;
const offersBackToTodo = (
  ticket: Omit<PlacementInput, 'number'>,
  own?: LiveConversation,
) => place(ticket, own).offers.backToTodo;
const offersDoneOf = (
  ticket: Omit<PlacementInput, 'number'>,
  own?: LiveConversation,
) => place(ticket, own).offers.done;
const offersSpec = (ticket: Omit<PlacementInput, 'number'>) =>
  place(ticket).offers.spec;

const placed = (
  status: Status,
  labels: string[] = [],
  rest: Partial<
    Pick<Ticket, 'claim' | 'externalReferences' | 'type' | 'children'>
  > = {},
  live?: LiveConversation,
) =>
  laneAndSection(
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

const child = (number: number, archived = false) =>
  anEpicChild({ number, archived });

const claim = { agentRunId: 'run-1', agentName: null };
const pullRequest = 'https://github.com/owner/repo/pull/87';

describe('placementOf: lane and section', () => {
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

describe('placementOf: stalled and the Merged offer', () => {
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
    expect(stalledOf(base, liveConversation({ state: 'idle' }))).toBe(false);
  });

  it('puts an idle Ticket with a PR and no Claim in Review', () => {
    expect(
      offersMerged(
        { ...base, externalReferences: [pullRequest] },
        liveConversation({ state: 'idle' }),
      ),
    ).toBe(true);
  });

  it('stalls an In progress Ticket with no Claim, PR or live Conversation', () => {
    expect(stalledOf(base)).toBe(true);
    expect(stalledOf({ ...base, claim })).toBe(false);
    expect(stalledOf({ ...base, externalReferences: [pullRequest] })).toBe(
      false,
    );
    expect(stalledOf(base, live)).toBe(false);
    expect(stalledOf({ ...base, status: 'Todo' })).toBe(false);
  });

  it('puts a Ticket in Review for a PR reference without a live Conversation', () => {
    const withPullRequest = { ...base, externalReferences: [pullRequest] };
    expect(offersMerged(withPullRequest)).toBe(true);
    expect(offersMerged(withPullRequest, live)).toBe(false);
    expect(offersMerged(base)).toBe(false);
    expect(offersMerged({ ...withPullRequest, status: 'Done' })).toBe(false);
  });
});

describe('placementOf: the Back to Todo offer', () => {
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
    expect(offersBackToTodo(ticket)).toBe(true);
  });

  it.each([
    ['running', 'running' as const],
    ['idle', 'idle' as const],
  ])('is false with a %s Conversation', (_name, state) => {
    expect(offersBackToTodo(base, liveConversation({ state }))).toBe(false);
  });

  it.each(['Todo', 'Done'] as const)('is false for a %s Ticket', (status) => {
    expect(offersBackToTodo({ ...base, status })).toBe(false);
  });

  it.each([
    ['Action needed', {}],
    ['Running', { claim }],
    ['Review', { externalReferences: [pullRequest] }],
  ])('is true for an Epic in %s without a live Conversation', (_s, rest) => {
    expect(offersBackToTodo({ ...base, type: 'Epic', ...rest })).toBe(true);
  });

  it('is false for an Epic with a live Conversation or not In progress', () => {
    const epic = { ...base, type: 'Epic' as const };
    expect(offersBackToTodo(epic, liveConversation({ state: 'running' }))).toBe(
      false,
    );
    expect(offersBackToTodo({ ...epic, status: 'Todo' })).toBe(false);
  });
});

describe('placementOf: the Done offer (T1268)', () => {
  const base = {
    status: 'Todo' as const,
    labels: ['enhancement', 'ready-for-human'],
    claim: null,
    externalReferences: [],
    type: 'Ticket' as const,
    children: [],
  };

  it.each([
    ['a Todo Ticket', base],
    ['an In progress Ticket', { ...base, status: 'In progress' as const }],
    [
      'a claimed In progress Ticket',
      { ...base, status: 'In progress' as const, claim },
    ],
    ['an Epic', { ...base, type: 'Epic' as const }],
  ])('is true for %s labelled ready-for-human', (_name, ticket) => {
    expect(offersDoneOf(ticket)).toBe(true);
  });

  it('is false without ready-for-human', () => {
    expect(offersDoneOf({ ...base, labels: ['ready-for-agent'] })).toBe(false);
    expect(offersDoneOf({ ...base, labels: [] })).toBe(false);
  });

  it('is false for a Done Ticket', () => {
    expect(offersDoneOf({ ...base, status: 'Done' })).toBe(false);
  });

  it.each(['running', 'waiting'] as const)(
    'is false while a Conversation is %s',
    (state) => {
      expect(offersDoneOf(base, liveConversation({ state }))).toBe(false);
    },
  );

  it.each(['idle', 'interrupted', 'error'] as const)(
    'is true beside an %s Conversation, which works on nothing',
    (state) => {
      expect(offersDoneOf(base, liveConversation({ state }))).toBe(true);
    },
  );

  it('is false in Review, where Merged finishes it', () => {
    const inReview = {
      ...base,
      status: 'In progress' as const,
      externalReferences: [pullRequest],
    };
    expect(offersDoneOf(inReview)).toBe(false);
  });
});

describe('a child of an Epic (T1143)', () => {
  const epic = (
    rest: { claim?: typeof claim | null; hasPullRequest?: boolean } = {},
  ) => ({
    number: epicNumber,
    title: 'Epic',
    color: 'blue' as const,
    claim: null,
    hasPullRequest: false,
    ...rest,
  });
  const childOf = (
    link: ReturnType<typeof epic>,
    rest: Partial<Pick<Ticket, 'claim' | 'externalReferences'>> = {},
  ) => ({
    status: 'In progress' as const,
    labels: [],
    claim: null,
    externalReferences: [],
    type: 'Ticket' as const,
    children: [],
    epic: link,
    ...rest,
  });

  it("takes its section from its Epic's Claim, PR reference and live Conversation", () => {
    expect(laneAndSection(childOf(epic({ claim }))).section).toBe('Running');
    expect(
      laneAndSection(childOf(epic({ hasPullRequest: true }))).section,
    ).toBe('Review');
    expect(laneAndSection(childOf(epic())).section).toBe('Action needed');
    expect(
      laneAndSection(
        childOf(epic()),
        undefined,
        liveConversation({ state: 'running' }),
      ).section,
    ).toBe('Running');
    expect(
      laneAndSection(
        childOf(epic({ hasPullRequest: true })),
        undefined,
        liveConversation({ state: 'waiting' }),
      ).section,
    ).toBe('Action needed');
  });

  it('is placed by its own Claim, PR reference or live Conversation first', () => {
    const inReview = epic({ hasPullRequest: true });
    expect(laneAndSection(childOf(inReview, { claim })).section).toBe(
      'Running',
    );
    expect(
      laneAndSection(
        childOf(epic({ claim }), { externalReferences: [pullRequest] }),
      ).section,
    ).toBe('Review');
    expect(
      laneAndSection(childOf(inReview), liveConversation({ state: 'waiting' }))
        .section,
    ).toBe('Action needed');
  });

  it('says whether its section is inherited', () => {
    expect(placedByEpicOf(childOf(epic({ claim })))).toBe(true);
    expect(placedByEpicOf(childOf(epic(), { claim }))).toBe(false);
    expect(
      placedByEpicOf(childOf(epic()), liveConversation({ state: 'idle' })),
    ).toBe(false);
    expect(placedByEpicOf({ ...childOf(epic()), epic: null })).toBe(false);
    expect(placedByEpicOf({ ...childOf(epic()), status: 'Todo' })).toBe(false);
  });

  it('is not stalled while its Epic runs, and stalled when its Epic is', () => {
    expect(stalledOf(childOf(epic({ claim })))).toBe(false);
    expect(
      stalledOf(
        childOf(epic()),
        undefined,
        liveConversation({ state: 'running' }),
      ),
    ).toBe(false);
    expect(stalledOf(childOf(epic()))).toBe(true);
  });

  it("is not in Review for its Epic's PR: Merged belongs to the Epic", () => {
    expect(offersMerged(childOf(epic({ hasPullRequest: true })))).toBe(false);
    expect(
      offersMerged(childOf(epic(), { externalReferences: [pullRequest] })),
    ).toBe(true);
  });
});

describe('placementOf: the Spec offer (T1222)', () => {
  const input = (
    status: Status,
    labels: string[],
    rest: Partial<Pick<Ticket, 'type' | 'children'>> = {},
  ) => ({
    status,
    labels,
    claim: null,
    externalReferences: [],
    type: 'Ticket' as const,
    children: [],
    ...rest,
  });

  it('is true for a Todo Ticket in Intake', () => {
    expect(offersSpec(input('Todo', []))).toBe(true);
    expect(offersSpec(input('Todo', ['needs-triage']))).toBe(true);
    expect(offersSpec(input('Todo', ['needs-info']))).toBe(true);
  });

  it('is false for a Ticket in another Lane or Status', () => {
    expect(offersSpec(input('Todo', ['ready-for-agent']))).toBe(false);
    expect(offersSpec(input('Todo', ['ready-for-human']))).toBe(false);
    expect(offersSpec(input('In progress', []))).toBe(false);
    expect(offersSpec(input('Done', []))).toBe(false);
  });

  it('is true for a Todo Epic without children, whatever its label', () => {
    expect(offersSpec(input('Todo', [], { type: 'Epic' }))).toBe(true);
    expect(
      offersSpec(input('Todo', ['ready-for-human'], { type: 'Epic' })),
    ).toBe(true);
    expect(
      offersSpec(
        input('Todo', [], { type: 'Epic', children: [child(1, true)] }),
      ),
    ).toBe(true);
  });

  it('is false for an Epic with a child, or one that is not Todo', () => {
    expect(
      offersSpec(input('Todo', [], { type: 'Epic', children: [child(1)] })),
    ).toBe(false);
    expect(offersSpec(input('In progress', [], { type: 'Epic' }))).toBe(false);
  });
});

describe('placementOf: which run places a child, and what the drawer offers on it', () => {
  const epicLink = (
    rest: { claim?: typeof claim | null; hasPullRequest?: boolean } = {},
  ) => ({
    number: epicNumber,
    title: 'Epic',
    color: 'blue' as const,
    claim: null,
    hasPullRequest: false,
    ...rest,
  });
  const childOf = (
    link: ReturnType<typeof epicLink>,
    rest: Partial<
      Pick<Ticket, 'claim' | 'externalReferences' | 'labels' | 'status'>
    > = {},
  ) => ({
    status: 'In progress' as const,
    labels: [],
    claim: null,
    externalReferences: [],
    type: 'Ticket' as const,
    children: [],
    epic: link,
    ...rest,
  });
  const running = liveConversation({ state: 'running', conversationId: 9 });
  const waiting = liveConversation({ state: 'waiting', conversationId: 3 });

  it("is placed by its Epic's live Conversation when it has no run state of its own", () => {
    const placement = place(childOf(epicLink()), undefined, running);
    expect(placement).toMatchObject({
      lane: 'In progress',
      section: 'Running',
      placedByEpic: true,
      placedBy: running,
      stalled: false,
    });
  });

  it("is placed by its Epic's Claim, with no live Conversation placing it", () => {
    expect(place(childOf(epicLink({ claim })))).toMatchObject({
      section: 'Running',
      placedByEpic: true,
      placedBy: undefined,
      stalled: false,
    });
  });

  it("is placed by its own live Conversation, not its Epic's", () => {
    expect(place(childOf(epicLink()), waiting, running)).toMatchObject({
      section: 'Action needed',
      placedByEpic: false,
      placedBy: waiting,
      stalled: false,
    });
  });

  it('is stalled with its Epic when neither has a run', () => {
    expect(place(childOf(epicLink()))).toMatchObject({
      section: 'Action needed',
      placedByEpic: true,
      placedBy: undefined,
      stalled: true,
    });
  });

  it("is placed by its own live Conversation outside an Epic, and ignores another Ticket's", () => {
    const ticket = {
      status: 'In progress' as const,
      labels: [],
      claim: null,
      externalReferences: [],
      type: 'Ticket' as const,
      children: [],
    };
    expect(place(ticket, running)).toMatchObject({
      placedByEpic: false,
      placedBy: running,
    });
    // A live Conversation on Ticket 50 is not this one's Epic's: it has none.
    expect(place(ticket, undefined, running)).toMatchObject({
      section: 'Action needed',
      placedBy: undefined,
      stalled: true,
    });
  });

  it("offers Back to Todo and not Merged by its own run, whatever its Epic's", () => {
    // Its Epic's Conversation runs, its own run is none: parked, by its own.
    expect(place(childOf(epicLink()), undefined, running).offers).toEqual({
      spec: false,
      merged: false,
      done: false,
      backToTodo: true,
    });
    // In Review by its Epic's PR: Merged is the Epic's.
    expect(
      place(childOf(epicLink({ hasPullRequest: true }))).offers.merged,
    ).toBe(false);
  });

  it("offers Merged by its own PR while its Epic's Conversation runs", () => {
    const own = childOf(epicLink(), { externalReferences: [pullRequest] });
    expect(place(own, undefined, running).offers).toMatchObject({
      merged: true,
      backToTodo: true,
    });
    expect(place(own, waiting, running).offers).toMatchObject({
      merged: false,
      backToTodo: false,
    });
  });

  it("offers Done on a ready-for-human child by its own Conversation, not its Epic's", () => {
    const forHuman = childOf(epicLink(), { labels: ['ready-for-human'] });
    expect(place(forHuman, undefined, running).offers.done).toBe(true);
    expect(place(forHuman, running).offers.done).toBe(false);
  });

  it('offers Spec on a Todo idea in Intake only, whatever runs', () => {
    const idea = childOf(epicLink(), { status: 'Todo' });
    expect(place(idea, running, running).offers.spec).toBe(true);
    expect(place(idea, running, running)).toMatchObject({
      lane: 'Intake',
      section: null,
      placedByEpic: false,
      stalled: false,
    });
  });
});
