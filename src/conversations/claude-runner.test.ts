// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunEvent } from './agent-runner';

const { query, controls } = vi.hoisted(() => ({
  query: vi.fn(),
  controls: { interrupt: vi.fn(), close: vi.fn() },
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query }));

import { createClaudeRunner, eventsOf } from './claude-runner';

/** A `Query` that yields `messages`, then ends. */
function fakeQuery(messages: unknown[]) {
  return Object.assign(
    (async function* () {
      yield* messages;
    })(),
    controls,
  );
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  query.mockReset();
  controls.interrupt.mockReset();
  controls.close.mockReset();
});

describe('The Claude runner', () => {
  it('starts query() in the repository path with the Tandembike MCP server and the Agent’s own prompt plus ours', () => {
    query.mockReturnValue(fakeQuery([]));

    createClaudeRunner().start({
      cwd: '/repo',
      mcpUrl: 'http://localhost:4747/api/mcp',
      systemPrompt: 'Your situation.',
      prompt: 'Hi',
      resume: 'sess-1',
      askPermission: async () => 'deny',
      askQuestion: async () => ({}),
      onEvent: () => {},
    });

    const { options } = query.mock.calls[0][0];
    expect(options).toMatchObject({
      cwd: '/repo',
      resume: 'sess-1',
      mcpServers: {
        tandembike: { type: 'http', url: 'http://localhost:4747/api/mcp' },
      },
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: 'Your situation.',
      },
    });
    expect(options.permissionMode).toBeUndefined();
  });

  it('feeds the first message and every later reply into the streaming input', async () => {
    query.mockReturnValue(fakeQuery([]));
    const run = createClaudeRunner().start({
      cwd: '/repo',
      mcpUrl: 'http://x',
      systemPrompt: '',
      prompt: 'First',
      askPermission: async () => 'deny',
      askQuestion: async () => ({}),
      onEvent: () => {},
    });
    const input: AsyncIterator<{ message: { content: string } }> =
      query.mock.calls[0][0].prompt[Symbol.asyncIterator]();

    run.send('Second');

    expect((await input.next()).value?.message.content).toBe('First');
    expect((await input.next()).value?.message.content).toBe('Second');
  });

  it('turns SDK messages into run events and ends with an exit', async () => {
    query.mockReturnValue(
      fakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-9' },
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'thinking', thinking: 'hmm' },
              { type: 'text', text: 'Looking.' },
              { type: 'tool_use', name: 'Read', input: { file_path: 'a.md' } },
            ],
          },
        },
        { type: 'user', message: { content: [] } },
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'Done',
          total_cost_usd: 0.42,
        },
        {
          type: 'result',
          subtype: 'error_max_turns',
          is_error: true,
          total_cost_usd: 0.5,
        },
      ]),
    );
    const events: RunEvent[] = [];

    createClaudeRunner().start({
      cwd: '/repo',
      mcpUrl: 'http://x',
      systemPrompt: '',
      prompt: 'Hi',
      askPermission: async () => 'deny',
      askQuestion: async () => ({}),
      onEvent: (event) => events.push(event),
    });
    await settle();

    expect(events).toEqual([
      { type: 'session', sessionId: 'sess-9' },
      { type: 'agent', text: 'Looking.' },
      { type: 'tool', text: 'Read {"file_path":"a.md"}' },
      { type: 'turn', costUsd: 0.42 },
      { type: 'turn', costUsd: 0.5, error: 'error_max_turns' },
      { type: 'exit' },
    ]);
  });

  it('reports a failing query as an exit with the reason', async () => {
    query.mockReturnValue(
      Object.assign(
        (async function* () {
          yield* [];
          throw new Error('boom');
        })(),
        controls,
      ),
    );
    const events: RunEvent[] = [];

    createClaudeRunner().start({
      cwd: '/repo',
      mcpUrl: 'http://x',
      systemPrompt: '',
      prompt: 'Hi',
      askPermission: async () => 'deny',
      askQuestion: async () => ({}),
      onEvent: (event) => events.push(event),
    });
    await settle();

    expect(events).toEqual([{ type: 'exit', error: 'boom' }]);
  });

  it('interrupts and closes the query', async () => {
    query.mockReturnValue(fakeQuery([]));
    const run = createClaudeRunner().start({
      cwd: '/repo',
      mcpUrl: 'http://x',
      systemPrompt: '',
      prompt: 'Hi',
      askPermission: async () => 'deny',
      askQuestion: async () => ({}),
      onEvent: () => {},
    });

    await run.interrupt();
    run.close();

    expect(controls.interrupt).toHaveBeenCalled();
    expect(controls.close).toHaveBeenCalled();
  });

  it('relays the SDK permission callback to askPermission and maps the answer', async () => {
    query.mockReturnValue(fakeQuery([]));
    const askPermission = vi
      .fn()
      .mockResolvedValueOnce('allow')
      .mockResolvedValueOnce('deny');
    createClaudeRunner().start({
      cwd: '/repo',
      mcpUrl: 'http://x',
      systemPrompt: '',
      prompt: 'Hi',
      askPermission,
      askQuestion: async () => ({}),
      onEvent: () => {},
    });
    const { canUseTool } = query.mock.calls[0][0].options;
    const input = { command: 'ls' };

    const allowed = await canUseTool('Bash', input, {});
    const denied = await canUseTool('Bash', input, {});

    expect(askPermission).toHaveBeenCalledWith({ toolName: 'Bash', input });
    expect(allowed).toEqual({ behavior: 'allow', updatedInput: input });
    expect(denied).toMatchObject({ behavior: 'deny' });
    expect(denied.message).toBeTruthy();
  });

  describe('AskUserQuestion', () => {
    const askInput = {
      questions: [
        {
          question: 'Which library?',
          header: 'Library',
          multiSelect: false,
          options: [
            { label: 'A', description: 'The first', preview: 'x' },
            { label: 'B', description: 'The second' },
          ],
        },
      ],
    };

    const startWith = (askQuestion: (questions: unknown[]) => unknown) => {
      query.mockReturnValue(fakeQuery([]));
      const askPermission = vi.fn();
      createClaudeRunner().start({
        cwd: '/repo',
        mcpUrl: 'http://x',
        systemPrompt: '',
        prompt: 'Hi',
        askPermission,
        askQuestion: askQuestion as never,
        onEvent: () => {},
      });
      return {
        askPermission,
        canUseTool: query.mock.calls[0][0].options.canUseTool,
      };
    };

    it('routes it to askQuestion, not askPermission, and returns the answers as the tool input', async () => {
      const askQuestion = vi.fn().mockResolvedValue({ 'Which library?': 'A' });
      const { askPermission, canUseTool } = startWith(askQuestion);

      const result = await canUseTool('AskUserQuestion', askInput, {});

      expect(askPermission).not.toHaveBeenCalled();
      expect(askQuestion).toHaveBeenCalledWith([
        {
          question: 'Which library?',
          header: 'Library',
          multiSelect: false,
          options: [
            { label: 'A', description: 'The first' },
            { label: 'B', description: 'The second' },
          ],
        },
      ]);
      expect(result).toEqual({
        behavior: 'allow',
        updatedInput: { ...askInput, answers: { 'Which library?': 'A' } },
      });
    });

    it('denies when nothing was answered', async () => {
      const { canUseTool } = startWith(async () => ({}));

      expect(await canUseTool('AskUserQuestion', askInput, {})).toMatchObject({
        behavior: 'deny',
      });
    });

    it('reports no tool line for the call, as the chat shows a form', () => {
      expect(
        eventsOf({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', name: 'AskUserQuestion', input: askInput },
            ],
          },
        } as never),
      ).toEqual([]);
    });
  });
});
