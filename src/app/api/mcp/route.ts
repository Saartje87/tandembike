import { appConversations } from '../../../conversations/app-conversations';
import { createConversationReader } from '../../../conversations/conversation-reader';
import { handleMcpRequest } from '../../../mcp/mcp-server';
import { appSpars } from '../../../spars/app-spars';
import { appDatabase, appTickets } from '../../../tickets/app-tickets';

// Stateless Streamable HTTP (ADR 0002) needs only POST. A stateless GET
// stream would never close, so GET and DELETE are left to Next's 405. An
// Agent makes every change through it, so it is recorded as the Agent's.
export const POST = (request: Request): Promise<Response> => {
  const tickets = appTickets('agent');
  return handleMcpRequest(request, tickets, {
    // A `tandembike implement` session's calls feed its Status line (T1238).
    onToolCall: (runId, toolName, input) =>
      appConversations().recordTerminalCall(runId, toolName, input),
    // get_conversations reads them without the live module (T1265).
    conversations: createConversationReader(appDatabase(), tickets),
    // A Spar run's own Canvas (ADR 0046).
    spars: appSpars(),
  });
};
