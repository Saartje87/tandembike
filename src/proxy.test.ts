// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { proxy } from './proxy';

function requestFor(host: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/events', {
    headers: { host },
  });
}

describe('proxy', () => {
  it('lets a request for localhost through', () => {
    const response = proxy(requestFor('localhost:3000'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('refuses a request for another host with 403', () => {
    const response = proxy(requestFor('evil.example'));

    expect(response.status).toBe(403);
  });
});
