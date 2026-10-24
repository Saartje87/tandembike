// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { type ChangeListener, createChangeChannel } from '../tickets/changes';
import { changeEventsResponse } from './change-events';

/** The response body's reader. */
function bodyOf(response: Response) {
  return (response.body as ReadableStream<Uint8Array>).getReader();
}

/** Reads the next chunk of `reader` as text. */
async function nextChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

describe('changeEventsResponse', () => {
  it('is an uncached Server-Sent Events stream', () => {
    const response = changeEventsResponse(
      createChangeChannel().subscribe,
      new AbortController().signal,
    );

    expect(response.headers.get('Content-Type')).toBe(
      'text/event-stream; charset=utf-8',
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'no-cache, no-transform',
    );
  });

  it('starts with a reconnect delay, then streams each change as an event', async () => {
    const changes = createChangeChannel();
    const reader = bodyOf(
      changeEventsResponse(changes.subscribe, new AbortController().signal),
    );

    expect(await nextChunk(reader)).toBe('retry: 1000\n\n');

    changes.publish({ type: 'ticket', number: 7 });
    expect(await nextChunk(reader)).toBe(
      'data: {"type":"ticket","number":7}\n\n',
    );

    changes.publish({ type: 'project', id: 2 });
    expect(await nextChunk(reader)).toBe('data: {"type":"project","id":2}\n\n');
  });

  it('stops listening and ends the stream when the client disconnects', async () => {
    const changes = createChangeChannel();
    const unsubscribe = vi.fn();
    const subscribe = (listener: ChangeListener) => {
      changes.subscribe(listener);
      return unsubscribe;
    };
    const disconnect = new AbortController();
    const reader = bodyOf(changeEventsResponse(subscribe, disconnect.signal));
    await nextChunk(reader);

    disconnect.abort();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });

  it('stops listening when the stream is cancelled', async () => {
    const unsubscribe = vi.fn();
    const response = changeEventsResponse(
      () => unsubscribe,
      new AbortController().signal,
    );

    await response.body?.cancel();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('sends a comment now and then to keep the connection open', async () => {
    vi.useFakeTimers();
    try {
      const reader = bodyOf(
        changeEventsResponse(
          createChangeChannel().subscribe,
          new AbortController().signal,
        ),
      );
      await nextChunk(reader);

      vi.advanceTimersByTime(15_000);

      expect(await nextChunk(reader)).toBe(': ping\n\n');
    } finally {
      vi.useRealTimers();
    }
  });
});
