import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { archiveSession, getActiveSessions, getSession, getStats } from './db.js';
import { createSseStream } from './sse.js';

const app = new Hono();

app.get('/api/health', (context) => context.json({ ok: true }));
app.get('/api/stats', (context) => context.json(getStats()));
app.get('/api/sessions', (context) => context.json(getActiveSessions()));
app.get('/api/sessions/:id/messages', async (context) => {
  const sessionId = context.req.param('id');
  const session = getSession(sessionId);

  if (!session || session.status !== 'active') {
    return context.json({ error: '会话不存在或已归档。' }, 404);
  }

  const { readSessionMessages } = await import('./pi-agent.js');
  return context.json(readSessionMessages(sessionId));
});
app.post('/api/sessions/:id/archive', async (context) => {
  const sessionId = context.req.param('id');
  const result = archiveSession(sessionId);

  if (!result.ok) {
    return context.json({ error: '会话不存在或已归档。' }, 404);
  }

  const { cancelSessionTurn } = await import('./pi-agent.js');
  await cancelSessionTurn(sessionId, '会话已归档。');

  return context.json(result);
});
app.post('/api/sessions/:id/answer', async (context) => {
  const sessionId = context.req.param('id');
  const body = await context.req.json().catch(() => ({}));
  const questionId = String(body.questionId ?? '');
  const answer = String(body.answer ?? '');

  if (!questionId || !answer.trim()) {
    return context.json({ error: '题目和答案不能为空。' }, 400);
  }

  try {
    const { resolveQuestionAnswer } = await import('./pi-agent.js');
    return context.json(resolveQuestionAnswer(sessionId, questionId, answer));
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : String(error) }, 409);
  }
});
app.post('/api/chat/stream', async (context) => {
  const body = await context.req.json().catch(() => ({}));
  const message = String(body.message ?? '');
  const intent = body.intent === 'score' ? 'score' : undefined;
  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : undefined;

  if (!message.trim()) {
    return context.json({ error: '消息不能为空。' }, 400);
  }

  const { streamChat } = await import('./pi-agent.js');
  return new Response(createSseStream((emit, signal) => streamChat({ sessionId, message, intent }, emit, signal), context.req.raw.signal), {
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
