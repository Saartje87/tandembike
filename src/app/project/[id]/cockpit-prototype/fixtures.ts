// PROTOTYPE (T1103), throwaway: fixture data for the Cockpit layout
// prototype. Deleted by T1104. Not production code: no tests.

import type { PaletteColor } from '../../../../tickets/palette';

export type EpicRef = { number: number; title: string; color: PaletteColor };

/** What a Needs you item waits on, which decides the action it offers. */
export type NeedKind =
  | 'permission'
  | 'question'
  | 'failed'
  | 'interrupted'
  | 'idle'
  | 'stalled'
  | 'review'
  | 'intake';

export type NeedItem = {
  number: number;
  title: string;
  kind: NeedKind;
  epic?: EpicRef;
  /** The status line, or what it waits on. */
  line: string;
  /** Minutes it has waited in this kind. */
  waiting: number;
  pr?: string;
  /** For Intake: its current state label. */
  label?: 'needs-triage' | 'needs-info';
};

export type ChildState = 'done' | 'running' | 'needs-you' | 'review' | 'queued';

export type FlightRow = {
  number: number;
  title: string;
  section: 'Running' | 'Action needed' | 'Review';
  /** Set for an Epic, with each child's state. */
  epic?: {
    color: PaletteColor;
    children: { number: number; title: string; state: ChildState }[];
  };
  line: string;
  /** Minutes since the run started. */
  minutes: number;
  cost: number;
  pr?: string;
};

export type PlainTicket = {
  number: number;
  title: string;
  epic?: EpicRef;
  /** Minutes since it reached this place (planned, labelled or Done). */
  age?: number;
  cost?: number;
  pr?: string;
  blockedBy?: number;
};

export type Scenario = {
  label: string;
  cycle: { title: string; done: number; total: number } | null;
  runs: { used: number; cap: number };
  autopilot: { on: boolean; spend: number; ceiling: number; paused: boolean };
  actionNeeded: NeedItem[];
  review: NeedItem[];
  intake: NeedItem[];
  inFlight: FlightRow[];
  yourWork: PlainTicket[];
  queued: PlainTicket[];
  done: PlainTicket[];
};

const lanes: EpicRef = { number: 1059, title: 'Board lanes', color: 'indigo' };
const cockpit: EpicRef = { number: 1102, title: 'Cockpit', color: 'teal' };

const queued: PlainTicket[] = [
  { number: 1110, title: 'Cache the Board query per request' },
  { number: 1111, title: 'Show the Claim holder on Running cards' },
  {
    number: 1106,
    title: 'Allow and Deny in the Needs you list',
    epic: cockpit,
  },
  {
    number: 1107,
    title: 'Intake in Needs you, Backlog included',
    epic: cockpit,
  },
  { number: 1108, title: 'Epic rows and Epics in Needs you', epic: cockpit },
  {
    number: 1112,
    title: 'Explain the spend ceiling on the settings page',
    blockedBy: 1094,
  },
  { number: 1113, title: 'Remove the old drop-zone styles' },
];

const done: PlainTicket[] = Array.from({ length: 12 }, (_, i) => ({
  number: 1040 + i,
  title: [
    'Derive Lanes from Status and labels',
    'Status line on In progress cards',
    'Merged button on Review cards',
    'Back to Todo on stalled cards',
    'Idle runs need the User',
    'Cost on cards',
  ][i % 6],
  age: 30 + i * 70,
  cost: 0.6 + ((i * 37) % 30) / 10,
  pr: `#${110 + i}`,
}));

const yourWork: PlainTicket[] = [
  { number: 1090, title: 'Decide the Autopilot default ceiling', age: 2880 },
  {
    number: 1091,
    title: 'Set up the git guardrail hook in the blocks repo',
    age: 600,
  },
];

