import { connection } from 'next/server';

import { changeEventsResponse } from '../../../live/change-events';
import { appTickets } from '../../../tickets/app-tickets';

// Server-Sent Events for open browser tabs (ADR 0005): every change the
// Tickets module announces, from Server Actions or the MCP route alike.
export const GET = async (request: Request): Promise<Response> => {
  await connection();
  return changeEventsResponse(appTickets().subscribe, request.signal);
};
