import type { ChatMessage, SessionInfo } from '../shared/types.js';

export type ChatEventHandler = (data: Record<string, unknown>) => void;

export async function createSession({
  message,
  intent,
}: {
  message: string;
  intent?: 'score';
}) {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, intent }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return (await response.json()) as SessionInfo;
}

export async function sendSessionMessage({
  sessionId,
  message,
  intent,
}: {
  sessionId: string;
  message: string;
  intent?: 'score';
}) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, intent }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return (await response.json()) as { ok: boolean; session: SessionInfo };
}

export async function subscribeSessionEvents({
  sessionId,
  signal,
  onEvent,
}: {
  sessionId: string;
  signal: AbortSignal;
  onEvent: ChatEventHandler;
}) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/events`, {
    headers: { accept: 'text/event-stream' },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error('当前浏览器不支持流式响应');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const data = chunk.match(/^data: (.+)$/m)?.[1];
      if (data) onEvent(JSON.parse(data));
    }
  }

  if (!signal.aborted) {
    throw new Error('SSE 连接已结束');
  }
}

export async function fetchStats() {
  const response = await fetch('/api/stats');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function fetchSessions() {
  const response = await fetch('/api/sessions');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as SessionInfo[];
}

export async function fetchSessionMessages(sessionId: string) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as ChatMessage[];
}

export async function archiveSession(sessionId: string) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<{ ok: boolean }>;
}

export async function submitQuestionAnswer({
  sessionId,
  questionId,
  answer,
}: {
  sessionId: string;
  questionId: string;
  answer: string;
}) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ questionId, answer }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<{ ok: boolean }>;
}
