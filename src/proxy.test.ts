// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { proxy } from './proxy';

function requestFor(host: string, origin?: string): NextRequest {
  const headers: Record<string, string> = { host };
  if (origin !== undefined) headers.origin = origin;
  return new NextRequest('http://localhost:3000/api/events', { headers });
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

  it.each([
    ['localhost:3000', 'http://localhost:3000'],
    ['127.0.0.1:4747', 'http://127.0.0.1:4747'],
    ['[::1]:4747', 'http://[::1]:4747'],
  ])('lets a request from its own origin through (Host %s)', (host, origin) => {
    const response = proxy(requestFor(host, origin));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each([
    'https://evil.example',
    'http://evil.example',
    'http://localhost:4848',
    'http://localhost',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3000/',
    'null',
    '',
  ])('refuses a request from the origin %j with 403', (origin) => {
    const response = proxy(requestFor('localhost:3000', origin));

    expect(response.status).toBe(403);
  });
});
