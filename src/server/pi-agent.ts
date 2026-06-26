import os from 'node:os';
import path from 'node:path';
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
import { getStats, recordAnswer, saveScore } from './db.js';
import { FITWORD_SYSTEM_PROMPT } from './system-prompt.js';
import type { ChatMessage, KnowledgeType, Quality, QuestionCard, ScoreCard } from '../shared/types.js';

export type StreamEmit = (event: string, data: Record<string, unknown>) => void;

type PiSession = Awaited<ReturnType<typeof createAgentSession>>['session'];

const now = () => new Date().toISOString();
const id = () => Math.random().toString(36).slice(2);
const fitwordDir = path.join(os.homedir(), '.fitword');
const openAICompatibleProvider = 'fitword-openai-compatible';
let piSessionPromise: Promise<PiSession> | undefined;
let currentEmit: StreamEmit | undefined;
let pendingQuestion: QuestionCard | undefined;

const choiceSamples: Record<KnowledgeType, { q: string; c: string[]; a: string; t: string }> = {
  noun: { q: '靠窗那排适合临时办公的长条桌，通常叫____。', c: ['吧台', '工位', '展台', '柜台'], a: '吧台', t: '空间描述' },
  verb: { q: '项目第一阶段的开发已经____，下周进入测试。', c: ['完成', '告一段落', '收尾', '结束'], a: '告一段落', t: '进度汇报' },
  adjective: { q: '这段介绍信息很多，但读起来有点____，缺少重点。', c: ['松散', '热闹', '锋利', '厚重'], a: '松散', t: '写作表达' },
  logic: { q: '他很早到了会场，____还是错过了开场致辞。', c: ['因此', '却', '并且', '除非'], a: '却', t: '逻辑连接' },
  domain: { q: '这杯咖啡的____很突出，入口能闻到明显的花果香。', c: ['风味', '库存', '浓度', '杯型'], a: '风味', t: '咖啡' },
};

const askQuestionTool = defineTool({
  name: 'ask_question',
  label: 'Ask Question',
  description: '展示一道 fitword 选择题或填空题。工具只展示，不写入存储。',
  parameters: Type.Object({
    format: Type.Union([Type.Literal('choice'), Type.Literal('fill')]),
    question: Type.String(),
    knowledge_type: Type.Union([Type.Literal('noun'), Type.Literal('verb'), Type.Literal('adjective'), Type.Literal('logic'), Type.Literal('domain')]),
    topic_tag: Type.Optional(Type.String()),
    candidates: Type.Optional(Type.Array(Type.String())),
    correct: Type.Optional(Type.String()),
  }),
  execute: async (_toolCallId, params) => {
    const card: QuestionCard = {
      type: 'question',
      id: id(),
      format: params.format,
      question: params.question,
      knowledge_type: params.knowledge_type,
      topic_tag: params.topic_tag,
      candidates: params.format === 'choice' ? params.candidates : undefined,
      correct: params.format === 'choice' ? params.correct : undefined,
    };
    pendingQuestion = card;
    currentEmit?.('tool', { kind: 'question', card });
    return { content: [{ type: 'text', text: JSON.stringify({ status: 'displayed', question_id: card.id }) }], details: { card } };
  },
});

