import type { ChatMessage, SessionInfo } from '../shared/types.js';

export type ChatEventHandler = (event: string, data: Record<string, unknown>) => void;

export async function streamChatEvents({
  message,
  intent,
  sessionId,
  onEvent,
}: {
  message: string;
  intent?: 'score';
  sessionId?: string;
  onEvent: ChatEventHandler;
}) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, intent, sessionId }),
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
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const data = chunk.match(/^data: (.+)$/m)?.[1];
      if (event && data) onEvent(event, JSON.parse(data));
    }
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
