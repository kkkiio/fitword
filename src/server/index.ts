import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { getStats } from './db.js';
import { createSseStream } from './sse.js';

const app = new Hono();

app.get('/api/health', (context) => context.json({ ok: true }));
app.get('/api/stats', (context) => context.json(getStats()));
app.post('/api/chat/stream', async (context) => {
  const body = await context.req.json().catch(() => ({}));
  const message = String(body.message ?? '');
  const intent = body.intent === 'score' ? 'score' : undefined;
  const { streamChat } = await import('./pi-agent.js');
  return new Response(createSseStream((emit) => streamChat(message, intent, emit)), {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
});
app.use('/*', serveStatic({ root: 'dist' }));

const port = Number(process.env.PORT ?? 5174);
serve({ fetch: app.fetch, port }, () => console.log(`fitword running at http://localhost:${port}`));
