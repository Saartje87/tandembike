import { appConversations } from '../../../conversations/app-conversations';
import { handleMcpRequest } from '../../../mcp/mcp-server';
import { appTickets } from '../../../tickets/app-tickets';

// Stateless Streamable HTTP (ADR 0002) needs only POST. A stateless GET
// stream would never close, so GET and DELETE are left to Next's 405. An
// Agent makes every change through it, so it is recorded as the Agent's.
export const POST = (request: Request): Promise<Response> =>
  handleMcpRequest(
    request,
    appTickets('agent'),
    // A `tandembike start` session's calls feed its Status line (T1238).
    (runId, toolName, input) =>
      appConversations().recordTerminalCall(runId, toolName, input),
  );
