import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { isAllowedHost } from '../http/allowed-host';
import type { Tickets } from '../tickets/tickets';
import { registerAttachmentTools } from './attachment-tools';
import { registerProjectTools } from './project-tools';
import { registerTicketTools } from './ticket-tools';
import { type ToolContext, toolRegistrar } from './tool-shared';
import { registerWorkTools } from './work-tools';

/**
 * The most characters the instructions may render to. Claude Code (2.1.310)
 * cuts server instructions, and each tool description, at 4,096 characters;
 * VS Code's Copilot agent passes them whole. The margin leaves room for new
 * rules, and the most important rules come first in case a client cuts more.
 */
export const maxInstructionsLength = 3500;

export const instructions = `This server is a ticket tracker shared with the User, who watches the Board in a browser. Work is organised as Tickets in Projects; every Ticket has a Status: Todo, In progress or Done.

- Tools default to the Project of your working folder's repository, worktrees too; projectName or projectId picks another, and find_tickets and get_project take allProjects. Only the User creates, renames, archives and restores Projects, and starts or archives Cycles; an archived Project is read-only until restored.
- Begin with start_work: it claims the Ticket, moves a Todo Ticket to In progress and returns everything you need to begin. next_work gives the top ready item of the Active Cycle, or says why there is none; tell the User then.
- End with finish_work once the work is merged, or abandon_work with a reason when you give up, so nothing stays Stalled. Claims coordinate; they do not authenticate.
- Your Agent-run ID comes from the run Tandembike started. A \`tandembike start\` session needs no agentRunId; in any other terminal session, pass agentRunId, a unique ID for your run, to the tools that name it.
- Share progress, findings and triage notes with add_note, not by editing the description. get_ticket returns the comments, and its include: ["activity"] adds what changed, when and by whom.
- Create new work with file_tickets: one or many Tickets in one call, with an Epic and its children (type: "Epic" plus epicPosition), Blockers between them by position (blockedByPositions), originPosition or originNumber when you split a Ticket into others, labels, acceptanceCriteria and a Cycle.
- Blockers are native: add them with update_ticket (addBlockers), never in the description. An ordered checklist belongs in acceptanceCriteria, never as a checklist in the description or a comment; check each off with check_criterion as you verify it.
- An Epic is a Ticket, created with type: "Epic", that groups child Tickets of its own Project, one level deep, to hand them off as one unit; its description holds their shared context. Call start_work on the Epic once: it covers its children and returns them with their Statuses and Blockers and the next one to work; then start_work each child in Blocker order.
- A Cycle is a goal-led plan of Tickets in one Project, not a fixed-length sprint: Prepared, Active (at most one per Project) or Archived. get_project lists them with their Tickets. create_cycle proposes a Prepared Cycle with Tickets planned in; update_ticket (cycleId) plans, moves or unplans a Ticket.
- find_tickets searches by text, Status, labels, type, Epic, Origin, External references, Cycle, Blocked, Claimed and changed-since. update_ticket changes one or several Tickets: fields, labels, Epic, Blockers, Cycle, archive and restore. Reuse the labels get_project lists.
- Attach files with attach, not comments; read_attachment reads them.
- Work with Tickets through these tools, not direct database access. Tools that change a Ticket return its summary; get_ticket reads the whole Ticket.
- Refer to Tickets by number with a T, like T42.
- Your client keeps the tools and these instructions from when it connected: when the app's MCP tools change, ask the User to start a new session, as reconnecting may keep the tool descriptions already loaded. Until then, a tool missing from your list may still exist.
- Your repository's own instructions set its process, such as when a Ticket is finished; follow them where they say more.`;

/**
 * Called after each tool call of a request that sent `X-Tandembike-Run`, with
 * that run id, the tool's name and its input (T1238). The app wires it to the
 * Conversations module; the server itself knows nothing of Conversations.
 */
export type ToolCallHook = (
  runId: string,
  toolName: string,
  input: Record<string, unknown>,
) => void;

/** An MCP server whose tools call the Tickets module `tickets` only. */
export function createMcpServer(
  tickets: Tickets,
  origin = 'http://localhost:4747',
  cwd?: string,
  runId?: string,
  onToolCall?: ToolCallHook,
): McpServer {
  const server = new McpServer(
    { name: 'tandembike', version: '0.1.0' },
    { instructions },
  );
  const context: ToolContext = {
    tickets,
    origin,
    cwd,
    runId,
    resolveProjectId: (ref) => tickets.resolveProjectId({ ...ref, cwd }),
    registerTool: toolRegistrar(
      server,
      runId && onToolCall
        ? (name, input) => onToolCall(runId, name, input)
        : undefined,
    ),
  };

  registerTicketTools(context);
  registerWorkTools(context);
  registerProjectTools(context);
  registerAttachmentTools(context);

  return server;
}

/**
 * Answers one MCP request over Streamable HTTP, statelessly (ADR 0002): each
 * request gets a fresh server and transport around `tickets`. Responses are
 * plain JSON, not SSE streams. A Host other than localhost is refused with
 * 403 against DNS rebinding, as `src/proxy.ts` does for the whole app; the
 * SDK's own `allowedHosts` option is deprecated and cannot allow any port.
 */
export async function handleMcpRequest(
  request: Request,
  tickets: Tickets,
  onToolCall?: ToolCallHook,
): Promise<Response> {
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (!isAllowedHost(host)) {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'This host is not allowed.' },
        id: null,
      },
      { status: 403 },
    );
  }
  const cwd = request.headers.get('x-tandembike-cwd')?.trim() || undefined;
  const runId = request.headers.get('x-tandembike-run')?.trim() || undefined;
  const server = createMcpServer(
    tickets,
    new URL(request.url).origin,
    cwd,
    runId,
    onToolCall,
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
