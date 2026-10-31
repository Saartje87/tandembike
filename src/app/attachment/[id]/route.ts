import { connection } from 'next/server';

import { appTickets } from '../../../tickets/app-tickets';
import { attachmentResponse } from '../response';

type RouteContext = { params: Promise<{ id: string }> };

// Serves an Attachment's content by id (ADR 0018).
export const GET = async (
  _request: Request,
  { params }: RouteContext,
): Promise<Response> => {
  await connection();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) {
    return new Response('Not found', { status: 404 });
  }
  return attachmentResponse(appTickets('user'), Number(id));
};
