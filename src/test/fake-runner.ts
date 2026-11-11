import type {
  AgentRun,
  AgentRunner,
  RunEvent,
  RunOptions,
} from '../conversations/agent-runner';
import { claudeInvocationText } from '../conversations/claude-invocation';
import type { AgentKind } from '../tickets/agent-kind';

export type FakeRun = AgentRun & {
  options: RunOptions;
  /** The first message's text: a reply's, or the Stage as Claude Code words it. */
  firstMessage: string;
  sent: string[];
  interrupted: boolean;
  closed: boolean;
  /** Makes the run report `event`, as the real Agent would. */
  emit(event: RunEvent): void;
};

export type FakeRunner = AgentRunner & {
  /** The Agent kind it stands in for. */
  kind: AgentKind;
  /** Every run started, oldest first. */
  runs: FakeRun[];
};

/**
 * An `AgentRunner` for tests: it records what it is told and says what the
 * test emits. It can run unless a test replaces `availability`.
 */
export function createFakeRunner(kind: AgentKind = 'claude-code'): FakeRunner {
  const runs: FakeRun[] = [];
  return {
    kind,
    runs,
    availability: () => ({ available: true }),
    capabilities: {
      runModes: ['default', 'auto'],
      allowAlways: true,
      costUnit: 'usd',
    },
    // Worded as Claude Code does, so transcripts read as in the app.
    invocationText: claudeInvocationText,
    start(options) {
      const run: FakeRun = {
        options,
        firstMessage:
          'text' in options.message
            ? options.message.text
            : claudeInvocationText(
                options.message.invocation,
                options.agentCommands,
              ),
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

/** A fake runner per Agent kind, keyed as the app registers runners. */
export type FakeRunners = Record<AgentKind, FakeRunner>;
