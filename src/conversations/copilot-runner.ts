import type { CopilotClient, CopilotSession } from '@github/copilot-sdk';

import { noAgentCommands } from '../tickets/agent-commands';
import type {
  AgentRunner,
  RunEvent,
  RunnerAvailability,
  RunnerCapabilities,
  StageInvocation,
} from './agent-runner';
import { claudeInvocationText } from './claude-invocation';
import {
  type CopilotEvent,
  copilotEventState,
  copilotEventsOf,
} from './copilot-events';
import { isTransientCopilotError } from './copilot-run-error';
import { copilotSessionConfig } from './copilot-session-config';

/** How long an answer to "can Copilot run" is kept before it is asked again. */
const availabilityTtlMs = 30_000;

const checking: RunnerAvailability = {
  available: false,
  reason: 'Checking whether Copilot can run…',
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * How a Copilot run invokes a Stage (ADR 0051): Copilot loads the Playbook
 * as a plugin with the same namespaced commands, so it reads as Claude
 * Code's, but always the Playbook's skill: agent command overrides are
 * Claude Code commands.
 */
const copilotInvocationText = (invocation: StageInvocation): string =>
  claudeInvocationText(invocation, noAgentCommands);

type CopilotRunnerOptions = {
  /** The time, for how long an availability answer is kept. */
  clock?: () => number;
};

/**
 * The runner for GitHub Copilot, over `@github/copilot-sdk` (ADR 0051). The
 * SDK is imported the first time a Copilot run starts or someone asks
 * whether Copilot can run, never on a Claude Code run, and its runtime is
 * started once and shared by every Copilot run. Runs use the User's own
 * Copilot sign-in and `~/.copilot`; Tandembike holds no token.
 */
export function createCopilotRunner({
  clock = Date.now,
}: CopilotRunnerOptions = {}): AgentRunner {
  let client: Promise<CopilotClient> | null = null;
  const clientOf = (): Promise<CopilotClient> => {
    client ??= (async () => {
      const { CopilotClient } = await import('@github/copilot-sdk');
      const started = new CopilotClient();
      await started.start();
      return started;
    })().catch((error: unknown) => {
      // A later run or check tries again, such as after an install.
      client = null;
      throw error;
    });
    return client;
  };

  let known: { availability: RunnerAvailability; at: number } | null = null;
  let probing: Promise<RunnerAvailability> | null = null;
  const probe = (): Promise<RunnerAvailability> => {
    probing ??= (async (): Promise<RunnerAvailability> => {
      try {
        const status = await (await clientOf()).getAuthStatus();
        return status.isAuthenticated
          ? { available: true }
          : {
              available: false,
              reason: `Copilot is not signed in${status.statusMessage ? ` (${status.statusMessage})` : ''}. Sign in with copilot login, or gh auth login.`,
            };
      } catch (error) {
        return {
          available: false,
          reason: `Copilot could not start: ${messageOf(error)}`,
        };
      }
    })().then((availability) => {
      known = { availability, at: clock() };
      probing = null;
      return availability;
    });
    return probing;
  };
  /** False once a session reported no Assisted permissions for the account. */
  let assistedAvailable = true;

  const fresh = () => known !== null && clock() - known.at < availabilityTtlMs;

  return {
    // The last answer, refreshed in the background once it is stale.
    availability() {
      if (!fresh()) {
        void probe();
      }
      return known?.availability ?? checking;
    },
    checkAvailability: async () =>
      fresh() && known ? known.availability : probe(),
    // `auto` is Tandembike acting on Copilot's Assisted verdicts, until a
    // session says the account has none; Allow-always approves for the
    // session (ADR 0051).
    get capabilities(): RunnerCapabilities {
      return {
        runModes: assistedAvailable ? ['default', 'auto'] : ['default'],
        allowAlways: true,
        costUnit: 'ai_credits',
      };
    },
    invocationText: copilotInvocationText,
    start(options) {
      const { message, resume, onEvent, runMode = 'default' } = options;
      let assisted = false;
      const state = copilotEventState();
      const onSessionEvent = (event: CopilotEvent) => {
        for (const runEvent of copilotEventsOf(event, state)) {
          // An end goes through `end`, so a run reports it once.
          if (runEvent.type === 'exit') {
            end(runEvent);
          } else {
            onEvent(runEvent);
          }
        }
      };
      let session: CopilotSession | null = null;
      let ended = false;
      /** Reports the run's end once, however it came. */
      const end = (exit: Extract<RunEvent, { type: 'exit' }>) => {
        if (ended) {
          return;
        }
        ended = true;
        onEvent(exit);
      };
      const failed = (error: unknown): Extract<RunEvent, { type: 'exit' }> => {
        const message = messageOf(error);
        return {
          type: 'exit',
          error: message,
          transient: isTransientCopilotError({ message }),
        };
      };
      const queued: string[] = [];
      /** The session once its first message is sent: replies go straight in. */
      let accepting: CopilotSession | null = null;

      const ready = (async () => {
        try {
          const copilot = await clientOf();
          const config = copilotSessionConfig(options, {
            onEvent: onSessionEvent,
            assisted: () => assisted,
          });
          session =
            resume === undefined
              ? await copilot.createSession(config)
              : await copilot.resumeSession(resume, config);
          if (ended) {
            await session.disconnect();
            return;
          }
          state.sessionId = session.sessionId;
          onEvent({ type: 'session', sessionId: session.sessionId });
          if (runMode === 'auto') {
            const { assistedApproval } =
              await session.rpc.permissions.getCapabilities();
            assistedAvailable = assistedApproval;
            if (assistedApproval) {
              await session.rpc.permissions.setMode({ mode: 'assisted' });
              assisted = true;
            } else {
              onEvent({ type: 'runMode', wanted: 'auto', runMode: 'default' });
            }
          }
          await session.send(
            'text' in message
              ? message.text
              : copilotInvocationText(message.invocation),
          );
          // Replies sent while the session started follow the first message.
          while (queued.length > 0) {
            await session.send({
              prompt: queued.shift() as string,
              mode: 'enqueue',
            });
          }
          accepting = session;
        } catch (error) {
          end(failed(error));
        }
      })();

      return {
        send(text) {
          if (accepting === null) {
            queued.push(text);
            return;
          }
          // A session that died cannot take the reply: the run has ended.
          accepting
            .send({ prompt: text, mode: 'enqueue' })
            .catch((error: unknown) => end(failed(error)));
        },
        async interrupt() {
          await ready;
          await session?.abort();
        },
        close() {
          if (ended) {
            return;
          }
          const open = session;
          end({ type: 'exit' });
          void open?.disconnect().catch(() => undefined);
        },
      };
    },
  };
}
