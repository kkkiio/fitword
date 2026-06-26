import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ChatMessage, QuestionCard, ScoreCard } from '../shared/types.js';
import { streamChatEvents } from './api';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import { StatsPanel } from './components/StatsPanel';
import { activateLocale, i18n, supportedLocales, type SupportedLocale } from './i18n';

export function App() {
  const { t } = useLingui();
  const welcomeText = t`你好，我是 fitword（词感）。说一个想练的话题，或打开写作评分开关粘贴一段文字。`;
  const [locale, setLocale] = useState<SupportedLocale>(() => (supportedLocales.includes(i18n.locale as SupportedLocale) ? (i18n.locale as SupportedLocale) : 'zh-CN'));
  const [tab, setTab] = useState('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      created_at: new Date().toISOString(),
      parts: [{ kind: 'text', text: welcomeText }],
    },
  ]);
  const [input, setInput] = useState('');
  const [scoreMode, setScoreMode] = useState(false);

  useEffect(() => {
    activateLocale(locale);
    window.localStorage.setItem('fitword.locale', locale);
  }, [locale]);

  useEffect(() => {
    setMessages((current) => current.map((message) => (message.id === 'welcome' ? { ...message, parts: [{ kind: 'text', text: welcomeText }] } : message)));
  }, [welcomeText]);

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
          appendAssistantPart({ kind: 'text', text: t`出错了：${String(data.message ?? '未知错误')}` });
        }
      },
    });
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar
          locale={locale}
          onLocaleChange={setLocale}
          activeTab={tab}
          onTabChange={setTab}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {tab === 'chat' ? (
            <ChatPanel
              messages={messages}
              input={input}
              scoreMode={scoreMode}
              onInputChange={setInput}
              onScoreModeChange={setScoreMode}
              onSend={send}
            />
          ) : (
            <StatsPanel />
          )}
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}
