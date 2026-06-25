import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, MessageSquareText, Send, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { PromptInput, PromptInputSubmit, PromptInputTextarea, PromptInputToolbar } from '@/components/ai-elements/prompt-input';
import { Response } from '@/components/ai-elements/response';
import { Tool } from '@/components/ai-elements/tool';
import type { ChatMessage, QuestionCard, ScoreCard } from '../shared/types.js';
import './style.css';

const knowledgeLabels: Record<string, string> = {
  noun: '名词',
  verb: '动词',
  adjective: '形容词',
  logic: '逻辑词',
  domain: '领域词',
};

function QuestionCardView({ card, onAnswer }: { card: QuestionCard; onAnswer: (answer: string) => void }) {
  const [answer, setAnswer] = useState('');
  const questionParts = card.question.split('____');

  return (
    <Tool className="border-primary/30 bg-primary/5">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{card.format === 'choice' ? '选择题' : '填空题'}</Badge>
          <Badge variant="secondary">{knowledgeLabels[card.knowledge_type]}</Badge>
          {card.topic_tag ? <Badge variant="outline">{card.topic_tag}</Badge> : null}
        </div>
        <CardTitle className="text-xl leading-8">
          {questionParts[0]}
          <span className="mx-1 rounded-md bg-background px-3 py-1 text-primary ring-1 ring-primary/20">____</span>
          {questionParts[1]}
        </CardTitle>
        <CardDescription>答完后我会给出语境适配度和表达差异。</CardDescription>
      </CardHeader>
      <CardContent>
        {card.format === 'choice' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {card.candidates?.map((candidate, index) => (
              <Button key={candidate} variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => onAnswer(candidate)}>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold">{'ABCD'[index]}</span>
                {candidate}
              </Button>
            ))}
          </div>
        ) : (
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (answer.trim()) onAnswer(answer.trim());
            }}
          >
            <Input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="输入你觉得最贴切的词" />
            <Button type="submit">确认答案</Button>
          </form>
        )}
      </CardContent>
    </Tool>
  );
}

