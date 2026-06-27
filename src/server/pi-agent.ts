import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Type } from 'typebox';
import {
  AuthStorage,
  createAgentSession,
  type CreateAgentSessionOptions,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import {
  createSessionFromFirstMessage,
  fitwordDataDir,
  fitwordSessionDir,
  getSession,
  recordAnswer,
  saveScore,
  touchSession,
  getStats,
} from './db.js';
import { FITWORD_SYSTEM_PROMPT } from './system-prompt.js';
import type {
  ChatMessage,
  ChatPart,
  KnowledgeType,
  Quality,
  QuestionCard,
  ScoreCard,
  SessionInfo,
} from '../shared/types.js';

export type StreamEmit = (data: Record<string, unknown>) => void;

type PiSession = Awaited<ReturnType<typeof createAgentSession>>['session'];

interface PendingQuestion {
  card: QuestionCard;
  resolve: (value: { user_answer: string; quality?: Quality }) => void;
  reject: (error: Error) => void;
}

interface ManagedPiSession {
  id: string;
  queue: Promise<void>;
  lastUsed: number;
  emit?: StreamEmit;
  session?: PiSession;
  sessionPromise?: Promise<PiSession>;
  unsubscribe?: () => void;
  historyManager?: SessionManager;
  pendingQuestion?: PendingQuestion;
}

const openAICompatibleProvider = 'fitword-openai-compatible';
const sessionCache = new Map<string, ManagedPiSession>();
const maxCachedAgents = 10;
const configuredQuestionTimeoutMs = Number.parseInt(process.env.FITWORD_QUESTION_TIMEOUT_MS ?? '', 10);
const questionAnswerTimeoutMs =
  Number.isFinite(configuredQuestionTimeoutMs) && configuredQuestionTimeoutMs > 0
    ? configuredQuestionTimeoutMs
    : 15 * 60 * 1000;



function getRequiredLlmConfig() {
  const openAIApiKey = process.env.OPENAI_API_KEY?.trim();
  const openAIBaseUrl = process.env.OPENAI_BASE_URL?.trim();
  const openAIModel = process.env.OPENAI_MODEL?.trim();

  if (!openAIApiKey || !openAIBaseUrl || !openAIModel) {
    const missingConfig: string[] = [];
    if (!openAIApiKey) missingConfig.push('OPENAI_API_KEY');
    if (!openAIBaseUrl) missingConfig.push('OPENAI_BASE_URL');
    if (!openAIModel) missingConfig.push('OPENAI_MODEL');
    throw new Error(`LLM 配置缺少 ${missingConfig.join(', ')}；请同时配置 OPENAI_API_KEY、OPENAI_BASE_URL 和 OPENAI_MODEL。`);
  }

  return { openAIApiKey, openAIBaseUrl, openAIModel };
}

function stripInstructionTag(text: string) {
  return text.replace(/^<instruction>[\s\S]*?<\/instruction>\s*/u, '');
}

function getSessionFilePath(sessionId: string) {
  return path.join(fitwordSessionDir, `${sessionId}.jsonl`);
}

function ensureSessionFile(sessionId: string) {
  const sessionFile = getSessionFilePath(sessionId);
  const existingSize = fs.existsSync(sessionFile) ? fs.statSync(sessionFile).size : 0;

  if (existingSize === 0) {
    const header = {
      type: 'session',
      version: 3,
      id: sessionId,
      timestamp: new Date().toISOString(),
      cwd: fitwordDataDir,
    };

    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, `${JSON.stringify(header)}\n`, 'utf8');
  }

  return sessionFile;
}

function getManagedState(sessionId: string) {
  const existing = sessionCache.get(sessionId);

  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }

  const state: ManagedPiSession = {
    id: sessionId,
    queue: Promise.resolve(),
    lastUsed: Date.now(),
  };

  sessionCache.set(sessionId, state);
  return state;
}

function getHistoryManager(state: ManagedPiSession) {
  if (state.historyManager) {
    return state.historyManager;
  }

  const sessionFile = ensureSessionFile(state.id);
  state.historyManager = SessionManager.open(sessionFile, fitwordSessionDir, fitwordDataDir);
  return state.historyManager;
}

function waitForQuestionAnswer(state: ManagedPiSession, card: QuestionCard, signal?: AbortSignal) {
  if (state.pendingQuestion) {
    throw new Error('当前 session 已有一道题正在等待作答。');
  }

  if (signal?.aborted) {
    throw new Error('等待用户作答已取消。');
  }

  return new Promise<{ user_answer: string; quality?: Quality }>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }

      signal?.removeEventListener('abort', onAbort);

      if (state.pendingQuestion?.card.id === card.id) {
        state.pendingQuestion = undefined;
      }
    };
    const finish = (value: { user_answer: string; quality?: Quality }) => {
      cleanup();
      resolve(value);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      fail(new Error('等待用户作答已取消。'));
    };

    state.pendingQuestion = {
      card,
      resolve: finish,
      reject: fail,
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(() => {
      fail(new Error('等待用户作答超时，请重新发起练习。'));
    }, questionAnswerTimeoutMs);
  });
}

