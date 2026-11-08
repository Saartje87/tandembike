import type {
  CreateWorktreeInput,
  PrepareResult,
  WorktreeState,
  Worktrees,
} from '../worktrees/worktrees';

export type FakeWorktrees = Worktrees & {
  /** Every worktree created, oldest first. */
  created: CreateWorktreeInput[];
  /** What `state` reports, by path; a created worktree starts `clean`. */
  states: Map<string, WorktreeState>;
  /** Makes the next `create` fail with this message. */
  failCreateWith: string | null;
  /** Every Prepare command run, oldest first. */
  prepared: { path: string; command: string }[];
  /** What the next Prepare commands report; a success by default. */
  prepareResult: PrepareResult;
};

/** A `Worktrees` for tests: it runs no git and records what it is told. */
export function createFakeWorktrees(): FakeWorktrees {
  const fake: FakeWorktrees = {
    created: [],
    states: new Map(),
    failCreateWith: null,
    prepared: [],
    prepareResult: { exitCode: 0, output: '' },
    async create(input) {
      if (fake.failCreateWith !== null) {
        throw new Error(fake.failCreateWith);
      }
      const path = `/fake/worktrees/${input.projectId}/c${input.conversationId}`;
      fake.created.push(input);
      fake.states.set(path, 'clean');
      return { path, base: 'origin/main' };
    },
    async state(path) {
      return fake.states.get(path) ?? 'missing';
    },
    async runPrepare(path, command) {
      fake.prepared.push({ path, command });
      return fake.prepareResult;
    },
  };
  return fake;
}
