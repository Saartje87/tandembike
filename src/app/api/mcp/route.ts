import { handleMcpRequest } from '../../../mcp/mcp-server';
import { appTickets } from '../../../tickets/app-tickets';

// Stateless Streamable HTTP (ADR 0002) needs only POST. A stateless GET
// stream would never close, so GET and DELETE are left to Next's 405.
export const POST = (request: Request): Promise<Response> =>
  handleMcpRequest(request, appTickets());
