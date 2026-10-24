import { type NextRequest, NextResponse } from 'next/server';

import { isAllowedHost } from './http/allowed-host';

/**
 * Refuses every request whose Host is not localhost with 403, against DNS
 * rebinding: the app has no login (ADR 0001), so a page on a re-pointed
 * domain must not reach its pages, Server Actions, /api/events or /api/mcp.
 * There is no matcher, so it runs on every route; Server Actions are POSTs to
 * the page that uses them and are covered too.
 */
export function proxy(request: NextRequest): NextResponse {
  if (!isAllowedHost(request.headers.get('host'))) {
    return new NextResponse('This host is not allowed.', { status: 403 });
  }
  return NextResponse.next();
}