const recordAnswerTool = defineTool({
  name: 'record_answer',
  label: 'Record Answer',
  description: '写入已完成作答的题目和答案质量。',
  parameters: Type.Object({
    format: Type.Union([Type.Literal('choice'), Type.Literal('fill')]),
    question: Type.String(),
    knowledge_type: Type.Union([Type.Literal('noun'), Type.Literal('verb'), Type.Literal('adjective'), Type.Literal('logic'), Type.Literal('domain')]),
    topic_tag: Type.Optional(Type.String()),
    user_answer: Type.String(),
    quality: Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)]),
    candidates: Type.Optional(Type.Array(Type.String())),
    correct: Type.Optional(Type.String()),
  }),
  execute: async (_toolCallId, params) => {
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
    currentEmit?.('tool', { kind: 'answer_recorded', result });
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
    dimensions: Type.Object({ accuracy: Type.Number(), specificity: Type.Number(), naturalness: Type.Number(), structure: Type.Number(), register: Type.Number() }),
    main_issues: Type.String(),
    suggestions: Type.Array(Type.Object({ original: Type.String(), replacement: Type.String(), reason: Type.String() })),
    rewrite: Type.String(),
  }),
  execute: async (_toolCallId, params) => {
    const card: ScoreCard = { type: 'score', ...params };
    card.scoring_record_id = saveScore(card);
    currentEmit?.('tool', { kind: 'score', card });
    return { content: [{ type: 'text', text: JSON.stringify({ scoring_record_id: card.scoring_record_id }) }], details: { card } };
  },
});

const getPracticeStatsTool = defineTool({
  name: 'get_practice_stats',
  label: 'Get Practice Stats',
  description: '查询本地练习统计数据。',
  parameters: Type.Object({
    query: Type.Union([Type.Literal('weak_types'), Type.Literal('topic_distribution'), Type.Literal('overall'), Type.Literal('format_comparison'), Type.Literal('writing_summary')]),
  }),
  execute: async (_toolCallId, params) => {
    const stats = getStats();
    const result = params.query === 'overall' ? stats.overall : stats[params.query];
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
  },
});

async function createFitwordPiSession() {
  const authStorage = AuthStorage.create(path.join(fitwordDir, 'auth.json'));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(fitwordDir, 'models.json'));
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

    const apiKey = openAIApiKey;
    const baseUrl = openAIBaseUrl;
    const modelId = openAIModel;
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const builtInModel = modelRegistry
      .getAll()
      .find((candidate) => candidate.id === modelId && candidate.baseUrl.replace(/\/+$/, '') === normalizedBaseUrl);

    modelRegistry.registerProvider(openAICompatibleProvider, {
      name: 'Fitword OpenAI Compatible',
      baseUrl,
      apiKey,
      api: builtInModel?.api ?? 'openai-completions',
      models: [
        {
          id: modelId,
          name: builtInModel?.name ?? modelId,
          api: builtInModel?.api ?? 'openai-completions',
          baseUrl,
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

    selectedModel = modelRegistry.find(openAICompatibleProvider, modelId);
    if (!selectedModel) {
      throw new Error(`无法注册 LLM 模型 ${modelId}。`);
    }
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd: fitwordDir,
    agentDir: fitwordDir,
    settingsManager,
    systemPromptOverride: () => FITWORD_SYSTEM_PROMPT,
    appendSystemPromptOverride: () => [],
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd: fitwordDir,
    agentDir: fitwordDir,
    authStorage,
    modelRegistry,
    model: selectedModel,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.create(fitwordDir),
    tools: ['ask_question', 'record_answer', 'evaluate_writing', 'get_practice_stats'],
    customTools: [askQuestionTool, recordAnswerTool, evaluateWritingTool, getPracticeStatsTool],
    noTools: 'builtin',
  });
  return session;
}

async function getPiSession() {
  piSessionPromise ??= createFitwordPiSession();
  const session = await piSessionPromise;
  session.subscribe((event: any) => {
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      currentEmit?.('delta', { text: event.assistantMessageEvent.delta });
    }
  });
  return session;
}

function normalizeChoiceAnswer(raw: string, question: QuestionCard) {
  const text = raw.trim();
  const index = ['A', 'B', 'C', 'D'].indexOf(text.toUpperCase());
  return index >= 0 ? question.candidates?.[index] ?? text : text;
}

function inferType(text: string): KnowledgeType {
  if (/逻辑|因果|但是|然而/.test(text)) return 'logic';
  if (/领域|咖啡|产品|技术|AI/.test(text)) return 'domain';
  if (/形容|风格|质感/.test(text)) return 'adjective';
  if (/名词|叫什么/.test(text)) return 'noun';
  return 'verb';
}