const busy: Scenario = {
  label: 'Busy',
  cycle: { title: 'Factory Board', done: 12, total: 31 },
  runs: { used: 3, cap: 3 },
  autopilot: { on: true, spend: 18.4, ceiling: 40, paused: false },
  actionNeeded: [
    {
      number: 1104,
      title: 'Cockpit tab with In flight, Your work, Queued and Done',
      kind: 'permission',
      epic: cockpit,
      line: 'Allow Bash: git push -u origin ticket-1102-cockpit?',
      waiting: 14,
    },
    {
      number: 1098,
      title: 'Humanise MCP tool names on the status line',
      kind: 'question',
      line: 'Should unmapped tools show their first input value or nothing?',
      waiting: 9,
    },
    {
      number: 1097,
      title: 'Split the events route per Project',
      kind: 'failed',
      line: 'npm run check failed: 2 tests in board-live.test.tsx',
      waiting: 6,
    },
    {
      number: 1093,
      title: 'Rename Lane ids in the drag layer',
      kind: 'stalled',
      line: 'No Claim and no PR; its Conversation was closed',
      waiting: 120,
    },
  ],
  review: [
    {
      number: 1059,
      title: 'Board lanes',
      kind: 'review',
      epic: lanes,
      line: 'PR open, Claim released',
      waiting: 45,
      pr: '#130',
    },
    {
      number: 1095,
      title: 'Show the PR link on Review cards',
      kind: 'review',
      line: 'PR open, Claim released',
      waiting: 20,
      pr: '#133',
    },
  ],
  intake: [
    {
      number: 1101,
      title: 'Blocks Tag has no size between small and medium',
      kind: 'intake',
      line: 'Filed by a run while working T1066',
      waiting: 30,
      label: 'needs-triage',
    },
    {
      number: 1100,
      title: 'Worktree npm ci takes 40s per run',
      kind: 'intake',
      line: 'Filed by a run while working T1095',
      waiting: 75,
      label: 'needs-triage',
    },
    {
      number: 1099,
      title: 'Drawer loses scroll on live update',
      kind: 'intake',
      line: 'Waiting on more information',
      waiting: 300,
      label: 'needs-info',
    },
  ],
  inFlight: [
    {
      number: 1102,
      title: 'Cockpit',
      section: 'Action needed',
      epic: {
        color: 'teal',
        children: [
          { number: 1103, title: 'Cockpit prototype', state: 'done' },
          { number: 1104, title: 'Cockpit tab', state: 'needs-you' },
          { number: 1105, title: 'Needs you', state: 'queued' },
          { number: 1106, title: 'Allow and Deny', state: 'queued' },
          { number: 1107, title: 'Intake', state: 'queued' },
          { number: 1108, title: 'Epic rows', state: 'queued' },
        ],
      },
      line: 'Waiting: Allow Bash: git push?',
      minutes: 38,
      cost: 2.85,
    },
    {
      number: 1059,
      title: 'Board lanes',
      section: 'Review',
      epic: {
        color: 'indigo',
        children: [
          { number: 1063, title: 'Derived Lanes', state: 'done' },
          { number: 1064, title: 'In progress sections', state: 'done' },
          { number: 1065, title: 'Idle runs', state: 'done' },
          { number: 1066, title: 'Status line', state: 'review' },
          { number: 1068, title: 'Back to Todo', state: 'review' },
        ],
      },
      line: 'PR #130 open',
      minutes: 95,
      cost: 7.1,
      pr: '#130',
    },
    {
      number: 1096,
      title: 'Count Autopilot spend per Cycle',
      section: 'Running',
      line: 'Editing src/conversations/conversations.ts',
      minutes: 4,
      cost: 0.42,
    },
    {
      number: 1094,
      title: 'Persist the Autopilot switch',
      section: 'Running',
      line: 'Running npm run check',
      minutes: 12,
      cost: 1.2,
    },
  ],
  yourWork,
  queued,
  done,
};

const quiet: Scenario = {
  label: 'Quiet',
  cycle: { title: 'Factory Board', done: 12, total: 20 },
  runs: { used: 1, cap: 3 },
  autopilot: { on: true, spend: 9.1, ceiling: 40, paused: false },
  actionNeeded: [],
  review: [],
  intake: [],
  inFlight: [busy.inFlight[2]],
  yourWork,
  queued: queued.slice(0, 3),
  done,
};

const permission: Scenario = {
  ...quiet,
  label: 'Permission waiting',
  runs: { used: 2, cap: 3 },
  actionNeeded: [busy.actionNeeded[0]],
  inFlight: [busy.inFlight[0], busy.inFlight[2]],
};

const overCeiling: Scenario = {
  ...busy,
  label: 'Over ceiling',
  runs: { used: 1, cap: 3 },
  autopilot: { on: true, spend: 41.3, ceiling: 40, paused: true },
  actionNeeded: [],
  inFlight: [busy.inFlight[1], busy.inFlight[3]],
};

const cycleDone: Scenario = {
  label: 'Cycle done',
  cycle: { title: 'Factory Board', done: 20, total: 20 },
  runs: { used: 0, cap: 3 },
  autopilot: { on: true, spend: 27.9, ceiling: 40, paused: false },
  actionNeeded: [],
  review: [],
  intake: [busy.intake[0]],
  inFlight: [],
  yourWork: [],
  queued: [],
  done: [
    ...done,
    ...done.slice(0, 8).map((t) => ({ ...t, number: t.number + 100 })),
  ],
};

const noCycle: Scenario = {
  ...cycleDone,
  label: 'No Active Cycle',
  cycle: null,
  done: [],
};

export const scenarios = {
  busy,
  quiet,
  permission,
  'over-ceiling': overCeiling,
  'cycle-done': cycleDone,
  'no-cycle': noCycle,
} satisfies Record<string, Scenario>;

export type ScenarioKey = keyof typeof scenarios;

export const scenarioKeys = Object.keys(scenarios) as ScenarioKey[];