function createFitwordTools(state: ManagedPiSession) {
  const askQuestionTool = defineTool({
    name: 'ask_question',
    label: 'Ask Question',
    description: '展示一道 fitword 选择题或填空题，等待用户作答后返回答案。工具不写入存储。',
    parameters: Type.Object({
      format: Type.Union([Type.Literal('choice'), Type.Literal('fill')]),
      question: Type.String(),
      knowledge_type: Type.Union([
        Type.Literal('noun'),
        Type.Literal('verb'),
        Type.Literal('adjective'),
        Type.Literal('logic'),
        Type.Literal('domain'),
      ]),
      topic_tag: Type.Optional(Type.String()),
      candidates: Type.Optional(Type.Array(Type.String())),
      correct: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, params, signal) => {
      const card: QuestionCard = {
        type: 'question',
        id: randomUUID(),
        format: params.format,
        question: params.question,
        knowledge_type: params.knowledge_type,
        topic_tag: params.topic_tag,
        candidates: params.format === 'choice' ? params.candidates : undefined,
        correct: params.format === 'choice' ? params.correct : undefined,
      };

      if (card.format === 'choice' && (!card.candidates?.length || !card.correct)) {
        throw new Error('选择题必须提供 candidates 和 correct。');
      }

          const result = await waitForQuestionAnswer(state, card, signal);

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: { card, result },
      };
    },
  });

  const recordAnswerTool = defineTool({
    name: 'record_answer',
    label: 'Record Answer',
    description: '写入已完成作答的题目和答案质量。',
    parameters: Type.Object({
      format: Type.Union([Type.Literal('choice'), Type.Literal('fill')]),
      question: Type.String(),
      knowledge_type: Type.Union([
        Type.Literal('noun'),
        Type.Literal('verb'),
        Type.Literal('adjective'),
        Type.Literal('logic'),
        Type.Literal('domain'),
      ]),
      topic_tag: Type.Optional(Type.String()),
      user_answer: Type.String(),
      quality: Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)]),
      candidates: Type.Optional(Type.Array(Type.String())),
      correct: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, params) => {
      if (params.format === 'choice' && params.quality === 1) {
        throw new Error('选择题只能记录 0 或 2 两档质量。');
      }

      const result = recordAnswer({
        format: params.format,
        question: params.question,
        knowledge_type: params.knowledge_type,
        topic_tag: params.topic_tag,
        user_answer: params.user_answer,
        quality: params.quality,
        candidates: params.candidates,
        correct: params.correct,
      });

      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
    },
  });

  const evaluateWritingTool = defineTool({
    name: 'evaluate_writing',
    label: 'Evaluate Writing',
    description: '展示并保存 Agent 生成的写作评分结果。',
    parameters: Type.Object({
      original_text: Type.String(),
      total_score: Type.Number(),
      dimensions: Type.Object({
        accuracy: Type.Number(),
        specificity: Type.Number(),
        naturalness: Type.Number(),
        structure: Type.Number(),
        register: Type.Number(),
      }),
      main_issues: Type.String(),
      suggestions: Type.Array(
        Type.Object({
          original: Type.String(),
          replacement: Type.String(),
          reason: Type.String(),
        }),
      ),
      rewrite: Type.String(),
    }),
    execute: async (_toolCallId, params) => {
      const card: ScoreCard = { type: 'score', ...params };
      card.scoring_record_id = saveScore(card);
      return {
        content: [{ type: 'text', text: JSON.stringify({ scoring_record_id: card.scoring_record_id }) }],
        details: { card },
      };
    },
  });

  const getPracticeStatsTool = defineTool({
    name: 'get_practice_stats',
    label: 'Get Practice Stats',
    description: '查询本地练习统计数据。',
    parameters: Type.Object({
      query: Type.Union([
        Type.Literal('weak_types'),
        Type.Literal('topic_distribution'),
        Type.Literal('overall'),
        Type.Literal('format_comparison'),
        Type.Literal('writing_summary'),
      ]),
    }),
    execute: async (_toolCallId, params) => {
      const stats = getStats();
      const result = params.query === 'overall' ? stats.overall : stats[params.query];
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
    },
  });

  return [askQuestionTool, recordAnswerTool, evaluateWritingTool, getPracticeStatsTool];
}

