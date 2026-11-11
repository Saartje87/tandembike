import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentCommands } from '../test/fixtures';
import { noAgentCommands } from '../tickets/agent-commands';
import type { RunEvent, StageInvocation } from './agent-runner';

const { query, controls } = vi.hoisted(() => ({
  query: vi.fn(),
  controls: { interrupt: vi.fn(), close: vi.fn() },
}));

// The in-process server is kept as its options, so a test can call a tool's handler.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query,
  createSdkMcpServer: (options: unknown) => ({ type: 'sdk', options }),
  tool: (
    name: string,
    description: string,
    inputSchema: unknown,
    handler: unknown,
  ) => ({ name, description, inputSchema, handler }),
}));

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
      agentRunId: 'conv-1',
      mcpUrl: 'http://localhost:4747/api/mcp',
      plugins: [{ type: 'local', path: '/app/playbook' }],
      systemPrompt: 'Your situation.',
      message: { text: 'Hi' },
      agentCommands: noAgentCommands,
      resume: 'sess-1',
      askPermission: async () => 'deny',
      askWidget: async () => ({ expired: true }),
      onEvent: () => {},
    });

    const { options } = query.mock.calls[0][0];
    expect(options).toMatchObject({
      cwd: '/repo',
      resume: 'sess-1',
      plugins: [{ type: 'local', path: '/app/playbook' }],
      mcpServers: {
        // The literal folder: the SDK expands ${PWD} against its own process,
        // not the run's cwd (docs/research/mcp-caller-folder.md).
        tandembike: {
          type: 'http',
          url: 'http://localhost:4747/api/mcp',
          headers: {
            'X-Tandembike-Cwd': '/repo',
            'X-Tandembike-Run': 'conv-1',
          },
        },
      },
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: 'Your situation.',
      },
    });
    // A repository's defaultMode must not skip the Allow/Deny relay.
    expect(options.permissionMode).toBe('default');
  });

  it('uses the auto permission mode for an auto run, keeps the pre-allow and the relay, and never bypasses', async () => {
    query.mockReturnValue(fakeQuery([]));
    const askPermission = vi.fn(async () => 'allow' as const);

    createClaudeRunner().start({
      cwd: '/repo',
      agentRunId: 'conv-1',
      mcpUrl: 'http://localhost:4747/api/mcp',
      plugins: [{ type: 'local', path: '/app/playbook' }],
      systemPrompt: 'Your situation.',
      message: { text: 'Hi' },
      agentCommands: noAgentCommands,
      runMode: 'auto',
      askPermission,
      askWidget: async () => ({ expired: true }),
      onEvent: () => {},
    });

    const { options } = query.mock.calls[0][0];
    expect(options.permissionMode).toBe('auto');
    expect(options.allowedTools).toEqual(['mcp__tandembike', 'mcp__widgets']);
    await options.canUseTool(
      'Bash',
      { command: 'ls' },
      { suggestions: [], signal: new AbortController().signal },
    );
    expect(askPermission).toHaveBeenCalled();
  });

  it('passes the model option only when the Project sets one', () => {
    query.mockReturnValue(fakeQuery([]));
    const start = (model?: string) =>
      createClaudeRunner().start({
        cwd: '/repo',
        agentRunId: 'conv-1',
        mcpUrl: 'http://localhost:4747/api/mcp',
        plugins: [{ type: 'local', path: '/app/playbook' }],
        systemPrompt: 'Your situation.',
        message: { text: 'Hi' },
        agentCommands: noAgentCommands,
        runMode: 'default',
        ...(model === undefined ? {} : { model }),
        askPermission: async () => 'deny',
        askWidget: async () => ({ expired: true }),
        onEvent: () => {},
      });

    start('claude-opus-5-5');
    start();

    expect(query.mock.calls[0][0].options.model).toBe('claude-opus-5-5');
    expect(query.mock.calls[1][0].options).not.toHaveProperty('model');
  });

  it('pre-allows the Tandembike and Widget MCP servers it injects, and nothing else', () => {
    query.mockReturnValue(fakeQuery([]));

    createClaudeRunner().start({
      cwd: '/repo',
      agentRunId: 'conv-1',
      mcpUrl: 'http://localhost:4747/api/mcp',
      plugins: [{ type: 'local', path: '/app/playbook' }],
      systemPrompt: '',
      message: { text: 'Hi' },
      agentCommands: noAgentCommands,
      askPermission: async () => 'deny',
      askWidget: async () => ({ expired: true }),
      onEvent: () => {},
    });

    const { options } = query.mock.calls[0][0];
    expect(options.allowedTools).toEqual(['mcp__tandembike', 'mcp__widgets']);
  });

  it('feeds the first message and every later reply into the streaming input', async () => {
    query.mockReturnValue(fakeQuery([]));
    const run = createClaudeRunner().start({
      cwd: '/repo',
      agentRunId: 'conv-1',
      mcpUrl: 'http://x',
      plugins: [],
      systemPrompt: '',
      message: { text: 'First' },
      agentCommands: noAgentCommands,
      askPermission: async () => 'deny',
      askWidget: async () => ({ expired: true }),
      onEvent: () => {},
    });
    const input: AsyncIterator<{ message: { content: string } }> =
      query.mock.calls[0][0].prompt[Symbol.asyncIterator]();

    run.send('Second');

    expect((await input.next()).value?.message.content).toBe('First');
    expect((await input.next()).value?.message.content).toBe('Second');
  });

  it.each<[StageInvocation, string]>([
    [
      { stage: 'start', ticket: { number: 42, type: 'Ticket' } },
      '/tandembike:implement T42',
    ],
    [
      { stage: 'start', ticket: { number: 7, type: 'Epic' } },
      '/tandembike:implement-epic T7',
    ],
    [
      { stage: 'triage', ticket: { number: 42, type: 'Ticket' } },
      '/tandembike:triage T42',
    ],
    [
      { stage: 'spec', ticket: { number: 5, type: 'Ticket' } },
      '/tandembike:spec T5',
    ],
    [
      { stage: 'merge', ticket: { number: 9, type: 'Epic' } },
      '/tandembike:merge T9',
    ],
    [
      { stage: 'retro', cycle: { id: 3, title: 'Beta' } },
      '/tandembike:retro "Beta" (Cycle 3)',
    ],
    [{ stage: 'plan', goal: 'Ship it' }, '/tandembike:plan Ship it'],
    [
      { stage: 'spar', topic: 'Faster triage', focusTicketNumber: 42 },
      '/tandembike:spar "Faster triage" T42',
    ],
    [
      { stage: 'spar', topic: null, focusTicketNumber: null },
      '/tandembike:spar',
    ],
  ])(
    'sends a Stage as its Playbook slash command: %o',
    async (invocation, text) => {
      query.mockReturnValue(fakeQuery([]));
      const runner = createClaudeRunner();
      runner.start({
        cwd: '/repo',
        agentRunId: 'conv-1',
        mcpUrl: 'http://x',
        plugins: [],
        systemPrompt: '',
        message: { invocation },
        agentCommands: noAgentCommands,
        askPermission: async () => 'deny',
        askWidget: async () => ({ expired: true }),
        onEvent: () => {},
      });
      const input: AsyncIterator<{ message: { content: string } }> =
        query.mock.calls[0][0].prompt[Symbol.asyncIterator]();

      expect((await input.next()).value?.message.content).toBe(text);
      expect(runner.invocationText(invocation, noAgentCommands)).toBe(text);
    },
  );

  it("sends the Project's agent command override for a Stage", async () => {
    query.mockReturnValue(fakeQuery([]));
    createClaudeRunner().start({
      cwd: '/repo',
      agentRunId: 'conv-1',
      mcpUrl: 'http://x',
      plugins: [],
      systemPrompt: '',
      message: {
        invocation: { stage: 'start', ticket: { number: 42, type: 'Ticket' } },
      },
      agentCommands: agentCommands({ startCommand: '/ship' }),
      askPermission: async () => 'deny',
      askWidget: async () => ({ expired: true }),
      onEvent: () => {},
    });
    const input: AsyncIterator<{ message: { content: string } }> =
      query.mock.calls[0][0].prompt[Symbol.asyncIterator]();

    expect((await input.next()).value?.message.content).toBe('/ship T42');
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
      agentRunId: 'conv-1',
      mcpUrl: 'http://x',
      plugins: [],
      systemPrompt: '',
      message: { text: 'Hi' },
      agentCommands: noAgentCommands,
      askPermission: async () => 'deny',
      askWidget: async () => ({ expired: true }),
      onEvent: (event) => events.push(event),
    });
    await settle();

    expect(events).toEqual([
      { type: 'session', sessionId: 'sess-9' },
      { type: 'agent', text: 'Looking.' },
      {
        type: 'tool',
        text: 'Read {"file_path":"a.md"}',
        name: 'Read',
        input: { file_path: 'a.md' },
      },
      { type: 'turn', costUsd: 0.42 },
      {
        type: 'turn',
        costUsd: 0.5,
        error: 'error_max_turns',
        errorSubtype: 'error_max_turns',
      },
      { type: 'exit' },
    ]);
  });

  it('reports the tokens per model of a result’s modelUsage with its turn (T1176)', () => {
    const modelUsage = (input: number, output: number) => ({
      inputTokens: input,
      outputTokens: output,
      cacheReadInputTokens: input * 10,
      cacheCreationInputTokens: input * 2,
      webSearchRequests: 0,
      costUSD: 0.1,
      contextWindow: 200000,
      maxOutputTokens: 32000,
    });

    const events = eventsOf({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'Done',
      total_cost_usd: 0.42,
      modelUsage: {
        'claude-opus-5-5': modelUsage(100, 50),
        'claude-haiku-5-5': modelUsage(7, 3),
      },
    } as never);

    expect(events).toEqual([
      {
        type: 'turn',
        costUsd: 0.42,
        usage: {
          'claude-opus-5-5': {
            input: 100,
            output: 50,
            cacheWrite: 200,
            cacheRead: 1000,
          },
          'claude-haiku-5-5': {
            input: 7,
            output: 3,
            cacheWrite: 14,
            cacheRead: 70,
          },
        },
      },
    ]);
  });

  it('reports the Tickets the Agent created from the results of file_tickets', async () => {
    const toolUse = (id: string, name: string) => ({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id, name, input: {} }] },
    });
    const toolResult = (id: string, text: string, isError = false) => ({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: id,
            is_error: isError,
            content: [{ type: 'text', text }],
          },
        ],
      },
    });
    query.mockReturnValue(
      fakeQuery([
        toolUse('a', 'mcp__tandembike__file_tickets'),
        toolResult('a', JSON.stringify({ number: 41, title: 'X' })),
        toolUse('b', 'mcp__tandembike__file_tickets'),
        toolResult('b', JSON.stringify({ numbers: [42, 43] })),
        toolUse('c', 'mcp__tandembike__get_ticket'),
        toolResult('c', JSON.stringify({ number: 7 })),
        toolUse('d', 'mcp__tandembike__file_tickets'),
        toolResult('d', 'Refused.', true),
        toolUse('e', 'mcp__tandembike__file_tickets'),
        toolResult('e', JSON.stringify({ numbers: [44] })),
      ]),
    );
    const events: RunEvent[] = [];

    createClaudeRunner().start({
      cwd: '/repo',
      agentRunId: 'conv-1',
      mcpUrl: 'http://x',
      plugins: [],
      systemPrompt: '',
      message: { text: 'Hi' },
      agentCommands: noAgentCommands,
      askPermission: async () => 'deny',
      askWidget: async () => ({ expired: true }),
      onEvent: (event) => events.push(event),
    });
    await settle();

    expect(events.filter((event) => event.type === 'created')).toEqual([
      { type: 'created', numbers: [41] },
      { type: 'created', numbers: [42, 43] },
      { type: 'created', numbers: [44] },
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
      agentRunId: 'conv-1',
      mcpUrl: 'http://x',
      plugins: [],
      systemPrompt: '',
      message: { text: 'Hi' },
      agentCommands: noAgentCommands,
      askPermission: async () => 'deny',
      askWidget: async () => ({ expired: true }),
      onEvent: (event) => events.push(event),
    });
    await settle();

    expect(events).toEqual([{ type: 'exit', error: 'boom' }]);
  });

  it('interrupts and closes the query', async () => {
    query.mockReturnValue(fakeQuery([]));
    const run = createClaudeRunner().start({
      cwd: '/repo',
      agentRunId: 'conv-1',
      mcpUrl: 'http://x',
      plugins: [],
      systemPrompt: '',
      message: { text: 'Hi' },
      agentCommands: noAgentCommands,
      askPermission: async () => 'deny',
      askWidget: async () => ({ expired: true }),
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
      agentRunId: 'conv-1',
      mcpUrl: 'http://x',
      plugins: [],
      systemPrompt: '',
      message: { text: 'Hi' },
      agentCommands: noAgentCommands,
      askPermission,
      askWidget: async () => ({ expired: true }),
      onEvent: () => {},
    });
    const { canUseTool } = query.mock.calls[0][0].options;
    const input = { command: 'ls' };

    const allowed = await canUseTool('Bash', input, {});
    const denied = await canUseTool('Bash', input, {});

    expect(askPermission).toHaveBeenCalledWith({
      toolName: 'Bash',
      input,
      rules: [],
    });
    expect(allowed).toEqual({ behavior: 'allow', updatedInput: input });
    expect(denied).toMatchObject({ behavior: 'deny' });
    expect(denied.message).toBeTruthy();
  });

  describe('Always allow', () => {
    const input = { command: 'npm run check' };
    const bashRule = {
      type: 'addRules',
      behavior: 'allow',
      destination: 'session',
      rules: [{ toolName: 'Bash', ruleContent: 'npm run check:*' }],
    };

    function canUseTool(answer: string) {
      query.mockReturnValue(fakeQuery([]));
      const askPermission = vi.fn().mockResolvedValue(answer);
      createClaudeRunner().start({
        cwd: '/repo',
        agentRunId: 'conv-1',
        mcpUrl: 'http://x',
        plugins: [],
        systemPrompt: '',
        message: { text: 'Hi' },
        agentCommands: noAgentCommands,
        askPermission,
        askWidget: async () => ({ expired: true }),
        onEvent: () => {},
      });
      return {
        askPermission,
        canUseTool: query.mock.calls[0][0].options.canUseTool,
      };
    }

    it('turns proposed allow rules into rule strings', async () => {
      const { askPermission, canUseTool: can } = canUseTool('allow');

      await can('Bash', input, {
        suggestions: [
          {
            ...bashRule,
            rules: [
              ...bashRule.rules,
              { toolName: 'Read' },
              { toolName: 'mcp__x', ruleContent: '' },
            ],
          },
        ],
      });

      expect(askPermission).toHaveBeenCalledWith({
        toolName: 'Bash',
        input,
        rules: ['Bash(npm run check:*)', 'Read', 'mcp__x'],
      });
    });

    it('drops every suggestion that is not an allow rule', async () => {
      const { askPermission, canUseTool: can } = canUseTool('allow');

      await can('Edit', input, {
        suggestions: [
          { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
          {
            type: 'addDirectories',
            directories: ['/x'],
            destination: 'session',
          },
          { ...bashRule, behavior: 'deny' },
          { ...bashRule, type: 'replaceRules' },
        ],
      });

      expect(askPermission).toHaveBeenCalledWith({
        toolName: 'Edit',
        input,
        rules: [],
      });
    });

    it('saves the rules to the local settings on allow-always, and allows the call', async () => {
      const { canUseTool: can } = canUseTool('allow-always');

      const result = await can('Bash', input, { suggestions: [bashRule] });

      expect(result).toEqual({
        behavior: 'allow',
        updatedInput: input,
        updatedPermissions: [{ ...bashRule, destination: 'localSettings' }],
      });
    });

    it('sends back only the allow rules on allow-always', async () => {
      const { canUseTool: can } = canUseTool('allow-always');

      const result = await can('Bash', input, {
        suggestions: [
          { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
          bashRule,
        ],
      });

      expect(result.updatedPermissions).toEqual([
        { ...bashRule, destination: 'localSettings' },
      ]);
    });

    it('sends no updatedPermissions on allow', async () => {
      const { canUseTool: can } = canUseTool('allow');

      const result = await can('Bash', input, { suggestions: [bashRule] });

      expect(result).toEqual({ behavior: 'allow', updatedInput: input });
    });
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

    const startWith = (askWidget: (widget: unknown) => unknown) => {
      query.mockReturnValue(fakeQuery([]));
      const askPermission = vi.fn();
      createClaudeRunner().start({
        cwd: '/repo',
        agentRunId: 'conv-1',
        mcpUrl: 'http://x',
        plugins: [],
        systemPrompt: '',
        message: { text: 'Hi' },
        agentCommands: noAgentCommands,
        askPermission,
        askWidget: askWidget as never,
        onEvent: () => {},
      });
      return {
        askPermission,
        canUseTool: query.mock.calls[0][0].options.canUseTool,
      };
    };

    it('asks it as a choice Widget, not a permission, and returns the answers as the tool input', async () => {
      const askWidget = vi.fn().mockResolvedValue({ selected: ['A'] });
      const { askPermission, canUseTool } = startWith(askWidget);

      const result = await canUseTool('AskUserQuestion', askInput, {});

      expect(askPermission).not.toHaveBeenCalled();
      expect(askWidget).toHaveBeenCalledWith({
        kind: 'choice',
        prompt: 'Which library?',
        multiSelect: false,
        options: [
          { label: 'A', description: 'The first' },
          { label: 'B', description: 'The second' },
        ],
      });
      expect(result).toEqual({
        behavior: 'allow',
        updatedInput: { ...askInput, answers: { 'Which library?': 'A' } },
      });
    });

    it('asks several questions in turn, with Other as the answer text and a skip left out', async () => {
      const askWidget = vi
        .fn()
        .mockResolvedValueOnce({ selected: ['A', 'B'] })
        .mockResolvedValueOnce({ other: 'My own' })
        .mockResolvedValueOnce({ skipped: true });
      const { canUseTool } = startWith(askWidget);
      const question = askInput.questions[0];
      const input = {
        questions: [
          { ...question, question: 'One?', multiSelect: true },
          { ...question, question: 'Two?' },
          { ...question, question: 'Three?' },
        ],
      };

      const result = await canUseTool('AskUserQuestion', input, {});

      expect(askWidget).toHaveBeenCalledTimes(3);
      expect(result.updatedInput.answers).toEqual({
        'One?': 'A, B',
        'Two?': 'My own',
      });
    });

    it('denies when the run ended before an answer, or every question was skipped', async () => {
      for (const answer of [{ expired: true }, { skipped: true }]) {
        const { canUseTool } = startWith(async () => answer);
        expect(await canUseTool('AskUserQuestion', askInput, {})).toMatchObject(
          { behavior: 'deny' },
        );
        query.mockReset();
      }
    });

    it('reports no tool line for the call, as the chat shows a Widget', () => {
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

  describe('The Widget tools', () => {
    const startWith = (askWidget: (widget: unknown) => unknown) => {
      query.mockReturnValue(fakeQuery([]));
      createClaudeRunner().start({
        cwd: '/repo',
        agentRunId: 'conv-1',
        mcpUrl: 'http://x',
        plugins: [],
        systemPrompt: '',
        message: { text: 'Hi' },
        agentCommands: noAgentCommands,
        askPermission: vi.fn(),
        askWidget: askWidget as never,
        onEvent: () => {},
      });
      const server = query.mock.calls[0][0].options.mcpServers.widgets;
      return (name: string) =>
        server.options.tools.find(
          (tool: { name: string }) => tool.name === name,
        );
    };

    it('serves ask_choice in-process; its handler blocks on askWidget and returns the answer as JSON', async () => {
      let answer: (value: unknown) => void = () => {};
      const askWidget = vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
      const tool = startWith(askWidget)('ask_choice');

      let result: unknown;
      void tool
        .handler({
          prompt: 'Which?',
          options: [{ label: 'A' }, { label: 'B' }],
          recommended: ['B'],
        })
        .then((value: unknown) => {
          result = value;
        });
      await settle();

      expect(askWidget).toHaveBeenCalledWith({
        kind: 'choice',
        prompt: 'Which?',
        options: [{ label: 'A' }, { label: 'B' }],
        multiSelect: false,
        recommended: ['B'],
      });
      expect(result).toBeUndefined();

      answer({ selected: ['B'] });
      await settle();

      expect(result).toEqual({
        content: [{ type: 'text', text: '{"selected":["B"]}' }],
      });
    });

    it.each([
      [
        'ask_rank',
        { prompt: 'Order', items: ['A', 'B'] },
        { kind: 'rank', prompt: 'Order', items: ['A', 'B'] },
      ],
      [
        'ask_scale',
        { prompt: 'How much?', items: ['A'], min: 1, max: 5, maxLabel: 'Lots' },
        {
          kind: 'scale',
          prompt: 'How much?',
          items: ['A'],
          min: 1,
          max: 5,
          maxLabel: 'Lots',
        },
      ],
      [
        'ask_matrix',
        {
          prompt: 'Place',
          items: ['A'],
          xAxis: { low: 'l', high: 'h' },
          yAxis: { low: 'd', high: 'u' },
        },
        {
          kind: 'matrix',
          prompt: 'Place',
          items: ['A'],
          xAxis: { low: 'l', high: 'h' },
          yAxis: { low: 'd', high: 'u' },
        },
      ],
    ])('serves %s, asking its Widget', async (name, input, widget) => {
      const askWidget = vi.fn(async () => ({ skipped: true }));
      const tool = startWith(askWidget)(name);

      const result = await tool.handler(input);

      expect(askWidget).toHaveBeenCalledWith(widget);
      expect(result.content[0].text).toBe('{"skipped":true}');
    });

    it('reports no tool line for a Widget tool call', () => {
      expect(
        eventsOf({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'mcp__widgets__ask_choice',
                input: {},
              },
            ],
          },
        } as never),
      ).toEqual([]);
    });
  });

  it('reports the model of the SDK init message with the session', () => {
    expect(
      eventsOf({
        type: 'system',
        subtype: 'init',
        session_id: 'sess-1',
        model: 'claude-opus-5',
      } as never),
    ).toEqual([
      { type: 'session', sessionId: 'sess-1', model: 'claude-opus-5' },
    ]);
  });
});
