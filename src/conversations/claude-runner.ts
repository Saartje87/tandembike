import {
  type ModelUsage,
  type PermissionUpdate,
  query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';

import type { UsageByModel } from '../footprint/token-usage';
import type {
  AgentRunner,
  RunEvent,
  Widget,
  WidgetAnswer,
} from './agent-runner';
import { claudeInvocationText } from './claude-invocation';
import { isTransientClaudeError } from './claude-run-error';
import { claudeToolActivity } from './claude-tool-activity';
import { claudeDisallowedTools } from './claude-tool-policy';
import {
  createWidgetServer,
  isWidgetTool,
  widgetServerName,
} from './claude-widget-server';

const maxToolTextLength = 300;

/** The tool the Agent asks the User questions with; the chat shows each as a choice Widget. */
const askTool = 'AskUserQuestion';

/** One question of AskUserQuestion's input. */
type AskQuestion = {
  question: string;
  options: { label: string; description?: string }[];
  multiSelect?: boolean;
};

/**
 * AskUserQuestion's answers by question text, from one choice Widget per
 * question asked in turn (ADR 0045): the choices comma-separated, or the
 * Other text. A skipped question is left out. Null when the run ended first.
 */
async function askQuestions(
  questions: AskQuestion[],
  askWidget: (widget: Widget) => Promise<WidgetAnswer>,
): Promise<Record<string, string> | null> {
  const answers: Record<string, string> = {};
  for (const { question, options, multiSelect } of questions) {
    const answer = await askWidget({
      kind: 'choice',
      prompt: question,
      options: options.map(({ label, description }) => ({
        label,
        ...(description ? { description } : {}),
      })),
      multiSelect: multiSelect === true,
    });
    if ('expired' in answer) {
      return null;
    }
    if ('selected' in answer) {
      answers[question] = answer.selected.join(', ');
    } else if ('other' in answer) {
      answers[question] = answer.other;
    }
  }
  return answers;
}

const createToolName = /(^|__)file_tickets$/;

/** The Ticket numbers in the JSON result of file_tickets. */
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
 * `createCalls` holds the ids of file_tickets calls still awaiting their
 * result, so only Tickets the Agent actually created are reported.
 */
export function eventsOf(
  message: SDKMessage,
  createCalls: Set<string> = new Set(),
): RunEvent[] {
  if (message.type === 'system' && message.subtype === 'init') {
    return [
      {
        type: 'session',
        sessionId: message.session_id,
        ...(message.model ? { model: message.model } : {}),
      },
    ];
  }
  if (message.type === 'assistant') {
    const events: RunEvent[] = [];
    for (const block of message.message.content) {
      if (block.type === 'text' && block.text.trim() !== '') {
        events.push({ type: 'agent', text: block.text });
      } else if (
        block.type === 'tool_use' &&
        block.name !== askTool &&
        !isWidgetTool(block.name)
      ) {
        if (createToolName.test(block.name)) {
          createCalls.add(block.id);
        }
        events.push({
          type: 'tool',
          text: `${block.name} ${JSON.stringify(block.input)}`.slice(
            0,
            maxToolTextLength,
          ),
          name: block.name,
          input: block.input as Record<string, unknown>,
          activity: claudeToolActivity(
            block.name,
            block.input as Record<string, unknown>,
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
        cost: message.total_cost_usd,
        ...(message.modelUsage ? { usage: usageOf(message.modelUsage) } : {}),
        ...(error === undefined
          ? {}
          : {
              error,
              transient: isTransientClaudeError(error, message.subtype),
            }),
      },
    ];
  }
  return [];
}

/** A result's `modelUsage` as tokens per model, by type (ADR 0050). */
function usageOf(modelUsage: Record<string, ModelUsage>): UsageByModel {
  return Object.fromEntries(
    Object.entries(modelUsage).map(([model, usage]) => [
      model,
      {
        input: usage.inputTokens ?? 0,
        output: usage.outputTokens ?? 0,
        cacheWrite: usage.cacheCreationInputTokens ?? 0,
        cacheRead: usage.cacheReadInputTokens ?? 0,
      },
    ]),
  );
}

/** The allow rules among an SDK call's suggestions; any other kind is dropped. */
function allowRules(
  suggestions: PermissionUpdate[] = [],
): Extract<PermissionUpdate, { type: 'addRules' }>[] {
  return suggestions.filter(
    (
      suggestion,
    ): suggestion is Extract<PermissionUpdate, { type: 'addRules' }> =>
      suggestion.type === 'addRules' &&
      suggestion.behavior === 'allow' &&
      suggestion.rules.length > 0,
  );
}

/** A rule in Claude Code's syntax: `Tool` or `Tool(pattern)`. */
function ruleString(rule: { toolName: string; ruleContent?: string }): string {
  return rule.ruleContent
    ? `${rule.toolName}(${rule.ruleContent})`
    : rule.toolName;
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
    // The SDK ships with the app, so Claude Code can always run (ADR 0051).
    availability: () => ({ available: true }),
    // Claude's classifier serves `auto`; Allow-always saves Claude Code rules.
    capabilities: {
      runModes: ['default', 'auto'],
      allowAlways: true,
      costUnit: 'usd',
    },
    invocationText: claudeInvocationText,
    start({
      cwd,
      agentRunId,
      mcpUrl,
      systemPrompt,
      message,
      agentCommands,
      resume,
      plugins,
      runMode = 'default',
      model,
      toolPolicy,
      askPermission,
      askWidget,
      onEvent,
    }) {
      const input = createInput();
      input.push(
        'text' in message
          ? message.text
          : claudeInvocationText(message.invocation, agentCommands),
      );

      const run = query({
        prompt: input.messages(),
        options: {
          cwd,
          plugins,
          ...(resume === undefined ? {} : { resume }),
          ...(model === undefined ? {} : { model }),
          ...(toolPolicy === undefined
            ? {}
            : { disallowedTools: claudeDisallowedTools(toolPolicy) }),
          // The Project's run mode, never the repository's or the user's
          // defaultMode, so bypassPermissions cannot skip the relay below;
          // calls the auto classifier cannot decide still reach canUseTool.
          permissionMode: runMode,
          // The servers injected below are ours, so their tools never prompt
          // (ADR 0021, ADR 0045).
          allowedTools: ['mcp__tandembike', `mcp__${widgetServerName}`],
          // What a terminal would ask the User comes to the Conversation.
          canUseTool: async (toolName, toolInput, { suggestions }) => {
            if (toolName === askTool) {
              const answers = await askQuestions(
                (toolInput as { questions: AskQuestion[] }).questions,
                askWidget,
              );
              return answers === null
                ? { behavior: 'deny', message: 'The User did not answer.' }
                : Object.keys(answers).length === 0
                  ? { behavior: 'deny', message: 'The User skipped this.' }
                  : {
                      behavior: 'allow',
                      updatedInput: { ...toolInput, answers },
                    };
            }
            const proposed = allowRules(suggestions);
            const answer = await askPermission({
              toolName,
              input: toolInput,
              rules: proposed.flatMap((update) => update.rules.map(ruleString)),
            });
            if (answer === 'deny') {
              return { behavior: 'deny', message: 'The User denied this.' };
            }
            // Saved to the repository's gitignored local settings, never the
            // committed file (ADR 0021).
            return answer === 'allow-always'
              ? {
                  behavior: 'allow',
                  updatedInput: toolInput,
                  updatedPermissions: proposed.map((update) => ({
                    ...update,
                    destination: 'localSettings',
                  })),
                }
              : { behavior: 'allow', updatedInput: toolInput };
          },
          // The run's folder as the literal path: the SDK expands ${PWD} against
          // its own process, not the run's cwd (T1199); the run ID is literal too.
          mcpServers: {
            [widgetServerName]: createWidgetServer(askWidget),
            tandembike: {
              type: 'http',
              url: mcpUrl,
              headers: {
                'X-Tandembike-Cwd': cwd,
                'X-Tandembike-Run': agentRunId,
              },
            },
          },
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
          const text = error instanceof Error ? error.message : String(error);
          onEvent({
            type: 'exit',
            error: text,
            transient: isTransientClaudeError(text),
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
