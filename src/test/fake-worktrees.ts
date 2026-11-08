import type {
  CreateWorktreeInput,
  ListedWorktree,
  PrepareResult,
  WorktreeState,
  Worktrees,
} from '../worktrees/worktrees';

export type FakeWorktrees = Worktrees & {
  /** Every worktree created, oldest first. */
  created: CreateWorktreeInput[];
  /** What `state` reports, by path; a created worktree starts `clean`. */
  states: Map<string, WorktreeState>;
  /** Every `remove`, oldest first; it deletes the state, so the worktree reads `missing`. */
  removed: string[];
  /** What `repositoryOf` reports, by path; null for the rest. */
  repositories: Map<string, string>;
  /** What `list` reports. */
  listed: ListedWorktree[];
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
    removed: [],
    repositories: new Map(),
    listed: [],
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
    async remove(_repositoryPath, path) {
      const state = fake.states.get(path);
      if (state === 'dirty' || state === 'unpushed') {
        throw new Error(
          `fatal: '${path}' contains modified or untracked files`,
        );
      }
      fake.states.delete(path);
      fake.removed.push(path);
    },
    async repositoryOf(path) {
      return fake.repositories.get(path) ?? null;
    },
    async list() {
      return fake.listed;
    },
  };
  return fake;
}