async function createFitwordPiSession(state: ManagedPiSession) {
  const authStorage = AuthStorage.create(path.join(fitwordDataDir, 'auth.json'));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(fitwordDataDir, 'models.json'));
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
  const { openAIApiKey, openAIBaseUrl, openAIModel } = getRequiredLlmConfig();
  let selectedModel: CreateAgentSessionOptions['model'];

  const normalizedBaseUrl = openAIBaseUrl.replace(/\/+$/, '');
    const builtInModel = modelRegistry
      .getAll()
      .find((candidate) => candidate.id === openAIModel && candidate.baseUrl.replace(/\/+$/, '') === normalizedBaseUrl);

    modelRegistry.registerProvider(openAICompatibleProvider, {
      name: 'Fitword OpenAI Compatible',
      baseUrl: openAIBaseUrl,
      apiKey: openAIApiKey,
      api: builtInModel?.api ?? 'openai-completions',
      models: [
        {
          id: openAIModel,
          name: builtInModel?.name ?? openAIModel,
          api: builtInModel?.api ?? 'openai-completions',
          baseUrl: openAIBaseUrl,
          reasoning: builtInModel?.reasoning ?? false,
          thinkingLevelMap: builtInModel?.thinkingLevelMap,
          input: builtInModel?.input ?? (['text'] as Array<'text' | 'image'>),
          cost: builtInModel?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: builtInModel?.contextWindow ?? 128000,
          maxTokens: builtInModel?.maxTokens ?? 16384,
          compat: builtInModel?.compat,
        },
      ],
    });

    selectedModel = modelRegistry.find(openAICompatibleProvider, openAIModel);
    if (!selectedModel) {
      throw new Error(`无法注册 LLM 模型 ${openAIModel}。`);
    }

  const resourceLoader = new DefaultResourceLoader({
    cwd: fitwordDataDir,
    agentDir: fitwordDataDir,
    settingsManager,
    systemPromptOverride: () => FITWORD_SYSTEM_PROMPT,
    appendSystemPromptOverride: () => [],
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
  });
  await resourceLoader.reload();

  const sessionFile = ensureSessionFile(state.id);
  const { session } = await createAgentSession({
    cwd: fitwordDataDir,
    agentDir: fitwordDataDir,
    authStorage,
    modelRegistry,
    model: selectedModel,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.open(sessionFile, fitwordSessionDir, fitwordDataDir),
    tools: ['ask_question', 'record_answer', 'evaluate_writing', 'get_practice_stats'],
    customTools: createFitwordTools(state),
    noTools: 'builtin',
  });

  return session;
}

async function getPiSession(state: ManagedPiSession) {
  if (!state.sessionPromise) {
    state.sessionPromise = createFitwordPiSession(state);
  }

  const session = await state.sessionPromise;
  state.session = session;
  state.historyManager = session.sessionManager;

  if (!state.unsubscribe) {
    state.unsubscribe = session.subscribe((event: any) => {
      state.emit?.(event as Record<string, unknown>);
    });
  }

  const cachedStates = [...sessionCache.values()]
    .filter((cached) => cached.session && !cached.pendingQuestion && !cached.emit && cached.id !== state.id)
    .sort((a, b) => a.lastUsed - b.lastUsed);
  while ([...sessionCache.values()].filter((cached) => cached.session).length > maxCachedAgents && cachedStates.length > 0) {
    const stale = cachedStates.shift();
    stale?.unsubscribe?.();
    stale?.session?.dispose();
    if (stale) {
      stale.session = undefined;
      stale.sessionPromise = undefined;
      stale.unsubscribe = undefined;
    }
  }

  return session;
}

async function runSessionTurn(
  session: SessionInfo,
  message: string,
  intent: 'score' | undefined,
  emit: StreamEmit,
  signal?: AbortSignal,
) {
  const state = getManagedState(session.id);
  if (signal?.aborted) {
    throw new Error('请求已取消。');
  }

  state.emit = emit;
  state.lastUsed = Date.now();

  try {
    let abortCurrentTurn: (() => void) | undefined;

    try {
      const piSession = await getPiSession(state);
      if (signal?.aborted) {
        await piSession.abort();
        throw new Error('请求已取消。');
      }

      abortCurrentTurn = () => {
        state.pendingQuestion?.reject(new Error('等待用户作答已取消。'));
        void piSession.abort();
      };
      signal?.addEventListener('abort', abortCurrentTurn, { once: true });

      const prompt = intent === 'score' ? `<instruction>用户请求写作评分，请评分并调用 evaluate_writing 工具保存。</instruction>\n${message}` : message;
      await piSession.prompt(prompt, { source: 'user' } as any);
    } finally {
      if (abortCurrentTurn) {
        signal?.removeEventListener('abort', abortCurrentTurn);
      }
    }
  } finally {
    state.emit = undefined;
    touchSession(session.id);
  }
}

