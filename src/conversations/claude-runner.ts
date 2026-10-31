import {
  query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';

import type { AgentRunner, RunEvent } from './agent-runner';

const maxToolTextLength = 300;

/** What a run reports for one SDK message; unknown kinds report nothing. */
export function eventsOf(message: SDKMessage): RunEvent[] {
  if (message.type === 'system' && message.subtype === 'init') {
    return [{ type: 'session', sessionId: message.session_id }];
  }
  if (message.type === 'assistant') {
    const events: RunEvent[] = [];
    for (const block of message.message.content) {
      if (block.type === 'text' && block.text.trim() !== '') {
        events.push({ type: 'agent', text: block.text });
      } else if (block.type === 'tool_use') {
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
          // What a terminal would ask the User comes to the Conversation.
          canUseTool: async (toolName, toolInput) =>
            (await askPermission({ toolName, input: toolInput })) === 'allow'
              ? { behavior: 'allow', updatedInput: toolInput }
              : { behavior: 'deny', message: 'The User denied this.' },
          mcpServers: { tandembike: { type: 'http', url: mcpUrl } },
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: systemPrompt,
          },
        },
      });

      void (async () => {
        try {
          for await (const message of run) {
            for (const event of eventsOf(message)) {
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
