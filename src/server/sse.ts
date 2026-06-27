export type SsePayload = Record<string, unknown>;

export function encodeSse(data: SsePayload) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function createSseStream(
  run: (emit: (data: SsePayload) => void, signal: AbortSignal) => Promise<void>,
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
      const emit = (data: SsePayload) => {
        if (closed || abortController.signal.aborted) return;

        try {
          controller.enqueue(encoder.encode(encodeSse(data)));
        } catch (error) {
          closed = true;
          abort(error);
        }
      };

      try {
        await run(emit, abortController.signal);
      } catch (error) {
        if (!abortController.signal.aborted) {
          controller.error(error);
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