export function prepareChatSession(input: { sessionId?: string; message: string }) {
  const text = input.message.trim();

  if (!text) {
    throw new Error('消息不能为空。');
  }

  getRequiredLlmConfig();

  const session = input.sessionId ? getSession(input.sessionId) : createSessionFromFirstMessage(text);
  if (!session || session.status !== 'active') {
    throw new Error('会话不存在或已归档。');
  }

  return session;
}

export async function streamChat(input: { sessionId?: string; message: string; intent?: 'score' }, emit: StreamEmit, signal?: AbortSignal) {
  const text = input.message.trim();

  if (!text) {
    throw new Error('消息不能为空。');
  }

  const session = prepareChatSession({ sessionId: input.sessionId, message: text });
  const state = getManagedState(session.id);
  const previous = state.queue.catch(() => undefined);
  const run = previous.then(() => runSessionTurn(session, text, input.intent, emit, signal));
  state.queue = run.catch(() => undefined);
  await run;
}

export function resolveQuestionAnswer(sessionId: string, questionId: string, answer: string) {
  const session = getSession(sessionId);
  const state = session ? sessionCache.get(sessionId) : undefined;

  if (!session || session.status !== 'active') {
    throw new Error('会话不存在或已归档。');
  }

  if (!state?.pendingQuestion || state.pendingQuestion.card.id !== questionId) {
    throw new Error('当前没有等待该题目的作答。');
  }

  const pending = state.pendingQuestion;
  const card = pending.card;
  const text = answer.trim();
  const normalized =
    card.format === 'choice' && /^[A-D]$/i.test(text)
      ? card.candidates?.[['A', 'B', 'C', 'D'].indexOf(text.toUpperCase())] ?? text
      : text;
  const result =
    card.format === 'choice'
      ? {
          user_answer: normalized,
          quality: normalized === card.correct ? (2 as Quality) : (0 as Quality),
        }
      : {
          user_answer: normalized,
        };

  state.lastUsed = Date.now();
  pending.resolve(result);

  return {
    ok: true,
    result,
  };
}

export async function cancelSessionTurn(sessionId: string, reason: string) {
  const state = sessionCache.get(sessionId);

  if (!state) {
    return;
  }

  state.pendingQuestion?.reject(new Error(reason));
  state.lastUsed = Date.now();

  if (state.session) {
    await state.session.abort();
  }
}

export function readSessionMessages(sessionId: string) {
  const sessionFile = getSessionFilePath(sessionId);

  if (!fs.existsSync(sessionFile)) {
    return [] as ChatMessage[];
  }

  const messages: ChatMessage[] = [];
  const lines = fs.readFileSync(sessionFile, 'utf8').split('\n').filter((line) => line.trim());

  for (const line of lines) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== 'message' || !entry.message) {
      continue;
    }

    const sourceMessage = entry.message;
    const createdAt =
      typeof sourceMessage.timestamp === 'number'
        ? new Date(sourceMessage.timestamp).toISOString()
        : typeof entry.timestamp === 'string'
          ? entry.timestamp
          : new Date().toISOString();
    const parts: ChatPart[] = [];

    if (sourceMessage.role === 'user') {
      if (typeof sourceMessage.content === 'string') {
        parts.push({ kind: 'text', text: stripInstructionTag(sourceMessage.content) });
      } else if (Array.isArray(sourceMessage.content)) {
        const text = sourceMessage.content
          .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
          .map((block: any) => block.text)
          .join('');
        if (text) parts.push({ kind: 'text', text: stripInstructionTag(text) });
      }
      if (parts.length) {
        messages.push({ id: entry.id ?? randomUUID(), role: 'user', created_at: createdAt, parts });
      }
      continue;
    }

    if (sourceMessage.role === 'assistant' && Array.isArray(sourceMessage.content)) {
      const text = sourceMessage.content
        .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
        .map((block: any) => block.text)
        .join('');
      if (text) parts.push({ kind: 'text', text });
      if (parts.length) {
        messages.push({ id: entry.id ?? randomUUID(), role: 'agent', created_at: createdAt, parts });
      }
      continue;
    }

    if (sourceMessage.role === 'toolResult') {
      const card = sourceMessage.details?.card;
      if (card?.type === 'question') {
        parts.push({ kind: 'question', card: card as QuestionCard });
      }
      if (card?.type === 'score') {
        parts.push({ kind: 'score', card: card as ScoreCard });
      }
      if (parts.length) {
        messages.push({ id: entry.id ?? randomUUID(), role: 'agent', created_at: createdAt, parts });
      }
    }
  }

  return messages;
}
