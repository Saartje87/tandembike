import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { handleMcpRequest, type ToolCallHook } from '../mcp/mcp-server';
import type { Tickets } from '../tickets/tickets';

/**
 * A real MCP SDK client connected in-process to the MCP request handler
 * (no running server), backed by `tickets`. Close it at the end of the test.
 * Test files that use it need `// @vitest-environment node` on line 1.
 */
export async function connectMcpClient(
  tickets: Tickets,
  {
    cwd,
    runId,
    onToolCall,
  }: { cwd?: string; runId?: string; onToolCall?: ToolCallHook } = {},
): Promise<Client> {
  const client = new Client({ name: 'test-agent', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:3000/api/mcp'),
    {
      requestInit: {
        headers: {
          ...(cwd === undefined ? {} : { 'X-Tandembike-Cwd': cwd }),
          ...(runId === undefined ? {} : { 'X-Tandembike-Run': runId }),
        },
      },
      fetch: (url, init) =>
        handleMcpRequest(new Request(url, init), tickets, onToolCall),
    },
  );
  await client.connect(transport);
  return client;
}

type ToolResult = Awaited<ReturnType<Client['callTool']>>;

/** The text of a tool result's first content item. */
export function resultText(result: ToolResult): string {
  const [first] = result.content as { type: string; text?: string }[];
  if (first?.type !== 'text' || first.text === undefined) {
    throw new Error('Expected the tool result to start with text content.');
  }
  return first.text;
}

/** A successful tool result's JSON payload, parsed. */
export function resultJson(result: ToolResult): unknown {
  if (result.isError) {
    throw new Error(`Expected success, got tool error: ${resultText(result)}`);
  }
  return JSON.parse(resultText(result));
}
