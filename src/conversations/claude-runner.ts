import {
  query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';

import type { AgentRunner, Question, RunEvent } from './agent-runner';

const maxToolTextLength = 300;

/** The tool the Agent asks the User questions with; the chat shows it as a form. */
const askTool = 'AskUserQuestion';

const createToolName = /(^|__)create_tickets?$/;

/** The Ticket numbers in the JSON result of create_ticket or create_tickets. */
function createdNumbers(content: unknown): number[] {
  const text = Array.isArray(content)
    ? content.map((part) => (part?.type === 'text' ? part.text : '')).join('')
    : content;
  if (typeof text !== 'string') {
    return [];
  }
  try {
    const result = JSON.parse(text) as { number?: unknown; numbers?: unknown };
    const numbers = Array.isArray(result.numbers)
      ? result.numbers
      : [result.number];
    return numbers.filter((n): n is number => Number.isInteger(n));
  } catch {
    return [];
  }
}

/**
 * What a run reports for one SDK message; unknown kinds report nothing.
 * `createCalls` holds the ids of create_ticket(s) calls still awaiting their
 * result, so only Tickets the Agent actually created are reported.
 */
export function eventsOf(
  message: SDKMessage,
  createCalls: Set<string> = new Set(),
): RunEvent[] {
  if (message.type === 'system' && message.subtype === 'init') {
    return [{ type: 'session', sessionId: message.session_id }];
  }
  if (message.type === 'assistant') {
    const events: RunEvent[] = [];
    for (const block of message.message.content) {
      if (block.type === 'text' && block.text.trim() !== '') {
        events.push({ type: 'agent', text: block.text });
      } else if (block.type === 'tool_use' && block.name !== askTool) {
        if (createToolName.test(block.name)) {
          createCalls.add(block.id);
        }
        events.push({
          type: 'tool',
          text: `${block.name} ${JSON.stringify(block.input)}`.slice(
            0,
            maxToolTextLength,
          ),
        });
      }
    }
    return events;
  }
  if (message.type === 'user') {
    const content = message.message.content;
    if (!Array.isArray(content)) {
      return [];
    }
    return content.flatMap((block) => {
      if (
        block.type !== 'tool_result' ||
        !createCalls.delete(block.tool_use_id) ||
        block.is_error
      ) {
        return [];
      }
      const numbers = createdNumbers(block.content);
      return numbers.length === 0 ? [] : [{ type: 'created', numbers }];
    });
  }
  if (message.type === 'result') {
    const error = message.is_error
      ? message.subtype === 'success'
        ? message.result
        : message.subtype
      : undefined;
    return [
      {
        type: 'turn',
        costUsd: message.total_cost_usd,
        ...(error === undefined ? {} : { error }),
      },
    ];
  }
  return [];
}

const userMessage = (text: string): SDKUserMessage => ({
  type: 'user',
  message: { role: 'user', content: text },
  parent_tool_use_id: null,
});

/** A queue of messages the streaming input yields until `end()`. */
function createInput() {
  const queued: SDKUserMessage[] = [];
  let wake: (() => void) | null = null;
  let ended = false;

  return {
    push(text: string) {
      queued.push(userMessage(text));
      wake?.();
    },
    end() {
      ended = true;
      wake?.();
    },
    async *messages(): AsyncGenerator<SDKUserMessage> {
      while (true) {
        const next = queued.shift();
        if (next) {
          yield next;
        } else if (ended) {
          return;
        } else {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          wake = null;
        }
      }
    },
  };
}

/**
 * The runner for Claude Code, over the Claude Agent SDK's `query()` in
 * streaming input mode (ADR 0019). The run loads the repository's own
 * Claude Code settings, and asks for permission as in a terminal.
 */
export function createClaudeRunner(): AgentRunner {
  return {
    start({
      cwd,
      mcpUrl,
      systemPrompt,
      prompt,
      resume,
      askPermission,
      askQuestion,
      onEvent,
    }) {
      const input = createInput();
      input.push(prompt);

      const run = query({
        prompt: input.messages(),
        options: {
          cwd,
          ...(resume === undefined ? {} : { resume }),
          // Pinned, so a repository's or the user's defaultMode (such as
          // bypassPermissions) cannot skip the relay below.
          permissionMode: 'default',
          // The server injected below is ours, so its tools never prompt (ADR 0021).
          allowedTools: ['mcp__tandembike'],
          // What a terminal would ask the User comes to the Conversation.
          canUseTool: async (toolName, toolInput) => {
            if (toolName === askTool) {
              const answers = await askQuestion(
                (toolInput as { questions: Question[] }).questions.map(
                  ({ question, header, options, multiSelect }) => ({
                    question,
                    header,
                    options: options.map(({ label, description }) => ({
                      label,
                      description,
                    })),
                    multiSelect: multiSelect === true,
                  }),
                ),
              );
              return Object.keys(answers).length === 0
                ? { behavior: 'deny', message: 'The User did not answer.' }
                : {
                    behavior: 'allow',
                    updatedInput: { ...toolInput, answers },
                  };
            }
            return (await askPermission({ toolName, input: toolInput })) ===
              'allow'
              ? { behavior: 'allow', updatedInput: toolInput }
              : { behavior: 'deny', message: 'The User denied this.' };
          },
          mcpServers: { tandembike: { type: 'http', url: mcpUrl } },
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: systemPrompt,
          },
        },
      });

      const createCalls = new Set<string>();
      void (async () => {
        try {
          for await (const message of run) {
            for (const event of eventsOf(message, createCalls)) {
              onEvent(event);
            }
          }
          onEvent({ type: 'exit' });
        } catch (error) {
          onEvent({
            type: 'exit',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();

      return {
        send: (text) => input.push(text),
        interrupt: async () => {
          await run.interrupt();
        },
        close() {
          input.end();
          run.close();
        },
      };
    },
  };
}
