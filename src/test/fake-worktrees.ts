import type {
  CreateWorktreeInput,
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
};

/** A `Worktrees` for tests: it runs no git and records what it is told. */
export function createFakeWorktrees(): FakeWorktrees {
  const fake: FakeWorktrees = {
    created: [],
    states: new Map(),
    failCreateWith: null,
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
  };
  return fake;
}
