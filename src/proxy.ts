import { type NextRequest, NextResponse } from 'next/server';

import { isAllowedHost } from './http/allowed-host';

/**
 * Keeps the app local-only (ADR 0001, ADR 0022). There is no matcher, so it
 * runs on every route; Server Actions are POSTs to the page that uses them and
 * are covered too.
 *
 * - The Host must be localhost, against DNS rebinding: a page on a re-pointed
 *   domain must not reach the app's pages, Server Actions, /api/events or
 *   /api/mcp.
 * - A request that carries an Origin must come from the app itself,
 *   `http://<its Host>`, so another website open in the User's browser cannot
 *   call /api/mcp, /api/events or the attachment routes. `Origin: null` is
 *   refused. A request without Origin passes: CLI MCP clients send none, and
 *   browsers send none on same-origin GETs.
 */
export function proxy(request: NextRequest): NextResponse {
  const host = request.headers.get('host');
  if (!isAllowedHost(host)) {
    return new NextResponse('This host is not allowed.', { status: 403 });
  }
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== `http://${host}`) {
    return new NextResponse('This origin is not allowed.', { status: 403 });
  }
  return NextResponse.next();
}