function ScoreCardView({ card }: { card: ScoreCard }) {
  const dimensions = [
    ['准确度', card.dimensions.accuracy],
    ['具体度', card.dimensions.specificity],
    ['自然度', card.dimensions.naturalness],
    ['结构', card.dimensions.structure],
    ['语域', card.dimensions.register],
  ] as const;

  return (
    <Tool className="border-amber-300/60 bg-amber-50/50">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="size-5 text-amber-600" /> 写作评分
            </CardTitle>
            <CardDescription>分数是参考，重点看可操作的替换和改写。</CardDescription>
          </div>
          <div className="rounded-full bg-amber-100 px-4 py-2 text-2xl font-bold text-amber-900">{card.total_score}/5</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3">
          {dimensions.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[72px_1fr_28px] items-center gap-3 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <Progress value={(value / 5) * 100} />
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <Separator />
        <p className="leading-7">{card.main_issues}</p>
        <div className="grid gap-3">
          {card.suggestions.map((suggestion) => (
            <Card key={`${suggestion.original}-${suggestion.replacement}`} className="gap-2 py-4 shadow-none">
              <CardContent className="space-y-1">
                <p className="font-medium">
                  {suggestion.original} <span className="text-muted-foreground">→</span> {suggestion.replacement}
                </p>
                <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <blockquote className="rounded-lg border-l-4 border-amber-500 bg-background p-4 leading-7">{card.rewrite}</blockquote>
      </CardContent>
    </Tool>
  );
}

function ChatMessageView({ message, onAnswer }: { message: ChatMessage; onAnswer: (answer: string) => void }) {
  const from = message.role === 'user' ? 'user' : 'assistant';
  return (
    <Message from={from}>
      <MessageContent className={from === 'user' ? 'border-primary bg-primary text-primary-foreground' : ''}>
        <div className="space-y-3">
          {message.parts.map((part, index) => {
            if (part.kind === 'text') return <Response key={index}>{part.text}</Response>;
            if (part.kind === 'question') return <QuestionCardView key={part.card.id} card={part.card} onAnswer={onAnswer} />;
            return <ScoreCardView key={part.card.scoring_record_id ?? index} card={part.card} />;
          })}
        </div>
      </MessageContent>
    </Message>
  );
}

function StatsPanel() {
  const [stats, setStats] = useState<any>();

  useEffect(() => {
    fetch('/api/stats').then((response) => response.json()).then(setStats);
  }, []);

  if (!stats) return <main className="grid flex-1 place-items-center text-muted-foreground">加载统计中…</main>;

  const rows = [...stats.weak_types];
  const weakest = rows[0]?.knowledge_type;

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">练习统计</h2>
          <p className="text-muted-foreground">只读展示本地 SQLite 中的练习质量分布。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['总题数', stats.overall.total],
            ['可用率', `${stats.overall.usable_rate}%`],
            ['优质率', `${stats.overall.good_rate}%`],
            ['待打磨率', `${stats.overall.needs_work_rate}%`],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-3xl">{value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
        <StatsRows title="薄弱类型分布" rows={rows} nameKey="knowledge_type" highlight={weakest} />
        <StatsRows title="选择题 vs 填空题" rows={stats.format_comparison} nameKey="format" />
        <Card>
          <CardHeader>
            <CardTitle>写作评分</CardTitle>
            <CardDescription>总记录 {stats.writing_summary.total_records} 次</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">平均总分：{stats.writing_summary.average_total_score ?? 0}</CardContent>
        </Card>
      </div>
    </main>
  );
}

function StatsRows({ title, rows, nameKey, highlight }: { title: string; rows: any[]; nameKey: string; highlight?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">暂无数据，完成练习后会显示。</p> : null}
        {rows.map((row) => (
          <div key={row[nameKey]} className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-medium">{knowledgeLabels[row[nameKey]] ?? (row[nameKey] === 'choice' ? '选择题' : '填空题')}</div>
              {highlight === row[nameKey] ? <Badge variant="destructive">优先打磨</Badge> : null}
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <Metric label="可用率" value={row.usable_rate} />
              <Metric label="优质率" value={row.good_rate} />
              <Metric label="待打磨率" value={row.needs_work_rate} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-muted-foreground">
        <span>{label}</span>
        <span>{value ?? 0}%</span>
      </div>
      <Progress value={value ?? 0} />
    </div>
  );
}


async function streamChatEvents({
  message,
  intent,
  onEvent,
}: {
  message: string;
  intent?: 'score';
  onEvent: (event: string, data: Record<string, unknown>) => void;
}) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, intent }),
  });
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

function App() {
  const [tab, setTab] = useState('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      created_at: new Date().toISOString(),
      parts: [{ kind: 'text', text: '你好，我是 fitword（词感）。说一个想练的话题，或点击“提交评分”粘贴一段文字。' }],
    },
  ]);
  const [input, setInput] = useState('');
  const [scoreMode, setScoreMode] = useState(false);

  const placeholder = useMemo(() => (scoreMode ? '粘贴需要评分的文字…' : '输入你的消息…'), [scoreMode]);

  async function send(message = input) {
    if (!message.trim()) return;
    const outgoingIntent = scoreMode ? 'score' : undefined;
    setInput('');
    setScoreMode(false);

    const assistantId = `agent-${Date.now()}`;
    let assistantStarted = false;

    const appendAssistantPart = (part: ChatMessage['parts'][number]) => {
      setMessages((current) => {
        const existing = current.find((item) => item.id === assistantId);
        if (!existing) {
          assistantStarted = true;
          return [...current, { id: assistantId, role: 'agent', created_at: new Date().toISOString(), parts: [part] }];
        }
        return current.map((item) => (item.id === assistantId ? { ...item, parts: [...item.parts, part] } : item));
      });
    };

    await streamChatEvents({
      message,
      intent: outgoingIntent,
      onEvent(event, data) {
        if (event === 'message') {
          setMessages((current) => [...current, data.message as ChatMessage]);
        }
        if (event === 'delta') {
          const text = String(data.text ?? '');
          setMessages((current) => {
            const existing = current.find((item) => item.id === assistantId);
            if (!existing) {
              assistantStarted = true;
              return [...current, { id: assistantId, role: 'agent', created_at: new Date().toISOString(), parts: [{ kind: 'text', text }] }];
            }
            return current.map((item) => {
              if (item.id !== assistantId) return item;
              const last = item.parts[item.parts.length - 1];
              if (last?.kind === 'text') {
                return { ...item, parts: [...item.parts.slice(0, -1), { ...last, text: `${last.text}${text}` }] };
              }
              return { ...item, parts: [...item.parts, { kind: 'text', text }] };
            });
          });
        }
        if (event === 'tool') {
          if (data.kind === 'question') appendAssistantPart({ kind: 'question', card: data.card as QuestionCard });
          if (data.kind === 'score') appendAssistantPart({ kind: 'score', card: data.card as ScoreCard });
        }
        if (event === 'warning' && !assistantStarted) {
          appendAssistantPart({ kind: 'text', text: String(data.message ?? '') });
        }
        if (event === 'error') {
          appendAssistantPart({ kind: 'text', text: `出错了：${String(data.message ?? '未知错误')}` });
        }
      },
    });
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="h-screen flex-row gap-0 bg-muted/30">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-background p-4">
        <div className="mb-6 rounded-xl bg-primary p-4 text-primary-foreground">
          <h1 className="text-2xl font-semibold">fitword</h1>
          <p className="text-sm opacity-80">词感 · 表达练习</p>
        </div>
        <TabsList className="grid h-auto w-full grid-cols-1 bg-transparent p-0">
          <TabsTrigger value="chat" className="justify-start gap-2">
            <MessageSquareText className="size-4" /> 对话
          </TabsTrigger>
          <TabsTrigger value="stats" className="justify-start gap-2">
            <BarChart3 className="size-4" /> 统计
          </TabsTrigger>
        </TabsList>
      </aside>
      <TabsContent value="chat" className="flex min-w-0 flex-1 flex-col">
        <Conversation>
          <ConversationContent>
            {messages.map((message) => <ChatMessageView key={message.id} message={message} onAnswer={send} />)}
          </ConversationContent>
        </Conversation>
        <PromptInput
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <PromptInputToolbar>
            <Button type="button" variant={scoreMode ? 'secondary' : 'outline'} onClick={() => setScoreMode((current) => !current)}>
              {scoreMode ? '取消评分' : '提交评分'}
            </Button>
          </PromptInputToolbar>
          <PromptInputTextarea rows={scoreMode ? 4 : 1} value={input} onChange={(event) => setInput(event.target.value)} placeholder={placeholder} />
          <PromptInputSubmit>
            <Send className="size-4" /> {scoreMode ? '提交评分' : '发送'}
          </PromptInputSubmit>
        </PromptInput>
      </TabsContent>
      <TabsContent value="stats" className="min-w-0 flex-1">
        <StatsPanel />
      </TabsContent>
    </Tabs>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
