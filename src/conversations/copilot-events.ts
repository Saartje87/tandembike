import { isClaudeModel, notMeasuredModel } from '../footprint/footprint';
import {
  addTokens,
  noTokens,
  type UsageByModel,
} from '../footprint/token-usage';
import type { RunEvent } from './agent-runner';
import {
  type CopilotError,
  isTransientCopilotError,
} from './copilot-run-error';
import { copilotToolActivity } from './copilot-tool-activity';
import { copilotWidgetToolNames } from './copilot-widget-tools';
import { createdNumbers } from './created-numbers';

const maxToolTextLength = 300;

/**
 * A Copilot session event as the runner reads it: its type and its data. The
 * SDK's own types describe each; the mapping reads only the fields it needs,
 * so a newer runtime's extra fields change nothing.
 */
export type CopilotEvent = { type: string; data?: unknown };

/** What the mapping keeps across one run's events. */
export type CopilotEventState = {
  /** The run's session, once Copilot or the runner named it. */
  sessionId: string | null;
  /** The ids of file_tickets calls still awaiting their result. */
  createCalls: Set<string>;
  /** The error Copilot reported in the turn that is still going. */
  error: CopilotError | null;
  /** The run's cost so far in nano-AIU, from each model call's usage. */
  nanoAiu: number;
  /** The run's tokens so far per model (ADR 0050). */
  usage: UsageByModel;
};

export const copilotEventState = (): CopilotEventState => ({
  sessionId: null,
  createCalls: new Set(),
  error: null,
  nanoAiu: 0,
  usage: {},
});

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** AI credits are Copilot's nano-AIU over 10⁹ (ADR 0051). */
const nanoAiuPerCredit = 1_000_000_000;

type Data = Record<string, unknown>;

const stringOf = (data: Data, key: string): string | undefined => {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
};

const recordOf = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Tools whose call the chat shows as something else: the Widget tools as
 * their Widget, and Copilot's `ask_user` as its question.
 */
const shownElsewhere = new Set(['ask_user', ...copilotWidgetToolNames]);

const isFileTickets = (data: Data) =>
  data.mcpServerName === 'tandembike' && data.mcpToolName === 'file_tickets';

/**
 * What a run reports for one Copilot session event (ADR 0051): the Copilot
 * runner's whole map from Copilot's events to Tandembike's own. Events it
 * does not know report nothing.
 */
export function copilotEventsOf(
  event: CopilotEvent,
  state: CopilotEventState,
): RunEvent[] {
  const data = recordOf(event.data);
  switch (event.type) {
    case 'session.start': {
      const sessionId = stringOf(data, 'sessionId');
      if (sessionId === undefined) {
        return [];
      }
      state.sessionId = sessionId;
      const model = stringOf(data, 'selectedModel');
      return [{ type: 'session', sessionId, ...(model ? { model } : {}) }];
    }
    case 'session.model_change': {
      const model = stringOf(data, 'newModel');
      return state.sessionId === null || !model
        ? []
        : [{ type: 'session', sessionId: state.sessionId, model }];
    }
    case 'assistant.message': {
      const text = stringOf(data, 'content') ?? '';
      // A subagent's own messages stay inside its tool call.
      return text.trim() === '' || data.parentToolCallId !== undefined
        ? []
        : [{ type: 'agent', text }];
    }
    case 'tool.execution_start': {
      const name = stringOf(data, 'toolName');
      if (name === undefined || shownElsewhere.has(name)) {
        return [];
      }
      const input = recordOf(data.arguments);
      const toolCallId = stringOf(data, 'toolCallId');
      if (toolCallId !== undefined && isFileTickets(data)) {
        state.createCalls.add(toolCallId);
      }
      return [
        {
          type: 'tool',
          text: `${name} ${JSON.stringify(input)}`.slice(0, maxToolTextLength),
          name,
          input,
          activity: copilotToolActivity({
            toolName: name,
            mcpServerName: stringOf(data, 'mcpServerName'),
            mcpToolName: stringOf(data, 'mcpToolName'),
            input,
          }),
        },
      ];
    }
    case 'tool.execution_complete': {
      const toolCallId = stringOf(data, 'toolCallId');
      if (
        toolCallId === undefined ||
        !state.createCalls.delete(toolCallId) ||
        data.success !== true
      ) {
        return [];
      }
      const numbers = createdNumbers(recordOf(data.result).content);
      return numbers.length === 0 ? [] : [{ type: 'created', numbers }];
    }
    case 'assistant.usage': {
      // Recorded live: these events are not kept in the session's log.
      state.nanoAiu += count(recordOf(data.copilotUsage).totalNanoAiu);
      const model = stringOf(data, 'model');
      if (model) {
        // A model with no Claude tier is stored apart: not measured, never
        // counted as Opus (ADR 0051).
        const key = isClaudeModel(model) ? model : notMeasuredModel(model);
        state.usage[key] = addTokens(state.usage[key] ?? noTokens, {
          input: count(data.inputTokens),
          output: count(data.outputTokens),
          cacheWrite: count(data.cacheWriteTokens),
          cacheRead: count(data.cacheReadTokens),
        });
      }
      return [];
    }
    case 'session.error': {
      state.error = {
        message: stringOf(data, 'message') ?? 'Copilot reported an error.',
        ...(typeof data.errorType === 'string'
          ? { errorType: data.errorType }
          : {}),
        ...(typeof data.statusCode === 'number'
          ? { statusCode: data.statusCode }
          : {}),
      };
      return [];
    }
    case 'session.idle': {
      const error = state.error;
      state.error = null;
      return [
        {
          type: 'turn',
          cost: state.nanoAiu / nanoAiuPerCredit,
          ...(Object.keys(state.usage).length === 0
            ? {}
            : { usage: structuredClone(state.usage) }),
          ...(error === null
            ? {}
            : {
                error: error.message,
                transient: isTransientCopilotError(error),
              }),
        },
      ];
    }
    case 'session.shutdown': {
      // The session ended: on purpose when the runner closed it, else after
      // a crash or fatal error, which reports its reason.
      const reason = stringOf(data, 'errorReason');
      return data.shutdownType === 'error'
        ? [
            {
              type: 'exit',
              error: reason ?? 'Copilot stopped with an error.',
              transient: isTransientCopilotError({
                message: reason ?? '',
              }),
            },
          ]
        : [{ type: 'exit' }];
    }
    default:
      return [];
  }
}
