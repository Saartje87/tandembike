import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notMeasuredModel } from '../footprint/footprint';
import { agentCommands } from '../test/fixtures';
import { noAgentCommands } from '../tickets/agent-commands';
import type {
  PermissionRequest,
  RunEvent,
  RunOptions,
  StageInvocation,
} from './agent-runner';
import type { Widget } from './widget';

type Handler = (event: { type: string; data: Record<string, unknown> }) => void;

/** A Copilot session as the runner sees it: what it was sent, and its config. */
type FakeSession = {
  sessionId: string;
  config: Record<string, unknown>;
  sent: unknown[];
  aborted: number;
  disconnected: boolean;
  modes: string[];
  rpc: {
    permissions: {
      getCapabilities(): Promise<{
        assistedApproval: boolean;
        bypassPermissions: boolean;
      }>;
      setMode(request: { mode: string }): Promise<{ success: boolean }>;
    };
  };
  send(message: unknown): Promise<string>;
  abort(): Promise<void>;
  disconnect(): Promise<void>;
  /** Makes the session report an event, as Copilot would. */
  emit(type: string, data?: Record<string, unknown>): void;
};

const sdk = vi.hoisted(() => ({
  imported: 0,
  started: 0,
  auth: {
    isAuthenticated: true,
    authType: 'gh-cli',
    login: 'octo',
  } as Record<string, unknown>,
  startError: null as Error | null,
  createError: null as Error | null,
  sessions: [] as FakeSession[],
  resumed: [] as string[],
  assisted: true,
}));

vi.mock('@github/copilot-sdk', () => {
  sdk.imported += 1;
  const sessionOf = (
    sessionId: string,
    config: Record<string, unknown>,
  ): FakeSession => {
    const session: FakeSession = {
      sessionId,
      config,
      sent: [],
      aborted: 0,
      disconnected: false,
      modes: [],
      rpc: {
        permissions: {
          async getCapabilities() {
            return { assistedApproval: sdk.assisted, bypassPermissions: true };
          },
          async setMode({ mode }) {
            session.modes.push(mode);
            return { success: true };
          },
        },
      },
      async send(message) {
        session.sent.push(message);
        return 'message-id';
      },
      async abort() {
        session.aborted += 1;
      },
      async disconnect() {
        session.disconnected = true;
      },
      emit(type, data = {}) {
        (config.onEvent as Handler)({ type, data });
      },
    };
    sdk.sessions.push(session);
    return session;
  };
  return {
    CopilotClient: class {
      async start() {
        if (sdk.startError) {
          throw sdk.startError;
        }
        sdk.started += 1;
      }
      async getAuthStatus() {
        return sdk.auth;
      }
      async createSession(config: Record<string, unknown>) {
        if (sdk.createError) {
          throw sdk.createError;
        }
        return sessionOf(`copilot-${sdk.sessions.length + 1}`, config);
      }
      async resumeSession(id: string, config: Record<string, unknown>) {
        sdk.resumed.push(id);
        return sessionOf(id, config);
      }
    },
  };
});

import { createCopilotRunner } from './copilot-runner';
import { copilotToolFilters } from './copilot-tool-policy';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  sdk.started = 0;
  sdk.auth = { isAuthenticated: true, authType: 'gh-cli', login: 'octo' };
  sdk.startError = null;
  sdk.createError = null;
  sdk.sessions = [];
  sdk.resumed = [];
  sdk.assisted = true;
});

function startRun(overrides: Partial<RunOptions> = {}) {
  const events: RunEvent[] = [];
  const runner = createCopilotRunner();
  const run = runner.start({
    cwd: '/repo/worktree',
    agentRunId: '42',
    mcpUrl: 'http://localhost:4747/api/mcp',
    plugins: [{ type: 'local', path: '/app/playbook' }],
    systemPrompt: 'Your situation.',
    message: { text: 'Hi' },
    agentCommands: noAgentCommands,
    askPermission: async () => 'deny',
    askWidget: async () => ({ expired: true }),
    onEvent: (event) => events.push(event),
    ...overrides,
  });
  return { runner, run, events };
}

