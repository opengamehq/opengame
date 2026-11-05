/** Bound network replies while reading them, including chunked bodies. The
 * caller's deadline covers the body as well as receipt of response headers.
 * Leaderboards, achievements and the event flush all read through this one copy;
 * the leaderboards had a second loop of their own until 21 Oct 2026, and two
 * readers of one bound is how the weaker one ends up on a path nobody re-reads.
 * An oversized body throws `response_too_large`, which leaderboards report as
 * their reason and every other caller treats as any other unreadable reply. */
export async function readJson(response: Response, max: number, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_response');
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    if (signal.aborted) throw new Error('timeout');
    while (true) {
      const { value, done } = await reader.read();
      if (signal.aborted) throw new Error('timeout');
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new Error('response_too_large');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    signal.removeEventListener('abort', abort);
    abort();
    reader.releaseLock();
  }
}

/** A refused or unread reply still holds a connection until its body is released.
 * Cancelling can itself reject on a body that already errored, which is not news. */
export function discard(response: Response): void {
  void response.body?.cancel().catch(() => {});
}
