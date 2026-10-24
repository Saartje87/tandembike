import type { ChangeChannel } from '../tickets/changes';

/** How long a browser waits before reconnecting after the stream drops. */
const retryMs = 1000;

/** A comment this often keeps proxies and the browser from timing out. */
const keepAliveMs = 15_000;

/**
 * A Server-Sent Events response (ADR 0005) that sends every change announced
 * through `subscribe` as one `data:` event holding the `Change` as JSON. It
 * stops listening when `signal` aborts (the client disconnected) or the
 * stream is cancelled.
 */
export function changeEventsResponse(
  subscribe: ChangeChannel['subscribe'],
  signal: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const unsubscribe = subscribe((change) =>
        send(`data: ${JSON.stringify(change)}\n\n`),
      );
      const keepAlive = setInterval(() => send(': ping\n\n'), keepAliveMs);
      let stopped = false;
      stop = () => {
        if (stopped) {
          return;
        }
        stopped = true;
        unsubscribe();
        clearInterval(keepAlive);
      };

      send(`retry: ${retryMs}\n\n`);
      signal.addEventListener('abort', () => {
        // A cancelled stream can no longer be closed.
        if (!stopped) {
          stop();
          controller.close();
        }
      });
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