describe('The Copilot runner', () => {
  it('imports the Copilot SDK only when a run starts or asks whether it can run', async () => {
    const before = sdk.imported;
    const runner = createCopilotRunner();
    expect(runner.capabilities.costUnit).toBe('ai_credits');
    expect(runner.invocationText).toBeTypeOf('function');
    await settle();
    expect(sdk.imported).toBe(before);
  });

  it("starts a session in the run's folder with Tandembike's MCP server, its headers and the brief appended", async () => {
    startRun();
    await settle();

    const [session] = sdk.sessions;
    expect(session.config).toMatchObject({
      workingDirectory: '/repo/worktree',
      mcpServers: {
        tandembike: {
          type: 'http',
          url: 'http://localhost:4747/api/mcp',
          headers: {
            'X-Tandembike-Cwd': '/repo/worktree',
            'X-Tandembike-Run': '42',
          },
          tools: ['*'],
        },
      },
      systemMessage: { mode: 'append', content: 'Your situation.' },
      // Copilot's own GitHub server, autopilot and co-author trailer are off
      // (ADR 0051).
      disabledMcpServers: ['github-mcp-server'],
      autopilot: { continuationEnabled: false },
      coauthorEnabled: false,
    });
    expect(session.config.model).toBeUndefined();
    expect(session.sent).toEqual(['Hi']);
  });

  it('starts on the model for the run when one is set', async () => {
    startRun({ model: 'gpt-5.5' });
    await settle();

    expect(sdk.sessions[0].config.model).toBe('gpt-5.5');
  });

  it('reports the session it started, so a later reply resumes it', async () => {
    const { events } = startRun();
    await settle();

    expect(events).toContainEqual({ type: 'session', sessionId: 'copilot-1' });
  });

  it("enqueues the User's replies into the running session, also before it is ready", async () => {
    const { run } = startRun();
    run.send('Early');
    await settle();
    run.send('Go on');
    await settle();

    expect(sdk.sessions[0].sent).toEqual([
      'Hi',
      { prompt: 'Early', mode: 'enqueue' },
      { prompt: 'Go on', mode: 'enqueue' },
    ]);
  });

  it('resumes the stored session of an interrupted Conversation instead of creating one', async () => {
    const { events } = startRun({
      resume: 'copilot-old',
      message: { text: 'Back' },
    });
    await settle();

    expect(sdk.resumed).toEqual(['copilot-old']);
    expect(sdk.sessions[0].config.workingDirectory).toBe('/repo/worktree');
    expect(sdk.sessions[0].sent).toEqual(['Back']);
    expect(events).toContainEqual({
      type: 'session',
      sessionId: 'copilot-old',
    });
  });

  it('aborts the running turn on Stop', async () => {
    const { run } = startRun();
    await settle();

    await run.interrupt();

    expect(sdk.sessions[0].aborted).toBe(1);
  });

  it('disconnects the session on close and reports the exit once', async () => {
    const { run, events } = startRun();
    await settle();

    run.close();
    run.close();
    await settle();

    expect(sdk.sessions[0].disconnected).toBe(true);
    expect(events.filter(({ type }) => type === 'exit')).toEqual([
      { type: 'exit' },
    ]);
  });

  it('reports an exit with the reason when no session could start, transient for a network error', async () => {
    sdk.createError = new Error('fetch failed');
    const { events } = startRun();
    await settle();

    expect(events).toEqual([
      { type: 'exit', error: 'fetch failed', transient: true },
    ]);
  });

  describe('the Playbook (ADR 0051)', () => {
    it('loads the Playbook as a plugin, so its namespaced commands run', async () => {
      startRun();
      await settle();

      expect(sdk.sessions[0].config.pluginDirectories).toEqual([
        '/app/playbook',
      ]);
    });

    it.each<[StageInvocation, string]>([
      [
        { stage: 'start', ticket: { number: 42, type: 'Ticket' } },
        '/tandembike:implement T42',
      ],
      [
        { stage: 'start', ticket: { number: 42, type: 'Epic' } },
        '/tandembike:implement-epic T42',
      ],
      [
        { stage: 'triage', ticket: { number: 7, type: 'Ticket' } },
        '/tandembike:triage T7',
      ],
      [
        { stage: 'spec', ticket: { number: 5, type: 'Ticket' } },
        '/tandembike:spec T5',
      ],
      [
        { stage: 'merge', ticket: { number: 9, type: 'Ticket' } },
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
    ])(
      "sends a Stage as the Playbook's command, whatever the Project's overrides: %o",
      async (invocation, text) => {
        const { runner } = startRun({
          message: { invocation },
          agentCommands: agentCommands({
            startCommand: '/ship',
            startEpicCommand: '/ship-epic',
            triageCommand: '/sort',
            specCommand: '/spec-it',
            mergeCommand: '/land',
            retroCommand: '/look-back',
            planCommand: '/plan-it',
            sparCommand: '/think',
          }),
        });
        await settle();

        expect(sdk.sessions[0].sent).toEqual([text]);
        expect(runner.invocationText(invocation, agentCommands())).toBe(text);
      },
    );
  });

  describe('the Widget tools (ADR 0045)', () => {
    type FakeTool = {
      name: string;
      description: string;
      skipPermission: boolean;
      handler(args: unknown): Promise<unknown>;
    };
    const toolsOf = async (askWidget: RunOptions['askWidget']) => {
      startRun({ askWidget });
      await settle();
      return sdk.sessions[0].config.tools as FakeTool[];
    };

    it('serves ask_choice, ask_rank, ask_matrix and ask_scale as tools that need no permission', async () => {
      const tools = await toolsOf(async () => ({ expired: true }));

      expect(tools.map(({ name }) => name).sort()).toEqual([
        'ask_choice',
        'ask_matrix',
        'ask_rank',
        'ask_scale',
      ]);
      expect(tools.every(({ skipPermission }) => skipPermission)).toBe(true);
      expect(tools.every(({ description }) => description !== '')).toBe(true);
    });

    it("asks the User the Widget and answers the tool with the User's answer as JSON", async () => {
      const asked: Widget[] = [];
      const tools = await toolsOf(async (widget) => {
        asked.push(widget);
        return { selected: ['B'] };
      });
      const choice = tools.find(({ name }) => name === 'ask_choice');

      const result = await choice?.handler({
        prompt: 'Which?',
        options: [{ label: 'A' }, { label: 'B' }],
      });

      expect(asked).toEqual([
        {
          kind: 'choice',
          prompt: 'Which?',
          options: [{ label: 'A' }, { label: 'B' }],
          multiSelect: false,
        },
      ]);
      expect(result).toBe('{"selected":["B"]}');
    });

    it('refuses input that does not fit the tool, without asking the User', async () => {
      const askWidget = vi.fn(async () => ({ expired: true }) as const);
      const tools = await toolsOf(askWidget);
      const choice = tools.find(({ name }) => name === 'ask_choice');

      const result = await choice?.handler({ prompt: 'Which?', options: [] });

      expect(askWidget).not.toHaveBeenCalled();
      expect(result).toMatchObject({ resultType: 'failure' });
    });
  });

  describe('maps session events to run events', () => {
    async function emitting() {
      const started = startRun();
      await settle();
      started.events.length = 0;
      return { ...started, session: sdk.sessions[0] };
    }

    it("reports the model Copilot runs on, from the session's start or a model change", async () => {
      const { session, events } = await emitting();

      session.emit('session.start', {
        sessionId: 'copilot-1',
        selectedModel: 'claude-sonnet-5.5',
      });
      session.emit('session.model_change', { newModel: 'gpt-5.5' });

      expect(events).toEqual([
        { type: 'session', sessionId: 'copilot-1', model: 'claude-sonnet-5.5' },
        { type: 'session', sessionId: 'copilot-1', model: 'gpt-5.5' },
      ]);
    });

    it('reports the assistant’s text, but not empty text or a subagent’s', async () => {
      const { session, events } = await emitting();

      session.emit('assistant.message', { messageId: 'm1', content: 'Done.' });
      session.emit('assistant.message', { messageId: 'm2', content: '  ' });
      session.emit('assistant.message', {
        messageId: 'm3',
        content: 'Inner',
        parentToolCallId: 't0',
      });

      expect(events).toEqual([{ type: 'agent', text: 'Done.' }]);
    });

    it("reports a built-in tool call with the status line's verb", async () => {
      const { session, events } = await emitting();

      session.emit('tool.execution_start', {
        toolCallId: 't1',
        toolName: 'view',
        arguments: { path: '/repo/worktree/src/app.ts' },
      });
      session.emit('tool.execution_start', {
        toolCallId: 't2',
        toolName: 'bash',
        arguments: { command: 'npm test', description: 'Run the tests' },
      });

      expect(events).toEqual([
        {
          type: 'tool',
          text: 'view {"path":"/repo/worktree/src/app.ts"}',
          name: 'view',
          input: { path: '/repo/worktree/src/app.ts' },
          activity: { verb: 'Reading', target: 'app.ts' },
        },
        {
          type: 'tool',
          text: 'bash {"command":"npm test","description":"Run the tests"}',
          name: 'bash',
          input: { command: 'npm test', description: 'Run the tests' },
          activity: { verb: 'Running', target: 'Run the tests' },
        },
      ]);
    });

    it('reports a Tandembike tool call by its own name, with its Ticket', async () => {
      const { session, events } = await emitting();

      session.emit('tool.execution_start', {
        toolCallId: 't1',
        toolName: 'tandembike-start_work',
        mcpServerName: 'tandembike',
        mcpToolName: 'start_work',
        arguments: { number: 7 },
      });

      expect(events).toEqual([
        expect.objectContaining({
          type: 'tool',
          name: 'tandembike-start_work',
          activity: { tandembike: 'start_work', ticketNumber: 7 },
        }),
      ]);
    });

    it('reports the Tickets a successful file_tickets call created, and nothing for a failed one', async () => {
      const { session, events } = await emitting();
      const fileTickets = (toolCallId: string) =>
        session.emit('tool.execution_start', {
          toolCallId,
          toolName: 'tandembike-file_tickets',
          mcpServerName: 'tandembike',
          mcpToolName: 'file_tickets',
          arguments: { tickets: [] },
        });

      fileTickets('t1');
      fileTickets('t2');
      session.emit('tool.execution_complete', {
        toolCallId: 't1',
        success: true,
        result: { content: '{"numbers":[12,13]}' },
      });
      session.emit('tool.execution_complete', {
        toolCallId: 't2',
        success: false,
        error: { message: 'Refused' },
      });

      expect(events.filter(({ type }) => type !== 'tool')).toEqual([
        { type: 'created', numbers: [12, 13] },
      ]);
    });

    it('ends a turn when the session goes idle', async () => {
      const { session, events } = await emitting();

      session.emit('session.idle', {});

      expect(events).toEqual([{ type: 'turn', cost: 0 }]);
    });

    it("ends each turn with the run's AI credits so far, from Copilot's nano-AIU", async () => {
      const { session, events } = await emitting();

      session.emit('assistant.usage', {
        model: 'claude-sonnet-5.5',
        copilotUsage: { totalNanoAiu: 4_500_000_000 },
      });
      session.emit('assistant.usage', {
        model: 'claude-sonnet-5.5',
        copilotUsage: { totalNanoAiu: 3_300_000_000 },
      });
      session.emit('session.idle', {});
      session.emit('assistant.usage', { model: 'gpt-5.5' });
      session.emit('assistant.usage', {
        model: 'gpt-5.5',
        copilotUsage: { totalNanoAiu: 5_000_000_000 },
      });
      session.emit('session.idle', {});

      expect(events).toEqual([
        expect.objectContaining({ type: 'turn', cost: 7.8 }),
        expect.objectContaining({ type: 'turn', cost: 12.8 }),
      ]);
    });

    it("ends each turn with the run's tokens per model, a model with no Claude tier kept apart as not measured", async () => {
      const { session, events } = await emitting();

      session.emit('assistant.usage', {
        model: 'claude-sonnet-5.5',
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 300,
        cacheWriteTokens: 40,
      });
      session.emit('assistant.usage', {
        model: 'claude-sonnet-5.5',
        inputTokens: 10,
        outputTokens: 2,
      });
      session.emit('assistant.usage', {
        model: 'gpt-5.5',
        inputTokens: 50,
        outputTokens: 5,
      });
      session.emit('session.idle', {});

      expect(events).toEqual([
        {
          type: 'turn',
          cost: 0,
          usage: {
            'claude-sonnet-5.5': {
              input: 110,
              output: 22,
              cacheRead: 300,
              cacheWrite: 40,
            },
            [notMeasuredModel('gpt-5.5')]: {
              input: 50,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
            },
          },
        },
      ]);
    });

    it('ends the turn with the error Copilot reported, transient for a rate limit or server error', async () => {
      const { session, events } = await emitting();

      session.emit('session.error', {
        errorType: 'rate_limit',
        message: 'Rate limited',
      });
      session.emit('session.idle', {});
      session.emit('session.error', {
        errorType: 'authorization',
        message: 'Not allowed',
        statusCode: 403,
      });
      session.emit('session.idle', {});
      session.emit('session.idle', {});

      expect(events).toEqual([
        { type: 'turn', cost: 0, error: 'Rate limited', transient: true },
        { type: 'turn', cost: 0, error: 'Not allowed', transient: false },
        { type: 'turn', cost: 0 },
      ]);
    });
  });

  describe('relays permission requests to the User', () => {
    it('asks Allow or Deny for a shell command, and approves once when allowed', async () => {
      const askPermission = vi.fn(async () => 'allow' as const);
      startRun({ askPermission });
      await settle();

      const handler = sdk.sessions[0].config.onPermissionRequest as (
        request: unknown,
        invocation: unknown,
      ) => Promise<unknown>;
      const result = await handler(
        {
          kind: 'shell',
          fullCommandText: 'touch a.txt',
          intention: 'Create a file',
          commands: [{ identifier: 'touch', readOnly: false }],
          canOfferSessionApproval: true,
        },
        { sessionId: 'copilot-1' },
      );

      expect(askPermission).toHaveBeenCalledWith({
        toolName: 'shell',
        input: { command: 'touch a.txt', intention: 'Create a file' },
        rules: ['shell(touch)'],
      });
      expect(result).toEqual({ kind: 'approve-once' });
    });

    it('rejects when the User denies', async () => {
      startRun({ askPermission: async () => 'deny' });
      await settle();

      const handler = sdk.sessions[0].config.onPermissionRequest as (
        request: unknown,
        invocation: unknown,
      ) => Promise<unknown>;
      const result = await handler(
        { kind: 'write', fileName: 'a.ts', intention: 'Edit', diff: '+x' },
        { sessionId: 'copilot-1' },
      );

      expect(result).toEqual({
        kind: 'reject',
        feedback: 'The User denied this.',
      });
    });

    it('names an MCP tool request by its server and tool, with its arguments', async () => {
      const askPermission = vi.fn(async () => 'allow' as const);
      startRun({ askPermission });
      await settle();

      const handler = sdk.sessions[0].config.onPermissionRequest as (
        request: unknown,
        invocation: unknown,
      ) => Promise<unknown>;
      await handler(
        {
          kind: 'mcp',
          serverName: 'tandembike',
          toolName: 'start_work',
          toolTitle: 'Start work',
          readOnly: false,
          args: { number: 7 },
        },
        { sessionId: 'copilot-1' },
      );

      expect(askPermission).toHaveBeenCalledWith({
        toolName: 'tandembike-start_work',
        input: { number: 7 },
        rules: ['tandembike-start_work'],
      });
    });
  });

  describe('run modes (ADR 0051)', () => {
    type Handler = (request: unknown, invocation: unknown) => Promise<unknown>;
    const handlerOf = (session: FakeSession) =>
      session.config.onPermissionRequest as Handler;
    const shell = {
      kind: 'shell',
      fullCommandText: 'npm test',
      intention: 'Run the tests',
      commands: [{ identifier: 'npm', readOnly: false }],
      canOfferSessionApproval: true,
    };
    const judged = (recommendation: 'approve' | 'requireApproval') => ({
      sessionId: 'copilot-1',
      assistedApprovalAssessment: { status: 'completed', recommendation },
    });

    it('starts in manual mode with autopilot off, never allow-all', async () => {
      startRun();
      await settle();

      expect(sdk.sessions[0].config).toMatchObject({
        permissionMode: 'manual',
        autopilot: { continuationEnabled: false },
      });
      expect(sdk.sessions[0].modes).toEqual([]);
    });

    it('turns on Assisted permissions for an auto run, and approves what the judge approves without asking', async () => {
      const askPermission = vi.fn(async () => 'deny' as const);
      startRun({ runMode: 'auto', askPermission });
      await settle();
      const [session] = sdk.sessions;

      const approved = await handlerOf(session)(shell, judged('approve'));

      expect(session.modes).toEqual(['assisted']);
      expect(approved).toEqual({ kind: 'approve-once' });
      expect(askPermission).not.toHaveBeenCalled();
    });

    it('asks the User about what the judge does not approve, or what managed policy reserves for a person', async () => {
      const askPermission = vi.fn(async () => 'allow' as const);
      startRun({ runMode: 'auto', askPermission });
      await settle();
      const handler = handlerOf(sdk.sessions[0]);

      await handler(shell, judged('requireApproval'));
      await handler(
        { ...shell, managedApprovalRequired: true },
        judged('approve'),
      );
      await handler(shell, { sessionId: 'copilot-1' });

      expect(askPermission).toHaveBeenCalledTimes(3);
    });

    it('never approves by the judge in a default run', async () => {
      const askPermission = vi.fn(async () => 'deny' as const);
      startRun({ askPermission });
      await settle();

      await handlerOf(sdk.sessions[0])(shell, judged('approve'));

      expect(askPermission).toHaveBeenCalledTimes(1);
    });

    it('runs an auto run in default mode, says so, and declares default only once Copilot has no Assisted permissions', async () => {
      sdk.assisted = false;
      const { runner, events } = startRun({ runMode: 'auto' });
      expect(runner.capabilities.runModes).toEqual(['default', 'auto']);
      await settle();

      expect(sdk.sessions[0].modes).toEqual([]);
      expect(events).toContainEqual({
        type: 'runMode',
        wanted: 'auto',
        runMode: 'default',
      });
      expect(runner.capabilities.runModes).toEqual(['default']);
    });
  });

  describe('Allow-always (ADR 0051)', () => {
    type Handler = (request: unknown, invocation: unknown) => Promise<unknown>;
    const ask = async (request: unknown) => {
      const askPermission = vi.fn(
        async (_request: PermissionRequest) => 'allow-always' as const,
      );
      startRun({ askPermission });
      await settle();
      const handler = (sdk.sessions.at(-1) as FakeSession).config
        .onPermissionRequest as Handler;
      const result = await handler(request, { sessionId: 'copilot-1' });
      return { result, asked: askPermission.mock.calls[0][0] };
    };

    it('is declared, since Copilot can approve for the rest of the session', () => {
      expect(createCopilotRunner().capabilities.allowAlways).toBe(true);
    });

    it("offers a shell command's commands for the session, and approves them for it", async () => {
      const { result, asked } = await ask({
        kind: 'shell',
        fullCommandText: 'touch a && touch b',
        intention: 'Create files',
        commands: [
          { identifier: 'touch', readOnly: false },
          { identifier: 'touch', readOnly: false },
        ],
        canOfferSessionApproval: true,
      });

      expect(asked.rules).toEqual(['shell(touch)']);
      expect(result).toEqual({
        kind: 'approve-for-session',
        approval: { kind: 'commands', commandIdentifiers: ['touch'] },
      });
    });

    it('offers file writes and an MCP tool for the session', async () => {
      const write = await ask({
        kind: 'write',
        fileName: 'a.ts',
        intention: 'Edit',
        diff: '+x',
        canOfferSessionApproval: true,
      });
      const mcp = await ask({
        kind: 'mcp',
        serverName: 'tandembike',
        toolName: 'add_note',
        toolTitle: 'Add note',
        readOnly: false,
      });

      expect(write.asked.rules).toEqual(['write']);
      expect(write.result).toEqual({
        kind: 'approve-for-session',
        approval: { kind: 'write' },
      });
      expect(mcp.asked.rules).toEqual(['tandembike-add_note']);
      expect(mcp.result).toEqual({
        kind: 'approve-for-session',
        approval: {
          kind: 'mcp',
          serverName: 'tandembike',
          toolName: 'add_note',
        },
      });
    });

    it('offers nothing for the session where Copilot cannot approve for it', async () => {
      const shell = await ask({
        kind: 'shell',
        fullCommandText: 'rm -rf x',
        intention: 'Remove',
        commands: [{ identifier: 'rm', readOnly: false }],
        canOfferSessionApproval: false,
      });
      const url = await ask({
        kind: 'url',
        url: 'https://x',
        intention: 'Fetch',
      });

      expect(shell.asked.rules).toEqual([]);
      expect(url.asked.rules).toEqual([]);
    });
  });

  describe("Copilot's questions", () => {
    type InputHandler = (
      request: unknown,
      invocation: unknown,
    ) => Promise<{ answer: string; wasFreeform: boolean }>;
    const asking = async (
      answer: Awaited<ReturnType<RunOptions['askWidget']>>,
    ) => {
      const asked: Widget[] = [];
      startRun({
        askWidget: async (widget) => {
          asked.push(widget);
          return answer;
        },
      });
      await settle();
      const handler = (sdk.sessions.at(-1) as FakeSession).config
        .onUserInputRequest as InputHandler;
      return { handler, asked };
    };

    it('asks a question with a button per choice, and answers with the one picked', async () => {
      const { handler, asked } = await asking({ selected: ['Yes'] });

      const answer = await handler(
        { question: 'Go on?', choices: ['Yes', 'No'] },
        { sessionId: 'copilot-1' },
      );

      expect(asked).toEqual([
        {
          kind: 'choice',
          prompt: 'Go on?',
          options: [{ label: 'Yes' }, { label: 'No' }],
          multiSelect: false,
        },
      ]);
      expect(answer).toEqual({ answer: 'Yes', wasFreeform: false });
    });

    it('answers with the text the User typed instead', async () => {
      const { handler } = await asking({ other: 'Only the tests' });

      expect(
        await handler({ question: 'What next?' }, { sessionId: 'copilot-1' }),
      ).toEqual({ answer: 'Only the tests', wasFreeform: true });
    });

    it('says the User skipped it, and fails the request once the run ended unanswered', async () => {
      const skipped = await asking({ skipped: true });
      expect(
        await skipped.handler({ question: 'Why?' }, { sessionId: 'copilot-1' }),
      ).toEqual({
        answer: 'The User skipped this question.',
        wasFreeform: true,
      });

      const expired = await asking({ expired: true });
      await expect(
        expired.handler({ question: 'Why?' }, { sessionId: 'copilot-1' }),
      ).rejects.toThrow('The User did not answer.');
    });
  });

  describe('tool policy (ADR 0046, ADR 0051)', () => {
    it('gives a read-only run only reading tools, the Widgets and MCP, without the writing Tandembike tools', async () => {
      startRun({ toolPolicy: 'read-only' });
      await settle();

      const { availableTools, excludedTools } = sdk.sessions[0].config as {
        availableTools: string[];
        excludedTools: string[];
      };
      expect(availableTools).toEqual(
        expect.arrayContaining(['builtin:view', 'mcp:*', 'custom:*']),
      );
      expect(availableTools).not.toContain('builtin:edit');
      expect(availableTools).not.toContain('builtin:create');
      expect(excludedTools).toEqual(
        expect.arrayContaining([
          'mcp:tandembike-file_tickets',
          'mcp:tandembike-update_ticket',
          'mcp:tandembike-add_note',
        ]),
      );
    });

    it('keeps an Autopilot Triage run from creating or changing Tickets, and nothing else', () => {
      expect(copilotToolFilters('no-ticket-writes')).toEqual({
        excludedTools: [
          'mcp:tandembike-update_ticket',
          'mcp:tandembike-file_tickets',
        ],
      });
    });

    it('leaves a run without a policy unfiltered', async () => {
      startRun();
      await settle();

      expect(sdk.sessions[0].config).not.toHaveProperty('availableTools');
      expect(sdk.sessions[0].config).not.toHaveProperty('excludedTools');
    });
  });

  describe('availability', () => {
    it('can run when Copilot says the User is signed in, and stores no token', async () => {
      const runner = createCopilotRunner();

      expect(await runner.checkAvailability?.()).toEqual({ available: true });
      expect(runner.availability()).toEqual({ available: true });
    });

    it('cannot run when the User is not signed in, with the reason', async () => {
      sdk.auth = { isAuthenticated: false, statusMessage: 'Not authenticated' };
      const runner = createCopilotRunner();

      const availability = await runner.checkAvailability?.();

      expect(availability).toEqual({
        available: false,
        reason: expect.stringContaining('not signed in'),
      });
      expect(runner.availability()).toEqual(availability);
    });

    it('cannot run when the runtime does not start, with the reason', async () => {
      sdk.startError = new Error(
        'Could not resolve @github/copilot-sdk-darwin-arm64.',
      );
      const runner = createCopilotRunner();

      expect(await runner.checkAvailability?.()).toEqual({
        available: false,
        reason: expect.stringContaining(
          'Could not resolve @github/copilot-sdk-darwin-arm64.',
        ),
      });
    });

    it('says it is checking until the first answer, then keeps it briefly', async () => {
      let now = 0;
      const runner = createCopilotRunner({ clock: () => now });

      expect(runner.availability()).toEqual({
        available: false,
        reason: expect.stringContaining('Checking'),
      });
      await settle();
      expect(runner.availability()).toEqual({ available: true });

      sdk.auth = { isAuthenticated: false };
      now += 10_000;
      await runner.checkAvailability?.();
      expect(runner.availability()).toEqual({ available: true });

      now += 60_000;
      expect(await runner.checkAvailability?.()).toMatchObject({
        available: false,
      });
    });
  });
});
