import type {
  AgentRun,
  AgentRunner,
  RunEvent,
  RunOptions,
} from '../conversations/agent-runner';

export type FakeRun = AgentRun & {
  options: RunOptions;
  sent: string[];
  interrupted: boolean;
  closed: boolean;
  /** Makes the run report `event`, as the real Agent would. */
  emit(event: RunEvent): void;
};

export type FakeRunner = AgentRunner & {
  /** Every run started, oldest first. */
  runs: FakeRun[];
};

/** An `AgentRunner` for tests: it records what it is told and says what the test emits. */
export function createFakeRunner(): FakeRunner {
  const runs: FakeRun[] = [];
  return {
    runs,
    start(options) {
      const run: FakeRun = {
        options,
        sent: [],
        interrupted: false,
        closed: false,
        send(text) {
          run.sent.push(text);
        },
        async interrupt() {
          run.interrupted = true;
        },
        close() {
          run.closed = true;
        },
        emit(event) {
          options.onEvent(event);
        },
      };
      runs.push(run);
      return run;
    },
  };
}
