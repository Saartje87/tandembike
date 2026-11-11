import type { RunEvent } from './agent-runner';
import {
  type CopilotError,
  isTransientCopilotError,
} from './copilot-run-error';
import { copilotToolActivity } from './copilot-tool-activity';
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
};

export const copilotEventState = (): CopilotEventState => ({
  sessionId: null,
  createCalls: new Set(),
  error: null,
});

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
const shownElsewhere = new Set([
  'ask_user',
  'ask_choice',
  'ask_rank',
  'ask_matrix',
  'ask_scale',
]);

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
          cost: 0,
          ...(error === null
            ? {}
            : {
                error: error.message,
                transient: isTransientCopilotError(error),
              }),
        },
      ];
    }
    default:
      return [];
  }
}
