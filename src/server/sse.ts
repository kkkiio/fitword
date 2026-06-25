export type SsePayload = Record<string, unknown>;

export function encodeSse(event: string, data: SsePayload) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createSseStream(run: (emit: (event: string, data: SsePayload) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: SsePayload) => controller.enqueue(encoder.encode(encodeSse(event, data)));
      try {
        emit('ready', { ok: true });
        await run(emit);
        emit('done', { ok: true });
      } catch (error) {
        emit('error', { message: error instanceof Error ? error.message : String(error) });
      } finally {
        controller.close();
      }
    },
  });
}
