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

export type StreamEmit = (event: string, data: Record<string, unknown>) => void;

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

const choiceSamples: Record<KnowledgeType, { q: string; c: string[]; a: string; t: string }> = {
  noun: {
    q: '靠窗那排适合临时办公的长条桌，通常叫____。',
    c: ['吧台', '工位', '展台', '柜台'],
    a: '吧台',
    t: '空间描述',
  },
  verb: {
    q: '项目第一阶段的开发已经____，下周进入测试。',
    c: ['完成', '告一段落', '收尾', '结束'],
    a: '告一段落',
    t: '进度汇报',
  },
  adjective: {
    q: '这段介绍信息很多，但读起来有点____，缺少重点。',
    c: ['松散', '热闹', '锋利', '厚重'],
    a: '松散',
    t: '写作表达',
  },
  logic: {
    q: '他很早到了会场，____还是错过了开场致辞。',
    c: ['因此', '却', '并且', '除非'],
    a: '却',
    t: '逻辑连接',
  },
  domain: {
    q: '这杯咖啡的____很突出，入口能闻到明显的花果香。',
    c: ['风味', '库存', '浓度', '杯型'],
    a: '风味',
    t: '咖啡',
  },
};

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

function appendFallbackMessage(state: ManagedPiSession, message: Record<string, unknown>) {
  const manager = state.session?.sessionManager ?? getHistoryManager(state);
  manager.appendMessage({
    timestamp: Date.now(),
    ...message,
  } as any);
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

      state.emit?.('tool', { kind: 'question', card });
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

      state.emit?.('tool', { kind: 'answer_recorded', result });
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
      state.emit?.('tool', { kind: 'score', card });
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
  const openAIApiKey = process.env.OPENAI_API_KEY?.trim();
  const openAIBaseUrl = process.env.OPENAI_BASE_URL?.trim();
  const openAIModel = process.env.OPENAI_MODEL?.trim();
  let selectedModel: CreateAgentSessionOptions['model'];

  if (openAIApiKey || openAIBaseUrl || openAIModel) {
    if (!openAIApiKey || !openAIBaseUrl || !openAIModel) {
      const missingConfig: string[] = [];
      if (!openAIApiKey) missingConfig.push('OPENAI_API_KEY');
      if (!openAIBaseUrl) missingConfig.push('OPENAI_BASE_URL');
      if (!openAIModel) missingConfig.push('OPENAI_MODEL');
      throw new Error(`LLM 配置缺少 ${missingConfig.join(', ')}；请同时配置 OPENAI_API_KEY、OPENAI_BASE_URL 和 OPENAI_MODEL。`);
    }

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
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        state.emit?.('delta', { text: event.assistantMessageEvent.delta });
      }
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

function demoQuestion(text: string) {
  let knowledgeType: KnowledgeType = 'verb';

  if (/逻辑|因果|但是|然而/.test(text)) {
    knowledgeType = 'logic';
  } else if (/领域|咖啡|产品|技术|AI/.test(text)) {
    knowledgeType = 'domain';
  } else if (/形容|风格|质感/.test(text)) {
    knowledgeType = 'adjective';
  } else if (/名词|叫什么/.test(text)) {
    knowledgeType = 'noun';
  }

  const sample = choiceSamples[knowledgeType];
  const fill = /填空|难一点|产出/.test(text);
  const card: QuestionCard = {
    type: 'question',
    id: randomUUID(),
    format: fill ? 'fill' : 'choice',
    question: sample.q,
    knowledge_type: knowledgeType,
    topic_tag: sample.t,
    candidates: fill ? undefined : sample.c,
    correct: fill ? undefined : sample.a,
  };

  return card;
}

function demoScore(text: string): ScoreCard {
  const vague = (text.match(/很好|不错|很多|大部分|正常|推进|事情/g) || []).length;
  const specificity = Math.max(2, 5 - vague);
  const card: ScoreCard = {
    type: 'score',
    original_text: text,
    total_score: Math.round((4 + specificity + 4 + 3 + 4) / 5),
    dimensions: {
      accuracy: 4,
      specificity,
      naturalness: 4,
      structure: 3,
      register: 4,
    },
    main_issues: vague
      ? '主要问题是具体度偏弱：有些词比较笼统，读者不容易知道具体进展。'
      : '整体表达清楚，可以继续提升结构层次和关键词精度。',
    suggestions: [
      { original: '正常推进', replacement: '按计划进入下一阶段', reason: '比“正常”更明确进度状态' },
      { original: '大部分', replacement: '列出数量或范围', reason: '用具体信息替代模糊范围' },
    ],
    rewrite: text.replace(/正常推进/g, '按计划进入下一阶段').replace(/大部分/g, '核心'),
  };

  card.scoring_record_id = saveScore(card);
  return card;
}

async function streamFallback(
  state: ManagedPiSession,
  message: string,
  intent: 'score' | undefined,
  emit: StreamEmit,
  reason: string,
  signal?: AbortSignal,
) {
  emit('warning', { message: `Pi SDK 暂不可用，已进入本地演示流：${reason}` });
  appendFallbackMessage(state, { role: 'user', content: message });

  if (intent === 'score') {
    const intro = '我先说重点：这段文字的可改空间主要在“具体度”和“结构”。';
    const card = demoScore(message);
    emit('delta', { text: intro });
    emit('tool', { kind: 'score', card });
    appendFallbackMessage(state, {
      role: 'assistant',
      content: [{ type: 'text', text: intro }],
      api: 'local-demo',
      provider: 'fitword',
      model: 'demo',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'stop',
    });
    appendFallbackMessage(state, {
      role: 'toolResult',
      toolCallId: randomUUID(),
      toolName: 'evaluate_writing',
      content: [{ type: 'text', text: JSON.stringify({ scoring_record_id: card.scoring_record_id }) }],
      details: { card },
      isError: false,
    });
    return;
  }

  const intro = '好，我们从一道贴近真实表达的题开始。';
  const card = demoQuestion(message);
  emit('delta', { text: intro });
  emit('tool', { kind: 'question', card });
  appendFallbackMessage(state, {
    role: 'assistant',
    content: [{ type: 'text', text: intro }, { type: 'toolCall', id: card.id, name: 'ask_question', arguments: card }],
    api: 'local-demo',
    provider: 'fitword',
    model: 'demo',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'toolUse',
  });

  const answer = await waitForQuestionAnswer(state, card, signal);
  const result = recordAnswer({
    format: card.format,
    question: card.question,
    knowledge_type: card.knowledge_type,
    topic_tag: card.topic_tag,
    user_answer: answer.user_answer,
    quality: answer.quality ?? (answer.user_answer.length >= 2 ? 1 : 0),
    candidates: card.candidates,
    correct: card.correct,
  });
  const feedback =
    card.format === 'choice'
      ? answer.quality === 2
        ? `对，${card.correct} 最贴切。`
        : `这题更推荐 ${card.correct}。`
      : `“${answer.user_answer}”能用；如果想更精准，可以继续比较语气、主动/被动和场景。`;

  emit('tool', { kind: 'answer_recorded', result });
  emit('delta', { text: feedback });
  appendFallbackMessage(state, {
    role: 'toolResult',
    toolCallId: card.id,
    toolName: 'ask_question',
    content: [{ type: 'text', text: JSON.stringify(answer) }],
    details: { card, result: answer },
    isError: false,
  });
  appendFallbackMessage(state, {
    role: 'assistant',
    content: [{ type: 'text', text: feedback }],
    api: 'local-demo',
    provider: 'fitword',
    model: 'demo',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop',
  });
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

  const userMessage: ChatMessage = {
    id: randomUUID(),
    role: 'user',
    created_at: new Date().toISOString(),
    parts: [{ kind: 'text', text: message }],
  };

  emit('message', { message: userMessage });
  state.emit = emit;
  state.lastUsed = Date.now();

  try {
    if (process.env.FITWORD_FORCE_DEMO === '1') {
      await streamFallback(state, message, intent, emit, 'FITWORD_FORCE_DEMO=1', signal);
      return;
    }

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

      const prompt = intent === 'score' ? `用户请求写作评分，请评分并调用 evaluate_writing 工具保存：\n${message}` : message;
      await piSession.prompt(prompt, { source: 'user' } as any);
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      await streamFallback(state, message, intent, emit, error instanceof Error ? error.message : String(error), signal);
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

export async function streamChat(input: { sessionId?: string; message: string; intent?: 'score' }, emit: StreamEmit, signal?: AbortSignal) {
  const text = input.message.trim();

  if (!text) {
    throw new Error('消息不能为空。');
  }

  const session = input.sessionId ? getSession(input.sessionId) : createSessionFromFirstMessage(text);
  if (!session || session.status !== 'active') {
    throw new Error('会话不存在或已归档。');
  }

  emit('session', { session });
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
        parts.push({ kind: 'text', text: sourceMessage.content });
      } else if (Array.isArray(sourceMessage.content)) {
        const text = sourceMessage.content
          .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
          .map((block: any) => block.text)
          .join('');
        if (text) parts.push({ kind: 'text', text });
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
