export type SsePayload = Record<string, unknown>;

export function encodeSse(event: string, data: SsePayload) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createSseStream(
  run: (emit: (event: string, data: SsePayload) => void, signal: AbortSignal) => Promise<void>,
  requestSignal?: AbortSignal,
) {
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  let closed = false;

  const abort = (reason?: unknown) => {
    if (!abortController.signal.aborted) {
      abortController.abort(reason instanceof Error ? reason : new Error('客户端连接已断开。'));
    }
  };
  const abortFromRequest = () => abort(requestSignal?.reason);

  if (requestSignal?.aborted) {
    abort(requestSignal.reason);
  } else {
    requestSignal?.addEventListener('abort', abortFromRequest, { once: true });
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: SsePayload) => {
        if (closed || abortController.signal.aborted) return;

        try {
          controller.enqueue(encoder.encode(encodeSse(event, data)));
        } catch (error) {
          closed = true;
          abort(error);
        }
      };

      try {
        emit('ready', { ok: true });
        await run(emit, abortController.signal);
        emit('done', { ok: true });
      } catch (error) {
        if (!abortController.signal.aborted) {
          emit('error', { message: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        closed = true;
        requestSignal?.removeEventListener('abort', abortFromRequest);
        try {
          controller.close();
        } catch {
          // The consumer may already have cancelled the response body.
        }
      }
    },
    cancel(reason) {
      closed = true;
      requestSignal?.removeEventListener('abort', abortFromRequest);
      abort(reason);
    },
  });
}
