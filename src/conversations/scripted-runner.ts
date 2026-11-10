import type { WorktreeState, Worktrees } from '../worktrees/worktrees';
import type { AgentRun, AgentRunner, RunOptions } from './agent-runner';

/**
 * Fake runs for browser checks (T678): an `AgentRunner` that starts no Agent
 * process and moves its Conversation to the state a message asks for, so a
 * throwaway server can show a running or waiting Conversation without a real
 * run or a database write. Only `fake-runs.ts` turns it on, behind an env
 * setting that the server refuses on the User's port.
 *
 * Each message, the first one or a reply, may hold one directive:
 * - `fake:permission`: asks the User a permission request (waiting).
 * - `fake:widget`: asks the User choice cards (waiting).
 * - `fake:idle`: ends the turn; the Conversation listens for a reply.
 * - `fake:exit`: ends the turn and the run's process.
 * Without one, the run says it got the message and keeps running. An
 * answered request leaves it running again.
 */
export const fakeDirectives = ['permission', 'widget', 'idle', 'exit'] as const;
type FakeDirective = (typeof fakeDirectives)[number];

function directiveOf(text: string): FakeDirective | null {
  const found = /\bfake:(\w+)/.exec(text)?.[1];
  return fakeDirectives.find((directive) => directive === found) ?? null;
}

let sessions = 0;

export function createScriptedRunner(): AgentRunner {
  return {
    start(options: RunOptions): AgentRun {
      let closed = false;
      // Deferred, as a real run reports after `start` and `send` return:
      // the Conversation sets its own state right after them.
      const later = (step: () => void) =>
        setTimeout(() => {
          if (!closed) step();
        }, 0);
      const say = (text: string) =>
        options.onEvent({ type: 'agent', text: `Fake run: ${text}` });

      const act = (text: string) => {
        switch (directiveOf(text)) {
          case 'permission':
            void options
              .askPermission({
                toolName: 'Bash',
                input: { command: 'echo fake' },
                rules: ['Bash(echo:*)'],
              })
              .then((answer) => later(() => say(`permission ${answer}.`)));
            return;
          case 'widget':
            void options
              .askWidget({
                kind: 'choice',
                prompt: 'Which state next?',
                options: [{ label: 'Running' }, { label: 'Idle' }],
                multiSelect: false,
              })
              .then((answer) =>
                later(() => say(`answered ${JSON.stringify(answer)}.`)),
              );
            return;
          case 'idle':
            options.onEvent({ type: 'turn', costUsd: 0 });
            return;
          case 'exit':
            options.onEvent({ type: 'turn', costUsd: 0 });
            options.onEvent({ type: 'exit' });
            return;
          case null:
            say(`got "${text}", running.`);
        }
      };

      later(() => {
        options.onEvent({
          type: 'session',
          sessionId: options.resume ?? `fake-session-${++sessions}`,
          model: 'fake',
        });
        act(options.prompt);
      });
      return {
        send(text) {
          later(() => act(text));
        },
        async interrupt() {
          later(() => options.onEvent({ type: 'turn', costUsd: 0 }));
        },
        close() {
          closed = true;
        },
      };
    },
  };
}

/**
 * Worktrees that run no git, for fake runs: a Conversation gets a path that
 * is never made, so a check needs no repository and leaves the shared
 * worktrees folder alone.
 */
export function createScriptedWorktrees(): Worktrees {
  const states = new Map<string, WorktreeState>();
  return {
    async create({ projectId, conversationId }) {
      const path = `/fake-worktrees/${projectId}/c${conversationId}`;
      states.set(path, 'clean');
      return { path, base: 'origin/main' };
    },
    async state(path) {
      return states.get(path) ?? 'missing';
    },
    async runPrepare() {
      return { exitCode: 0, output: '' };
    },
    async remove(_repositoryPath, path) {
      states.delete(path);
    },
    async repositoryOf() {
      return null;
    },
    async list() {
      return [];
    },
  };
}
