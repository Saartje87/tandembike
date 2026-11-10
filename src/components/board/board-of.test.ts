import { describe, expect, it } from 'vitest';

import { activity, liveConversation } from '../../test/conversation-activity';
import type { EpicLink } from '../../tickets/epic-link';
import type { Ticket } from '../../tickets/tickets';
import { boardOf } from './board-of';

const ticket = (fields: Partial<Ticket> & Pick<Ticket, 'number'>): Ticket => ({
  title: `Ticket ${fields.number}`,
  description: '',
  status: 'Todo',
  projectId: 1,
  position: 0,
  archived: false,
  labels: [],
  externalReferences: [],
  attachments: [],
  blockedBy: [],
  blocked: false,
  type: 'Ticket',
  color: null,
  epic: null,
  children: [],
  origin: null,
  splitOff: [],
  cycle: null,
  claim: null,
  acceptanceCriteria: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...fields,
});

const claim = { agentRunId: 'run-1', agentName: null };
const pullRequest = (n: number) => `https://github.com/owner/repo/pull/${n}`;
const numbers = (rows: { number: number }[]) =>
  rows.map(({ number }) => number);

describe('boardOf', () => {
  it('puts In progress Tickets In flight, in Board order', () => {
    const view = boardOf(
      [
        ticket({ number: 2, status: 'In progress', position: 2, claim }),
        ticket({ number: 1, status: 'In progress', position: 1, claim }),
      ],
      activity(),
    );

    expect(numbers(view.inFlight)).toEqual([1, 2]);
  });

  it("gives an In flight row its section, live line, run start and the Ticket's total cost", () => {
    const live = liveConversation({
      line: 'Editing board.tsx',
      since: '2026-11-07T10:00:00.000Z',
      cost: 0.4,
    });
    const [row] = boardOf(
      [
        ticket({
          number: 7,
          title: 'Status line',
          status: 'In progress',
          claim,
        }),
      ],
      activity({ live: { 7: live }, cost: { 7: 1.25 } }),
    ).inFlight;

    expect(row).toMatchObject({
      number: 7,
      title: 'Status line',
      section: 'Running',
      live,
      cost: 1.25,
      pullRequest: null,
    });
  });

  it('keeps only Running Tickets In flight; Action needed and Review need you', () => {
    const view = boardOf(
      [
        ticket({ number: 1, status: 'In progress', claim }),
        ticket({
          number: 2,
          status: 'In progress',
          externalReferences: [pullRequest(10)],
        }),
        ticket({ number: 3, status: 'In progress' }),
        ticket({ number: 4, status: 'In progress', claim }),
      ],
      activity({ live: { 4: liveConversation({ state: 'waiting' }) } }),
    );

    expect(numbers(view.inFlight)).toEqual([1]);
    expect(numbers(view.needsYou.actionNeeded)).toEqual([3, 4]);
    expect(numbers(view.needsYou.review)).toEqual([2]);
  });

  it('says what each Action needed Ticket waits on', () => {
    const { actionNeeded } = boardOf(
      [
        ticket({ number: 1, status: 'In progress', claim }),
        ticket({ number: 2, status: 'In progress', claim }),
        ticket({ number: 3, status: 'In progress', claim }),
        ticket({ number: 4, status: 'In progress' }),
        ticket({ number: 5, status: 'In progress', claim }),
      ],
      activity({
        live: {
          1: liveConversation({
            state: 'waiting',
            since: '2026-11-07T10:01:00Z',
          }),
          2: liveConversation({
            state: 'error',
            since: '2026-11-07T10:02:00Z',
          }),
          3: liveConversation({
            state: 'interrupted',
            since: '2026-11-07T10:03:00Z',
          }),
          5: liveConversation({ state: 'idle', since: '2026-11-07T10:04:00Z' }),
        },
      }),
    ).needsYou;

    expect(actionNeeded.map(({ number, kind }) => [number, kind])).toEqual([
      [4, 'stalled'],
      [1, 'waiting'],
      [2, 'failed'],
      [3, 'interrupted'],
      [5, 'idle'],
    ]);
  });

  it('puts the longest waiting first within a group', () => {
    const { actionNeeded, review } = boardOf(
      [
        ticket({
          number: 1,
          status: 'In progress',
          claim,
          position: 0,
        }),
        ticket({
          number: 2,
          status: 'In progress',
          position: 1,
          updatedAt: new Date('2026-11-07T09:00:00Z'),
        }),
        ticket({
          number: 3,
          status: 'In progress',
          externalReferences: [pullRequest(30)],
          updatedAt: new Date('2026-11-07T12:00:00Z'),
        }),
        ticket({
          number: 4,
          status: 'In progress',
          externalReferences: [pullRequest(40)],
          updatedAt: new Date('2026-11-07T08:00:00Z'),
        }),
      ],
      activity({
        live: {
          1: liveConversation({
            state: 'waiting',
            since: '2026-11-07T11:00:00Z',
          }),
        },
      }),
    ).needsYou;

    expect(actionNeeded.map(({ number, since }) => [number, since])).toEqual([
      [2, new Date('2026-11-07T09:00:00Z')],
      [1, new Date('2026-11-07T11:00:00Z')],
    ]);
    expect(
      review.map(({ number, pullRequest }) => [number, pullRequest]),
    ).toEqual([
      [4, 'https://github.com/owner/repo/pull/40'],
      [3, 'https://github.com/owner/repo/pull/30'],
    ]);
  });

  it('lists Intake after Review, in Board order', () => {
    const view = boardOf(
      [
        ticket({
          number: 1,
          labels: ['needs-triage'],
          createdAt: new Date('2026-11-05'),
        }),
        ticket({ number: 2, createdAt: new Date('2026-11-03') }),
        ticket({ number: 3, labels: ['ready-for-agent'] }),
      ],
      activity(),
    );

    expect(
      view.needsYou.intake.map(({ number, kind, triageLabel, since }) => [
        number,
        kind,
        triageLabel,
        since,
      ]),
    ).toEqual([
      [1, 'intake', 'needs-triage', new Date('2026-11-05')],
      [2, 'intake', null, new Date('2026-11-03')],
    ]);
    expect(numbers(view.queued)).toEqual([3]);
    expect(view.needsYou.count).toBe(2);
  });

  it('counts every Ticket that needs you', () => {
    const view = boardOf(
      [
        ticket({ number: 1, status: 'In progress' }),
        ticket({
          number: 2,
          status: 'In progress',
          externalReferences: [pullRequest(10)],
        }),
        ticket({ number: 3, status: 'In progress', claim }),
      ],
      activity(),
    );

    expect(view.needsYou.count).toBe(2);
  });

  it("shows the Ticket's latest pull request", () => {
    const [row] = boardOf(
      [
        ticket({
          number: 1,
          status: 'In progress',
          externalReferences: [pullRequest(10), 'ABC-3', pullRequest(12)],
        }),
      ],
      activity(),
    ).needsYou.review;

    expect(row.pullRequest).toBe(pullRequest(12));
  });

  it('lists ready-for-human Todo Tickets as Your work, in Board order', () => {
    const view = boardOf(
      [
        ticket({ number: 1, labels: ['ready-for-human'], position: 2 }),
        ticket({ number: 2, labels: ['ready-for-human'], position: 1 }),
        ticket({ number: 3, labels: ['ready-for-agent'] }),
      ],
      activity(),
    );

    expect(numbers(view.yourWork)).toEqual([2, 1]);
  });

  it('queues ready-for-agent Todo Tickets in the Queued order', () => {
    const view = boardOf(
      [
        ticket({ number: 1, labels: ['ready-for-agent'], position: 3 }),
        ticket({ number: 2, labels: ['ready-for-agent'], position: 1 }),
        ticket({ number: 3, labels: ['needs-triage'], position: 0 }),
        ticket({ number: 4, labels: ['ready-for-agent'], position: 2 }),
      ],
      activity(),
    );

    expect(numbers(view.queued)).toEqual([2, 4, 1]);
  });

  it('names the unresolved Blockers of a queued Ticket it knows of', () => {
    const view = boardOf(
      [
        ticket({
          number: 1,
          labels: ['ready-for-agent'],
          blockedBy: [2, 3, 9],
          blocked: true,
        }),
        ticket({ number: 2, status: 'Done' }),
        ticket({ number: 3, status: 'In progress', claim }),
        ticket({ number: 4, labels: ['ready-for-agent'], blockedBy: [2] }),
      ],
      activity(),
    );

    expect(view.queued).toMatchObject([
      { number: 1, blocked: true, blockers: [3, 9] },
      { number: 4, blocked: false, blockers: [] },
    ]);
  });

  it('lists Done Tickets most recently changed first, with their cost and pull request', () => {
    const view = boardOf(
      [
        ticket({
          number: 1,
          status: 'Done',
          updatedAt: new Date('2026-11-01'),
        }),
        ticket({
          number: 2,
          status: 'Done',
          updatedAt: new Date('2026-11-05'),
          externalReferences: [pullRequest(20)],
        }),
      ],
      activity({ cost: { 2: 3.5 } }),
    );

    expect(view.done).toMatchObject([
      { number: 2, cost: 3.5, pullRequest: pullRequest(20) },
      { number: 1, cost: 0, pullRequest: null },
    ]);
  });

  it('leaves out Epics, archived Tickets and Intake', () => {
    const view = boardOf(
      [
        ticket({ number: 1, type: 'Epic', status: 'In progress' }),
        ticket({ number: 2, status: 'In progress', archived: true }),
        ticket({ number: 3, labels: ['needs-triage'] }),
        ticket({ number: 4 }),
      ],
      activity(),
    );

    expect(view).toMatchObject({
      inFlight: [],
      yourWork: [],
      queued: [],
      done: [],
    });
  });

  it("keeps a child's Epic on its row", () => {
    const epic = {
      number: 50,
      title: 'Roadmap',
      color: 'teal' as const,
      claim: null,
      hasPullRequest: false,
    };
    const [row] = boardOf(
      [ticket({ number: 1, labels: ['ready-for-agent'], epic })],
      activity(),
    ).queued;

    expect(row.epic).toEqual(epic);
  });

  it("gives every row the Ticket's labels, in its order, without state labels", () => {
    const view = boardOf(
      [
        ticket({
          number: 1,
          labels: ['from:tandembike', 'needs-triage', 'bug', 'wontfix'],
        }),
        ticket({
          number: 2,
          status: 'In progress',
          claim,
          labels: ['enhancement', 'ready-for-agent'],
        }),
        ticket({ number: 3, labels: ['ready-for-human', 'bug'] }),
        ticket({ number: 4, labels: ['ready-for-agent'] }),
        ticket({ number: 5, status: 'Done', labels: ['bug', 'wontfix'] }),
      ],
      activity(),
    );

    expect(view.needsYou.intake[0].labels).toEqual(['from:tandembike', 'bug']);
    expect(view.inFlight[0].labels).toEqual(['enhancement']);
    expect(view.yourWork[0].labels).toEqual(['bug']);
    expect(view.queued[0].labels).toEqual([]);
    expect(view.done[0].labels).toEqual(['bug']);
  });

  it('counts the Tickets done of all, without Epics or archived ones', () => {
    const view = boardOf(
      [
        ticket({ number: 1, status: 'Done' }),
        ticket({ number: 2, status: 'Done' }),
        ticket({ number: 3, labels: ['needs-triage'] }),
        ticket({ number: 4, status: 'In progress', claim }),
        ticket({ number: 5, type: 'Epic', status: 'Done' }),
        ticket({ number: 6, status: 'Done', archived: true }),
      ],
      activity(),
    );

    expect(view.progress).toEqual({ done: 2, total: 4 });
  });

  describe('Epics', () => {
    const link: EpicLink = {
      number: 50,
      title: 'Roadmap',
      color: 'teal',
      claim: null,
      hasPullRequest: false,
    };
    const child = (
      number: number,
      status: Ticket['status'],
      title = `Child ${number}`,
    ) => ({
      number,
      title,
      status,
      archived: false,
      blockedBy: [],
      blocked: false,
    });
    const epic = (fields: Partial<Ticket> = {}) =>
      ticket({
        number: 50,
        title: 'Roadmap',
        type: 'Epic',
        color: 'teal',
        status: 'In progress',
        claim,
        children: [child(1, 'Done'), child(2, 'In progress'), child(3, 'Todo')],
        ...fields,
      });
    const children = [
      ticket({ number: 1, status: 'Done', epic: link }),
      ticket({ number: 2, status: 'In progress', claim, epic: link }),
      ticket({ number: 3, labels: ['ready-for-agent'], epic: link }),
    ];

    it('gives an In progress Epic an In flight row with its children, and its children none of their own', () => {
      const view = boardOf(
        [
          epic(),
          ...children,
          ticket({ number: 4, status: 'In progress', claim }),
        ],
        activity(),
      );

      expect(view.epics).toMatchObject([
        {
          number: 50,
          title: 'Roadmap',
          color: 'teal',
          section: 'Running',
          childNeedsYou: false,
          children: [
            { number: 1, title: 'Child 1', state: 'done' },
            { number: 2, title: 'Child 2', state: 'started' },
            { number: 3, title: 'Child 3', state: 'queued' },
          ],
        },
      ]);
      expect(numbers(view.inFlight)).toEqual([4]);
    });

    describe("children placed by their Epic's run (T1143)", () => {
      const started = (number: number, epic = link) =>
        ticket({ number, status: 'In progress', epic });
      const twoStarted = [child(2, 'In progress'), child(5, 'In progress')];

      it('counts an Epic in Review with its two In progress children as one Needs you row', () => {
        const view = boardOf(
          [
            epic({
              claim: null,
              externalReferences: [pullRequest(143)],
              children: twoStarted,
            }),
            started(2, { ...link, hasPullRequest: true }),
            started(5, { ...link, hasPullRequest: true }),
          ],
          activity(),
        );

        expect(numbers(view.needsYou.review)).toEqual([50]);
        expect(view.needsYou.actionNeeded).toEqual([]);
        expect(view.needsYou.count).toBe(1);
        expect(view.needsYou.review[0]).toMatchObject({
          childNeedsYou: false,
          children: [
            { number: 2, state: 'started' },
            { number: 5, state: 'started' },
          ],
        });
      });

      it("shows children started while their Epic's run goes, with no rows of their own", () => {
        const view = boardOf(
          [epic({ claim: null, children: twoStarted }), started(2), started(5)],
          activity({ live: { 50: liveConversation({ state: 'running' }) } }),
        );

        expect(view.needsYou.count).toBe(0);
        expect(numbers(view.inFlight)).toEqual([]);
        expect(
          view.epics[0].children.map(({ number, state }) => [number, state]),
        ).toEqual([
          [2, 'started'],
          [5, 'started'],
        ]);
      });

      it("folds the children of a stalled Epic into the Epic's Action needed row, started, not needing you (T1263)", () => {
        const view = boardOf(
          [epic({ claim: null, children: twoStarted }), started(2), started(5)],
          activity(),
        );

        expect(numbers(view.needsYou.actionNeeded)).toEqual([50]);
        expect(view.needsYou.count).toBe(1);
        expect(view.needsYou.actionNeeded[0]).toMatchObject({
          childNeedsYou: false,
          children: [
            { number: 2, state: 'started' },
            { number: 5, state: 'started' },
          ],
        });
      });

      it('shows children started under an Epic whose own Conversation waits on the User (T1263)', () => {
        const view = boardOf(
          [epic({ claim: null, children: twoStarted }), started(2), started(5)],
          activity({ live: { 50: liveConversation({ state: 'waiting' }) } }),
        );

        expect(view.needsYou.actionNeeded[0]).toMatchObject({
          number: 50,
          kind: 'waiting',
          childNeedsYou: false,
          children: [
            { number: 2, state: 'started' },
            { number: 5, state: 'started' },
          ],
        });
      });

      it('keeps a Needs you row for a child whose own Conversation needs the User', () => {
        const view = boardOf(
          [
            epic({ children: twoStarted }),
            started(2, { ...link, claim }),
            started(5, { ...link, claim }),
          ],
          activity({ live: { 5: liveConversation({ state: 'waiting' }) } }),
        );

        expect(numbers(view.needsYou.actionNeeded)).toEqual([5]);
        expect(view.epics[0].childNeedsYou).toBe(true);
        expect(
          view.epics[0].children.map(({ number, state }) => [number, state]),
        ).toEqual([
          [2, 'started'],
          [5, 'needs-you'],
        ]);
      });

      it('places a child whose Epic is on another Board by that Epic, in a row of its own', () => {
        const view = boardOf([started(2, { ...link, claim })], activity());

        expect(numbers(view.inFlight)).toEqual([2]);
        expect(view.needsYou.count).toBe(0);
      });
    });

    describe('children built on the Epic branch (T1144)', () => {
      const criteria = (...checked: boolean[]) =>
        checked.map((isChecked, index) => ({
          id: index + 1,
          text: `Criterion ${index + 1}`,
          checked: isChecked,
        }));
      const reviewLink = { ...link, hasPullRequest: true };
      const reviewEpic = (children: ReturnType<typeof child>[]) =>
        epic({
          claim: null,
          externalReferences: [pullRequest(143)],
          children,
        });

      it('marks an In progress child with every acceptance criterion checked as built', () => {
        const [row] = boardOf(
          [
            reviewEpic([
              child(2, 'In progress'),
              child(5, 'In progress'),
              child(6, 'In progress'),
            ]),
            ticket({
              number: 2,
              status: 'In progress',
              epic: reviewLink,
              acceptanceCriteria: criteria(true, true),
            }),
            ticket({
              number: 5,
              status: 'In progress',
              epic: reviewLink,
              acceptanceCriteria: criteria(true, false),
            }),
            ticket({ number: 6, status: 'In progress', epic: reviewLink }),
          ],
          activity(),
        ).needsYou.review;

        expect(
          row.children?.map(({ number, state }) => [number, state]),
        ).toEqual([
          [2, 'built'],
          [5, 'started'],
          [6, 'started'],
        ]);
      });

      it("keeps a built child's Lane and section: it still has no row of its own", () => {
        const view = boardOf(
          [
            epic({ claim: null, children: [child(2, 'In progress')] }),
            ticket({
              number: 2,
              status: 'In progress',
              epic: link,
              acceptanceCriteria: criteria(true),
            }),
          ],
          activity({ live: { 50: liveConversation({ state: 'running' }) } }),
        );

        expect(view.epics[0].children).toMatchObject([
          { number: 2, state: 'built' },
        ]);
        expect(numbers(view.inFlight)).toEqual([]);
        expect(numbers(view.done)).toEqual([]);
      });

      it("lets a built child's own Conversation outrank built only when it needs the User", () => {
        const view = boardOf(
          [
            epic({
              children: [child(2, 'In progress'), child(5, 'In progress')],
            }),
            ticket({
              number: 2,
              status: 'In progress',
              claim,
              epic: link,
              acceptanceCriteria: criteria(true),
            }),
            ticket({
              number: 5,
              status: 'In progress',
              claim,
              epic: link,
              acceptanceCriteria: criteria(true),
            }),
          ],
          activity({
            live: {
              2: liveConversation({ state: 'running' }),
              5: liveConversation({ state: 'waiting' }),
            },
          }),
        );

        expect(
          view.epics[0].children.map(({ number, state }) => [number, state]),
        ).toEqual([
          [2, 'built'],
          [5, 'needs-you'],
        ]);
        expect(view.epics[0].childNeedsYou).toBe(true);
      });

      it('never marks a Todo or Done child built', () => {
        const [row] = boardOf(
          [
            epic({ children: [child(1, 'Done'), child(3, 'Todo')] }),
            ticket({
              number: 1,
              status: 'Done',
              epic: link,
              acceptanceCriteria: criteria(true),
            }),
            ticket({
              number: 3,
              labels: ['ready-for-agent'],
              epic: link,
              acceptanceCriteria: criteria(true),
            }),
          ],
          activity(),
        ).epics;

        expect(row.children.map(({ state }) => state)).toEqual([
          'done',
          'queued',
        ]);
      });
    });

    it("marks an In progress child started, whatever its own or its Epic's section (T1263)", () => {
      const [row] = boardOf(
        [
          epic({
            children: [
              child(2, 'In progress'),
              child(5, 'In progress'),
              child(6, 'In progress'),
              child(7, 'In progress'),
            ],
          }),
          ticket({ number: 2, status: 'In progress', claim, epic: link }),
          ticket({ number: 5, status: 'In progress', epic: link }),
          ticket({
            number: 6,
            status: 'In progress',
            externalReferences: [pullRequest(60)],
            epic: link,
          }),
        ],
        activity(),
      ).epics;

      expect(row.children.map(({ number, state }) => [number, state])).toEqual([
        [2, 'started'],
        [5, 'started'],
        [6, 'started'],
      ]);
    });

    it('leaves out archived children', () => {
      const [row] = boardOf(
        [
          epic({
            children: [
              child(2, 'In progress'),
              { ...child(8, 'Todo'), archived: true },
            ],
          }),
          children[1],
        ],
        activity(),
      ).epics;

      expect(numbers(row.children)).toEqual([2]);
    });

    it('lists only the children on this Board, counting the unarchived ones elsewhere', () => {
      const [row] = boardOf(
        [
          epic({
            children: [
              child(2, 'In progress'),
              child(7, 'In progress'),
              child(8, 'Done'),
              { ...child(9, 'Todo'), archived: true },
            ],
          }),
          children[1],
        ],
        activity(),
      ).epics;

      expect(numbers(row.children)).toEqual([2]);
      expect(row.childrenElsewhere).toBe(2);
    });

    it('keeps an Epic row with none of its children on this Board', () => {
      const view = boardOf(
        [
          epic({ number: 51, children: [child(9, 'Todo')] }),
          epic({
            number: 52,
            status: 'Todo',
            claim: null,
            labels: ['ready-for-agent'],
            children: [child(9, 'Todo')],
          }),
        ],
        activity(),
      );

      expect(view.epics).toMatchObject([
        { number: 51, children: [], childrenElsewhere: 1 },
      ]);
      // Its children on another Board count: it stays Queued (T1139).
      expect(view.queued).toMatchObject([
        { number: 52, children: [], childrenElsewhere: 1 },
      ]);
    });

    it('puts a ready-for-agent Epic without unarchived children in Needs you, counted (T1139)', () => {
      const view = boardOf(
        [
          epic({
            number: 52,
            status: 'Todo',
            claim: null,
            labels: ['ready-for-agent'],
            children: [{ ...child(9, 'Todo'), archived: true }],
          }),
          epic({
            number: 53,
            status: 'Todo',
            claim: null,
            labels: ['ready-for-human'],
            children: [],
          }),
        ],
        activity(),
      );

      expect(view.queued).toEqual([]);
      expect(view.needsYou.intake).toMatchObject([
        {
          number: 52,
          kind: 'intake',
          triageLabel: 'ready-for-agent',
          children: [],
          childrenElsewhere: 0,
        },
      ]);
      expect(view.needsYou.count).toBe(1);
      expect(view.needsYou.total).toBe(1);
      expect(numbers(view.yourWork)).toEqual([53]);
    });

    it('labels such an Epic ready-for-agent in Intake whatever other state label it carries', () => {
      const [row] = boardOf(
        [
          epic({
            number: 52,
            status: 'Todo',
            claim: null,
            labels: ['needs-info', 'ready-for-agent'],
            children: [],
          }),
        ],
        activity(),
      ).needsYou.intake;

      // As laneOf reads it: ready-for-agent decides first.
      expect(row).toMatchObject({ number: 52, triageLabel: 'ready-for-agent' });
    });

    it("sums the Epic's own cost and its children's, and carries its live Conversation", () => {
      const live = liveConversation({ line: 'Editing board.tsx' });
      const [row] = boardOf(
        [epic(), children[0], children[1]],
        activity({
          live: { 50: live },
          cost: { 50: 1, 1: 0.5, 2: 0.25, 3: 2, 9: 4 },
        }),
      ).epics;

      // Child 3, on another Board, still counts toward the Epic's cost.
      expect(row).toMatchObject({ live, cost: 3.75 });
    });

    it('puts an Epic in Review or Action needed in Needs you too, in its colour', () => {
      const view = boardOf(
        [
          epic({ claim: null, externalReferences: [pullRequest(70)] }),
          ...children,
        ],
        activity(),
      );

      expect(view.needsYou.review).toMatchObject([
        { number: 50, color: 'teal', pullRequest: pullRequest(70) },
      ]);
      expect(view.needsYou.count).toBe(1);
    });

    it('lists an Epic in Review or Action needed in Needs you only, not In flight', () => {
      const view = boardOf(
        [
          epic({
            number: 50,
            claim: null,
            externalReferences: [pullRequest(70)],
          }),
          epic({ number: 51, claim: null }),
          epic({ number: 52 }),
        ],
        activity(),
      );

      expect(numbers(view.needsYou.review)).toEqual([50]);
      expect(numbers(view.needsYou.actionNeeded)).toEqual([51]);
      expect(numbers(view.epics)).toEqual([52]);
      expect(view.needsYou.count).toBe(2);
    });

    it('gives an Epic in Needs you its children', () => {
      const view = boardOf(
        [
          epic({ claim: null, externalReferences: [pullRequest(70)] }),
          ...children,
        ],
        activity(),
      );

      expect(
        view.needsYou.review[0]?.children?.map(({ number }) => number),
      ).toEqual([1, 2, 3]);
    });

    describe('in Intake', () => {
      const intakeEpic = (fields: Partial<Ticket> = {}) =>
        epic({
          status: 'Todo',
          claim: null,
          labels: ['needs-triage'],
          createdAt: new Date('2026-11-01'),
          ...fields,
        });

      it('is an Epic row of Needs you > Intake, with its children, and counts', () => {
        const view = boardOf(
          [
            intakeEpic({
              children: [child(1, 'Todo'), child(2, 'Todo')],
            }),
            ticket({ number: 1, epic: link }),
            ticket({ number: 2, epic: link, labels: ['needs-info'] }),
            ticket({ number: 8, position: 1 }),
          ],
          activity(),
        );

        expect(view.needsYou.intake).toMatchObject([
          {
            number: 50,
            kind: 'intake',
            color: 'teal',
            triageLabel: 'needs-triage',
            children: [{ number: 1 }, { number: 2 }],
          },
          { number: 8 },
        ]);
        expect(view.needsYou.count).toBe(2);
      });

      it("takes its Board position among the Board's Intake", () => {
        const view = boardOf(
          [
            ticket({ number: 8, position: 1 }),
            intakeEpic({ position: 2, children: [] }),
            ticket({ number: 9, position: 3 }),
          ],
          activity(),
        );

        expect(numbers(view.needsYou.intake)).toEqual([8, 50, 9]);
      });
    });

    it('places a Todo Epic by its label, at its Board position among the Tickets', () => {
      const view = boardOf(
        [
          ticket({ number: 4, labels: ['ready-for-agent'], position: 1 }),
          epic({
            status: 'Todo',
            claim: null,
            labels: ['ready-for-agent'],
            position: 2,
            children: [child(3, 'Todo')],
          }),
          ticket({ number: 3, labels: ['ready-for-agent'], epic: link }),
          ticket({ number: 5, labels: ['ready-for-agent'], position: 3 }),
          ticket({ number: 6, labels: ['ready-for-human'], position: 4 }),
          epic({
            number: 51,
            status: 'Todo',
            claim: null,
            labels: ['ready-for-human'],
            position: 5,
            children: [],
          }),
        ],
        activity(),
      );

      expect(numbers(view.queued)).toEqual([4, 50, 5]);
      expect(view.queued[1]).toMatchObject({
        color: 'teal',
        children: [{ number: 3, state: 'queued' }],
      });
      expect(numbers(view.yourWork)).toEqual([6, 51]);
      expect(view.epics).toEqual([]);
    });

    it('places a Done Epic in Done with its cost and children', () => {
      const view = boardOf(
        [
          epic({ status: 'Done', claim: null, children: [child(1, 'Done')] }),
          ticket({ number: 1, status: 'Done', epic: link }),
        ],
        activity({ cost: { 50: 1, 1: 0.5 } }),
      );

      expect(view.done).toMatchObject([
        { number: 50, cost: 1.5, children: [{ number: 1, state: 'done' }] },
      ]);
    });

    it("lists an Epic's children only in its row, in every section", () => {
      const view = boardOf(
        [
          epic({
            status: 'Todo',
            claim: null,
            labels: ['ready-for-agent'],
            children: [child(1, 'Done'), child(2, 'Todo'), child(3, 'Todo')],
          }),
          ticket({ number: 1, status: 'Done', epic: link }),
          ticket({ number: 2, labels: ['ready-for-agent'], epic: link }),
          ticket({ number: 3, labels: ['ready-for-human'], epic: link }),
          ticket({ number: 9, status: 'In progress', claim, epic: link }),
        ],
        activity(),
      );

      expect(numbers(view.queued)).toEqual([50]);
      expect(view.yourWork).toEqual([]);
      expect(view.done).toEqual([]);
      expect(view.inFlight).toEqual([]);
    });

    it("still lists a child in Needs you, in its Epic's colour", () => {
      const view = boardOf(
        [
          epic({
            status: 'Todo',
            claim: null,
            labels: ['ready-for-agent'],
            children: [child(5, 'In progress')],
          }),
          ticket({ number: 5, status: 'In progress', epic: link }),
        ],
        activity(),
      );

      expect(view.needsYou.actionNeeded).toMatchObject([
        { number: 5, epic: { color: 'teal' } },
      ]);
      expect(view.queued).toMatchObject([{ number: 50, childNeedsYou: true }]);
    });

    it('shows an In progress Epic even when its children are on another Board, but not an archived one', () => {
      const view = boardOf(
        [
          epic({ number: 51, children: [child(9, 'In progress')] }),
          epic({ number: 52, archived: true }),
        ],
        activity(),
      );

      expect(numbers(view.epics)).toEqual([51]);
    });
  });

  describe('with a Board filter', () => {
    const filter = (query: string, labels: string[] = []) => ({
      query,
      labels,
    });
    const link = {
      number: 50,
      title: 'Epic',
      color: 'teal' as const,
      claim: null,
      hasPullRequest: false,
    };
    const child = (number: number, title: string) => ({
      number,
      title,
      status: 'Todo' as const,
      archived: false,
      blockedBy: [],
      blocked: false,
    });

    it('narrows every section to the Tickets that match', () => {
      const view = boardOf(
        [
          ticket({
            number: 1,
            title: 'Fix login',
            status: 'In progress',
            claim,
          }),
          ticket({ number: 2, title: 'Other', status: 'In progress', claim }),
          ticket({ number: 3, title: 'Fix cart', labels: ['ready-for-agent'] }),
          ticket({ number: 4, title: 'Other', labels: ['ready-for-agent'] }),
          ticket({ number: 5, title: 'Fix it', labels: ['ready-for-human'] }),
          ticket({ number: 6, title: 'Other', labels: ['ready-for-human'] }),
          ticket({ number: 7, title: 'Fix more', status: 'Done' }),
          ticket({ number: 8, title: 'Other', status: 'Done' }),
          ticket({
            number: 9,
            title: 'Fix review',
            status: 'In progress',
            externalReferences: [pullRequest(1)],
          }),
          ticket({
            number: 10,
            title: 'Other',
            status: 'In progress',
            externalReferences: [pullRequest(2)],
          }),
          ticket({ number: 11, title: 'Fix new' }),
          ticket({ number: 12, title: 'Other' }),
        ],
        activity(),
        filter('fix'),
      );

      expect(numbers(view.inFlight)).toEqual([1]);
      expect(numbers(view.queued)).toEqual([3]);
      expect(numbers(view.yourWork)).toEqual([5]);
      expect(numbers(view.done)).toEqual([7]);
      expect(numbers(view.needsYou.review)).toEqual([9]);
      expect(numbers(view.needsYou.intake)).toEqual([11]);
    });

    it('narrows by label', () => {
      const view = boardOf(
        [
          ticket({ number: 1, labels: ['ready-for-agent', 'bug'] }),
          ticket({ number: 2, labels: ['ready-for-agent'] }),
        ],
        activity(),
        filter('', ['bug']),
      );

      expect(numbers(view.queued)).toEqual([1]);
    });

    it('counts the filtered sections, but keeps the whole Needs you count apart', () => {
      const view = boardOf(
        [
          ticket({ number: 1, title: 'Fix' }),
          ticket({ number: 2, title: 'Other' }),
        ],
        activity(),
        filter('fix'),
      );

      expect(view.needsYou.count).toBe(1);
      expect(view.needsYou.total).toBe(2);
    });

    it('leaves the progress unfiltered', () => {
      const view = boardOf(
        [
          ticket({ number: 1, title: 'Fix', status: 'Done' }),
          ticket({ number: 2, title: 'Other' }),
        ],
        activity(),
        filter('fix'),
      );

      expect(view.progress).toEqual({ done: 1, total: 2 });
    });

    it('keeps an Epic row when a child matches, narrowing its children to the matches', () => {
      const view = boardOf(
        [
          ticket({
            number: 50,
            title: 'Epic',
            type: 'Epic',
            color: 'teal',
            status: 'Todo',
            labels: ['ready-for-agent'],
            children: [child(1, 'Fix login'), child(2, 'Other')],
          }),
          ticket({
            number: 1,
            title: 'Fix login',
            epic: link,
            labels: ['ready-for-agent'],
          }),
          ticket({
            number: 2,
            title: 'Other',
            epic: link,
            labels: ['ready-for-agent'],
          }),
        ],
        activity(),
        filter('login'),
      );

      expect(view.queued).toMatchObject([
        { number: 50, children: [{ number: 1 }] },
      ]);
    });

    it('keeps all the children of an Epic that matches itself', () => {
      const view = boardOf(
        [
          ticket({
            number: 50,
            title: 'Epic',
            type: 'Epic',
            color: 'teal',
            status: 'Todo',
            labels: ['ready-for-agent'],
            children: [child(1, 'A'), child(2, 'B')],
          }),
          ticket({ number: 1, title: 'A', epic: link }),
          ticket({ number: 2, title: 'B', epic: link }),
        ],
        activity(),
        filter('epic'),
      );

      expect(view.queued[0]?.children).toHaveLength(2);
    });

    it('drops an Epic row when neither it nor a child matches', () => {
      const view = boardOf(
        [
          ticket({
            number: 50,
            title: 'Epic',
            type: 'Epic',
            color: 'teal',
            status: 'Todo',
            labels: ['ready-for-agent'],
            children: [child(1, 'A')],
          }),
        ],
        activity(),
        filter('zzz'),
      );

      expect(view.queued).toEqual([]);
    });

    it('narrows the Intake Epic row and an In progress Epic the same way', () => {
      const view = boardOf(
        [
          ticket({
            number: 50,
            title: 'Epic',
            type: 'Epic',
            color: 'teal',
            status: 'In progress',
            claim,
            children: [child(1, 'Fix'), child(2, 'Other')],
          }),
          ticket({ number: 1, title: 'Fix', epic: link }),
          ticket({ number: 2, title: 'Other', epic: link }),
        ],
        activity(),
        filter('fix'),
      );

      expect(view.epics).toMatchObject([
        { number: 50, children: [{ number: 1 }] },
      ]);
    });

    it('keeps an Epic row by its children on this Board only', () => {
      const view = boardOf(
        [
          ticket({
            number: 50,
            title: 'Epic',
            type: 'Epic',
            color: 'teal',
            status: 'Todo',
            labels: ['ready-for-agent'],
            children: [child(1, 'Other'), child(2, 'Fix elsewhere')],
          }),
          ticket({
            number: 1,
            title: 'Other',
            epic: link,
            labels: ['ready-for-agent'],
          }),
        ],
        activity(),
        filter('fix'),
      );

      expect(view.queued).toEqual([]);
    });
  });
});
