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

- Move a Ticket to In progress when you start it and finish it with complete_ticket, so the User can follow your progress.
- Project tools default to the Project of your working folder's repository, worktrees too; projectName or projectId picks another. With none, reuse a fitting Project from list_projects before creating one.
- Only the User archives and restores Projects; an archived Project, its Tickets and Cycles are read-only until restored.
- Claim Tickets before starting with claim_ticket, using a unique Agent-run ID. Done releases a Claim; release_ticket_claim abandons one. Claims coordinate; they do not authenticate.
- Share progress, findings and triage notes as comments (add_comment), not by editing the description. list_activity shows what changed on a Ticket, when, and by whom.
- Attach files with add_attachment, not comments; get_attachment reads them.
- Record that one Ticket must be finished before another can start with add_blocker, not in the description. Find ready, unclaimed work with list_tickets: status: "Todo", labels: ["ready-for-agent"], blocked: false, claimed: false.
- Rank a Status's Board order with sort_lane, never Blockers; a Board Lane shows it filtered by labels.
- Create related Tickets in one create_tickets call, the Blockers between them given by position; it creates an Epic and its children in the same call (type: "Epic" plus epicPosition).
- When you split a Ticket into others, such as a spec into build Tickets, pass it as their originNumber.
- Store a Ticket's ordered checklist in acceptanceCriteria, never as a checklist in the description or a comment, and check each off with set_acceptance_criteria_checked as you verify it.
- Work with Tickets through these tools, not direct database access.
- Tools that change a Ticket return its summary; get_ticket reads the whole Ticket.
- Refer to Tickets by number with a T, like T42.
- Classify and triage Tickets with labels, reusing existing ones from list_labels.
- An Epic is a Ticket, created with type: "Epic", that groups child Tickets of its own Project, one level deep, to hand them off as one unit; its description holds their shared context. Create a new Epic with its children in one create_tickets call; attach existing Tickets with attach_to_epic. To work it, claim the Epic once with claim_ticket, which covers its children, then work them in Blocker order, next an unfinished one with blocked: false, moving each to In progress and Done.
- A Cycle is a goal-led plan of Tickets in one Project, not a fixed-length sprint: Prepared, Active (at most one per Project) or Archived. Plan Tickets in with plan_tickets and move them to another Cycle or the Backlog with move_tickets.
- Load a flow's tools at once, e.g. planning a Cycle: list_cycles, create_cycle, create_tickets, plan_tickets, start_cycle; turning a spec into an Epic: create_tickets, attach_to_epic, add_blocker.
- Your client keeps the tools and these instructions from when it connected: when the app's MCP tools change, ask the User to start a new session, as reconnecting may keep the tool descriptions already loaded. Until then, a tool missing from your list may still exist.
- Your repository's own instructions set its process, such as when a Ticket is finished; follow them where they say more.`;

/** An MCP server whose tools call the Tickets module `tickets` only. */
export function createMcpServer(
  tickets: Tickets,
  origin = 'http://localhost:4747',
  cwd?: string,
): McpServer {
  const server = new McpServer(
    { name: 'tandembike', version: '0.1.0' },
    { instructions },
  );
  const context: ToolContext = {
    tickets,
    origin,
    cwd,
    resolveProjectId: (ref) => tickets.resolveProjectId({ ...ref, cwd }),
    registerTool: toolRegistrar(server),
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
  const server = createMcpServer(tickets, new URL(request.url).origin, cwd);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