function demoQuestion(text: string) {
  const knowledgeType = inferType(text);
  const sample = choiceSamples[knowledgeType];
  const fill = /填空|难一点|产出/.test(text);
  const card: QuestionCard = {
    type: 'question',
    id: id(),
    format: fill ? 'fill' : 'choice',
    question: sample.q,
    knowledge_type: knowledgeType,
    topic_tag: sample.t,
    candidates: fill ? undefined : sample.c,
    correct: fill ? undefined : sample.a,
  };
  pendingQuestion = card;
  return card;
}

function demoScore(text: string): ScoreCard {
  const vague = (text.match(/很好|不错|很多|大部分|正常|推进|事情/g) || []).length;
  const specificity = Math.max(2, 5 - vague);
  const card: ScoreCard = {
    type: 'score',
    original_text: text,
    total_score: Math.round((4 + specificity + 4 + 3 + 4) / 5),
    dimensions: { accuracy: 4, specificity, naturalness: 4, structure: 3, register: 4 },
    main_issues: vague ? '主要问题是具体度偏弱：有些词比较笼统，读者不容易知道具体进展。' : '整体表达清楚，可以继续提升结构层次和关键词精度。',
    suggestions: [
      { original: '正常推进', replacement: '按计划进入下一阶段', reason: '比“正常”更明确进度状态' },
      { original: '大部分', replacement: '列出数量或范围', reason: '用具体信息替代模糊范围' },
    ],
    rewrite: text.replace(/正常推进/g, '按计划进入下一阶段').replace(/大部分/g, '核心'),
  };
  card.scoring_record_id = saveScore(card);
  return card;
}

async function streamFallback(message: string, intent: 'score' | undefined, emit: StreamEmit, reason: string) {
  emit('warning', { message: `Pi SDK 暂不可用，已进入本地演示流：${reason}` });
  if (intent === 'score') {
    emit('delta', { text: '我先说重点：这段文字的可改空间主要在“具体度”和“结构”。' });
    emit('tool', { kind: 'score', card: demoScore(message) });
    return;
  }
  if (pendingQuestion) {
    const question = pendingQuestion;
    pendingQuestion = undefined;
    const userAnswer = question.format === 'choice' ? normalizeChoiceAnswer(message, question) : message.trim();
    const quality: Quality = question.format === 'choice' ? (userAnswer === question.correct ? 2 : 0) : userAnswer.length >= 2 ? 1 : 0;
    recordAnswer({ format: question.format, question: question.question, knowledge_type: question.knowledge_type, topic_tag: question.topic_tag, user_answer: userAnswer, quality, candidates: question.candidates, correct: question.correct });
    emit('delta', { text: question.format === 'choice' ? (quality === 2 ? `对，${question.correct} 最贴切。` : `这题更推荐 ${question.correct}。`) : `“${userAnswer}”能用；如果想更精准，可以继续比较语气、主动/被动和场景。` });
    return;
  }
  emit('delta', { text: '好，我们从一道贴近真实表达的题开始。' });
  emit('tool', { kind: 'question', card: demoQuestion(message) });
}

export async function streamChat(message: string, intent: 'score' | undefined, emit: StreamEmit) {
  const userMessage: ChatMessage = { id: id(), role: 'user', created_at: now(), parts: [{ kind: 'text', text: message }] };
  emit('message', { message: userMessage });

  currentEmit = emit;
  try {
    if (process.env.FITWORD_FORCE_DEMO === '1') {
      await streamFallback(message, intent, emit, 'FITWORD_FORCE_DEMO=1');
      return;
    }

    const session = await getPiSession();
    const prompt = intent === 'score' ? `用户请求写作评分，请评分并调用 evaluate_writing 工具保存：\n${message}` : message;
    await session.prompt(prompt, { source: 'user' } as any);
  } catch (error) {
    await streamFallback(message, intent, emit, error instanceof Error ? error.message : String(error));
  } finally {
    currentEmit = undefined;
  }
}
