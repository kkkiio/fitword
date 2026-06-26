import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatMessage, QuestionCard, ScoreCard, SessionInfo } from '../../shared/types.js';
import {
  archiveSession as archiveSessionRequest,
  fetchSessionMessages,
  fetchSessions,
  streamChatEvents,
  submitQuestionAnswer,
} from '../api';
import type { ChatSession } from '../types';

const SESSION_KEY = 'fitword.currentSessionId';

function sortByUpdated(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export function useSessions() {
  const { t } = useLingui();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [scoreMode, setScoreMode] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId),
    [selectedSessionId, sessions],
  );
  const visibleMessages = selectedSessionId ? messagesBySession[selectedSessionId] ?? [] : [];

  // ── Load sessions on mount ──────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    fetchSessions()
      .then((loadedSessions) => {
        if (!alive) return;
        const ordered = sortByUpdated(loadedSessions);
        const storedId = window.localStorage.getItem(SESSION_KEY) || undefined;
        setSessions(ordered);
        setSessionsLoaded(true);
        if (storedId && ordered.some((s) => s.id === storedId)) {
          setSelectedSessionId(storedId);
        } else {
          window.localStorage.removeItem(SESSION_KEY);
          setSelectedSessionId(undefined);
        }
      })
      .catch(() => {
        if (!alive) return;
        setSessionsLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  // ── Persist selected session id ─────────────────────────────────────
  useEffect(() => {
    if (!sessionsLoaded) return;

    if (!selectedSessionId) {
      window.localStorage.removeItem(SESSION_KEY);
      return;
    }

    if (!sessions.some((s) => s.id === selectedSessionId)) {
      window.localStorage.removeItem(SESSION_KEY);
      setSelectedSessionId(undefined);
      return;
    }

    window.localStorage.setItem(SESSION_KEY, selectedSessionId);
  }, [selectedSessionId, sessions, sessionsLoaded]);

  // ── Lazy-load messages for selected session ─────────────────────────
  useEffect(() => {
    if (!selectedSessionId || messagesBySession[selectedSessionId] !== undefined) {
      return;
    }

    let alive = true;

    fetchSessionMessages(selectedSessionId)
      .then((messages) => {
        if (!alive) return;
        setMessagesBySession((cur) => ({ ...cur, [selectedSessionId]: messages }));
      })
      .catch(() => {
        if (!alive) return;
        setMessagesBySession((cur) => ({ ...cur, [selectedSessionId]: [] }));
      });

    return () => {
      alive = false;
    };
  }, [selectedSessionId, messagesBySession]);

  // ── Helpers ─────────────────────────────────────────────────────────
  const appendAgentPart = useCallback(
    (sessionId: string, messageId: string, part: ChatMessage['parts'][number]) => {
      setMessagesBySession((current) => {
        const now = new Date().toISOString();
        const messages = current[sessionId] ?? [];
        const existing = messages.find((m) => m.id === messageId);
        const nextMessages = existing
          ? messages.map((m) => (m.id === messageId ? { ...m, parts: [...m.parts, part] } : m))
          : [...messages, { id: messageId, role: 'agent' as const, created_at: now, parts: [part] }];

        return { ...current, [sessionId]: nextMessages };
      });
      setSessions((current) =>
        sortByUpdated(
          current.map((s) => (s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s)),
        ),
      );
    },
    [],
  );

  const startEmptyConversation = useCallback(() => {
    setSelectedSessionId(undefined);
    setInput('');
    setScoreMode(false);
  }, []);

  const selectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
  }, []);

  const archiveConversation = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;
      if (!window.confirm(t`归档这个对话？`)) return;

      await archiveSessionRequest(sessionId);
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setSessions(remaining);
      setMessagesBySession((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });

      if (selectedSessionId === sessionId) {
        setSelectedSessionId(remaining[0]?.id);
      }
    },
    [sessions, selectedSessionId, t],
  );

  const answerQuestion = useCallback(
    async (questionId: string, answer: string) => {
      if (!selectedSessionId) return;

      try {
        await submitQuestionAnswer({ sessionId: selectedSessionId, questionId, answer });
      } catch (error) {
        appendAgentPart(
          selectedSessionId,
          `agent-error-${Date.now()}`,
          { kind: 'text', text: t`出错了：${error instanceof Error ? error.message : String(error)}` },
        );
      }
    },
    [selectedSessionId, appendAgentPart, t],
  );

  const send = useCallback(
    async (message = input) => {
      const text = message.trim();
      if (!text || isSending) return;

      const outgoingSessionId = selectedSessionId;
      const outgoingIntent = scoreMode ? 'score' : undefined;
      const assistantId = `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let targetSessionId = outgoingSessionId;
      let assistantStarted = false;

      setInput('');
      setScoreMode(false);
      setIsSending(true);

      try {
        await streamChatEvents({
          message: text,
          intent: outgoingIntent,
          sessionId: outgoingSessionId,
          onEvent(event, data) {
            if (event === 'session') {
              const session = data.session as SessionInfo;
              targetSessionId = session.id;
              setSelectedSessionId(session.id);
              setSessions((current) => {
                const existing = current.some((s) => s.id === session.id);
                const next = existing
                  ? current.map((s) => (s.id === session.id ? session : s))
                  : [session, ...current];
                return sortByUpdated(next);
              });
              setMessagesBySession((current) =>
                current[session.id] ? current : { ...current, [session.id]: [] },
              );
            }

            if (!targetSessionId) return;

            if (event === 'message') {
              const incoming = data.message as ChatMessage;
              setMessagesBySession((current) => {
                const messages = current[targetSessionId!] ?? [];
                const nextMessages = messages.some((m) => m.id === incoming.id)
                  ? messages.map((m) => (m.id === incoming.id ? incoming : m))
                  : [...messages, incoming];
                return { ...current, [targetSessionId!]: nextMessages };
              });
            }

            if (event === 'delta') {
              const deltaText = String(data.text ?? '');
              assistantStarted = true;
              setMessagesBySession((current) => {
                const now = new Date().toISOString();
                const messages = current[targetSessionId!] ?? [];
                const existing = messages.find((m) => m.id === assistantId);
                const nextMessages = existing
                  ? messages.map((m) => {
                      if (m.id !== assistantId) return m;
                      const last = m.parts[m.parts.length - 1];
                      if (last?.kind === 'text') {
                        return {
                          ...m,
                          parts: [...m.parts.slice(0, -1), { ...last, text: `${last.text}${deltaText}` }],
                        };
                      }
                      return { ...m, parts: [...m.parts, { kind: 'text' as const, text: deltaText }] };
                    })
                  : [
                      ...messages,
                      {
                        id: assistantId,
                        role: 'agent' as const,
                        created_at: now,
                        parts: [{ kind: 'text' as const, text: deltaText }],
                      },
                    ];
                return { ...current, [targetSessionId!]: nextMessages };
              });
            }

            if (event === 'tool') {
              if (data.kind === 'question') {
                assistantStarted = true;
                appendAgentPart(targetSessionId, assistantId, {
                  kind: 'question',
                  card: data.card as QuestionCard,
                });
              }
              if (data.kind === 'score') {
                assistantStarted = true;
                appendAgentPart(targetSessionId, assistantId, {
                  kind: 'score',
                  card: data.card as ScoreCard,
                });
              }
            }

            if (event === 'warning' && !assistantStarted) {
              appendAgentPart(targetSessionId, assistantId, {
                kind: 'text',
                text: String(data.message ?? ''),
              });
            }

            if (event === 'error') {
              appendAgentPart(targetSessionId, assistantId, {
                kind: 'text',
                text: t`出错了：${String(data.message ?? '未知错误')}`,
              });
            }
          },
        });
      } catch (error) {
        if (targetSessionId) {
          appendAgentPart(targetSessionId, assistantId, {
            kind: 'text',
            text: t`出错了：${error instanceof Error ? error.message : String(error)}`,
          });
        }
      } finally {
        if (targetSessionId) {
          const now = new Date().toISOString();
          setSessions((current) =>
            sortByUpdated(current.map((s) => (s.id === targetSessionId ? { ...s, updated_at: now } : s))),
          );
        }
        setIsSending(false);
      }
    },
    [input, isSending, selectedSessionId, scoreMode, appendAgentPart, t],
  );

  return {
    sessions,
    selectedSession,
    selectedSessionId,
    visibleMessages,
    input,
    scoreMode,
    isSending,
    setInput,
    setScoreMode,
    selectSession,
    startEmptyConversation,
    archiveConversation,
    answerQuestion,
    send,
  } as const;
}
