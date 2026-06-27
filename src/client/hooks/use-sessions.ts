import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, QuestionCard, ScoreCard, SessionInfo } from '../../shared/types.js';
import {
  archiveSession as archiveSessionRequest,
  createSession,
  fetchSessionMessages,
  fetchSessions,
  sendSessionMessage as sendSessionMessageRequest,
  subscribeSessionEvents,
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
  const [eventStreamRetry, setEventStreamRetry] = useState(0);
  const activeAgentMessageIds = useRef<Record<string, string>>({});

  const selectedSession = useMemo(() => sessions.find((s) => s.id === selectedSessionId), [selectedSessionId, sessions]);
  const visibleMessages = selectedSessionId ? (messagesBySession[selectedSessionId] ?? []) : [];
  const selectedMessagesLoaded = selectedSessionId ? messagesBySession[selectedSessionId] !== undefined : false;

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
        setMessagesBySession((cur) => (cur[selectedSessionId] === undefined ? { ...cur, [selectedSessionId]: messages } : cur));
      })
      .catch(() => {
        if (!alive) return;
        setMessagesBySession((cur) => (cur[selectedSessionId] === undefined ? { ...cur, [selectedSessionId]: [] } : cur));
      });

    return () => {
      alive = false;
    };
  }, [selectedSessionId, messagesBySession]);

  // ── Helpers ─────────────────────────────────────────────────────────
  const appendAgentPart = useCallback((sessionId: string, messageId: string, part: ChatMessage['parts'][number]) => {
    setMessagesBySession((current) => {
      const now = new Date().toISOString();
      const messages = current[sessionId] ?? [];
      const duplicateQuestion =
        part.kind === 'question' &&
        messages.some((message) =>
          message.parts.some((existingPart) => existingPart.kind === 'question' && existingPart.card.id === part.card.id),
        );
      const duplicateScore =
        part.kind === 'score' &&
        part.card.scoring_record_id !== undefined &&
        messages.some((message) =>
          message.parts.some(
            (existingPart) => existingPart.kind === 'score' && existingPart.card.scoring_record_id === part.card.scoring_record_id,
          ),
        );

      if (duplicateQuestion || duplicateScore) {
        return current;
      }

      const existing = messages.find((m) => m.id === messageId);
      const nextMessages = existing
        ? messages.map((m) => (m.id === messageId ? { ...m, parts: [...m.parts, part] } : m))
        : [...messages, { id: messageId, role: 'agent' as const, created_at: now, parts: [part] }];

      return { ...current, [sessionId]: nextMessages };
    });
    setSessions((current) => sortByUpdated(current.map((s) => (s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s))));
  }, []);

  const appendAgentTextDelta = useCallback((sessionId: string, messageId: string, deltaText: string) => {
    if (!deltaText) return;

    setMessagesBySession((current) => {
      const now = new Date().toISOString();
      const messages = current[sessionId] ?? [];
      const existing = messages.find((m) => m.id === messageId);
      const nextMessages = existing
        ? messages.map((m) => {
            if (m.id !== messageId) return m;
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
              id: messageId,
              role: 'agent' as const,
              created_at: now,
              parts: [{ kind: 'text' as const, text: deltaText }],
            },
          ];

      return { ...current, [sessionId]: nextMessages };
    });
  }, []);

  // ── Subscribe to selected session events ────────────────────────────
  useEffect(() => {
    if (!selectedSessionId || !selectedMessagesLoaded) {
      return;
    }

    const sessionId = selectedSessionId;
    const abortController = new AbortController();
    let alive = true;
    let retryTimer: number | undefined;

    subscribeSessionEvents({
      sessionId,
      signal: abortController.signal,
      onEvent(data) {
        if (!alive) return;

        if (data.type === 'agent_start' || data.type === 'turn_start') {
          setIsSending(true);
        }

        if (data.type === 'message_start') {
          const message = data.message as { role?: string; id?: string } | undefined;
          if (message?.role === 'assistant') {
            activeAgentMessageIds.current[sessionId] =
              typeof message.id === 'string' ? `agent-${message.id}` : `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          }
        }

        if (data.type === 'message_update') {
          const assistantEvent = data.assistantMessageEvent as { type?: string; delta?: string } | undefined;
          if (assistantEvent?.type !== 'text_delta') return;
          const deltaText = String(assistantEvent.delta ?? '');
          if (!activeAgentMessageIds.current[sessionId]) {
            activeAgentMessageIds.current[sessionId] = `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          }
          appendAgentTextDelta(sessionId, activeAgentMessageIds.current[sessionId], deltaText);
        }

        if (data.type === 'message_end') {
          const message = data.message as { role?: string; id?: string; stopReason?: string; errorMessage?: string } | undefined;
          if (message?.role === 'assistant' && message.stopReason === 'error' && message.errorMessage) {
            if (!activeAgentMessageIds.current[sessionId]) {
              activeAgentMessageIds.current[sessionId] =
                typeof message.id === 'string' ? `agent-${message.id}` : `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            }
            appendAgentTextDelta(sessionId, activeAgentMessageIds.current[sessionId], t`模型处理失败：${message.errorMessage}`);
          }
        }

        if (data.type === 'tool_execution_start' && data.toolName === 'ask_question') {
          const args = (data.args ?? {}) as Partial<QuestionCard>;
          const toolCallId = typeof data.toolCallId === 'string' ? data.toolCallId : `tool-${Date.now()}`;
          const knowledgeTypes = ['noun', 'verb', 'adjective', 'logic', 'domain'];
          const knowledgeType = knowledgeTypes.includes(String(args.knowledge_type)) ? args.knowledge_type : undefined;
          const candidates = Array.isArray(args.candidates)
            ? args.candidates.filter((candidate): candidate is string => typeof candidate === 'string')
            : undefined;

          if ((args.format === 'choice' || args.format === 'fill') && typeof args.question === 'string' && knowledgeType) {
            appendAgentPart(sessionId, `tool-${toolCallId}`, {
              kind: 'question',
              card: {
                type: 'question',
                id: toolCallId,
                format: args.format,
                question: args.question,
                knowledge_type: knowledgeType,
                topic_tag: typeof args.topic_tag === 'string' ? args.topic_tag : undefined,
                candidates: args.format === 'choice' ? candidates : undefined,
                correct: args.format === 'choice' && typeof args.correct === 'string' ? args.correct : undefined,
              },
            });
          }
        }

        if (data.type === 'tool_execution_end') {
          const details = ((data.result as { details?: unknown } | undefined)?.details ?? data.details) as
            { card?: QuestionCard | ScoreCard } | undefined;
          const card = details?.card;
          const toolCallId = typeof data.toolCallId === 'string' ? data.toolCallId : `tool-${Date.now()}`;
          if (card?.type === 'question') {
            appendAgentPart(sessionId, `tool-${toolCallId}`, { kind: 'question', card });
          }
          if (card?.type === 'score') {
            appendAgentPart(sessionId, `tool-${toolCallId}`, { kind: 'score', card });
          }
        }

        if (data.type === 'agent_end') {
          delete activeAgentMessageIds.current[sessionId];
          setIsSending(false);
          fetchSessions()
            .then((loadedSessions) => setSessions(sortByUpdated(loadedSessions)))
            .catch(() => undefined);
        }
      },
    }).catch((error) => {
      if (!alive || abortController.signal.aborted) return;
      console.error(error);
      delete activeAgentMessageIds.current[sessionId];
      setIsSending(false);
      fetchSessionMessages(sessionId)
        .then((messages) => {
          if (!alive) return;
          setMessagesBySession((current) => ({ ...current, [sessionId]: messages }));
        })
        .catch(() => undefined);
      retryTimer = window.setTimeout(() => {
        if (alive) setEventStreamRetry((current) => current + 1);
      }, 1000);
    });

    return () => {
      alive = false;
      if (retryTimer) window.clearTimeout(retryTimer);
      abortController.abort();
    };
  }, [selectedSessionId, selectedMessagesLoaded, eventStreamRetry, appendAgentPart, appendAgentTextDelta, t]);

  const startEmptyConversation = useCallback(() => {
    setSelectedSessionId(undefined);
    setInput('');
    setScoreMode(false);
    setIsSending(false);
  }, []);

  const selectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    setIsSending(false);
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
        setSelectedSessionId(undefined);
        setInput('');
        setScoreMode(false);
        setIsSending(false);
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
        appendAgentPart(selectedSessionId, `agent-error-${Date.now()}`, {
          kind: 'text',
          text: t`出错了：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    [selectedSessionId, appendAgentPart, t],
  );

  const send = useCallback(
    async (message = input) => {
      const text = message.trim();
      if (!text || isSending || (selectedSessionId && !selectedMessagesLoaded)) return;

      const outgoingSessionId = selectedSessionId;
      const outgoingIntent = scoreMode ? 'score' : undefined;
      const now = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'user',
        created_at: now,
        parts: [{ kind: 'text', text }],
      };

      setInput('');
      setScoreMode(false);
      setIsSending(true);

      try {
        if (outgoingSessionId) {
          setMessagesBySession((current) => {
            const messages = current[outgoingSessionId] ?? [];
            return { ...current, [outgoingSessionId]: [...messages, userMessage] };
          });
          const result = await sendSessionMessageRequest({ sessionId: outgoingSessionId, message: text, intent: outgoingIntent });
          if (result.session) {
            setSessions((current) =>
              sortByUpdated(current.map((session) => (session.id === outgoingSessionId ? result.session : session))),
            );
          }
        } else {
          const session = await createSession({ message: text, intent: outgoingIntent });
          setSessions((current) => sortByUpdated([session, ...current.filter((item) => item.id !== session.id)]));
          setMessagesBySession((current) => ({ ...current, [session.id]: [userMessage] }));
          setSelectedSessionId(session.id);
        }
      } catch (error) {
        setIsSending(false);
        if (outgoingSessionId) {
          appendAgentPart(outgoingSessionId, `agent-error-${Date.now()}`, {
            kind: 'text',
            text: t`出错了：${error instanceof Error ? error.message : String(error)}`,
          });
        } else {
          setInput(text);
        }
      }
    },
    [input, isSending, selectedSessionId, selectedMessagesLoaded, scoreMode, appendAgentPart, t],
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
