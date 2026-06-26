import { useState } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import { StatsPanel } from './components/StatsPanel';
import { useLocale } from './hooks/use-locale';
import { useSessions } from './hooks/use-sessions';
import type { WorkspaceView } from './types';

export function App() {
  const { locale, setLocale } = useLocale();
  const [activeView, setActiveView] = useState<WorkspaceView>('chat');

  const {
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
  } = useSessions();

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          locale={locale}
          onLocaleChange={setLocale}
          activeView={activeView}
          onViewChange={setActiveView}
          onSessionCreate={() => {
            startEmptyConversation();
            setActiveView('chat');
          }}
          onSessionArchive={(sessionId) => {
            archiveConversation(sessionId).then(() => setActiveView('chat'));
          }}
          onSessionSelect={(sessionId) => {
            selectSession(sessionId);
            setActiveView('chat');
          }}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {activeView === 'chat' ? (
            <ChatPanel
              hasSession={Boolean(selectedSession)}
              messages={visibleMessages}
              input={input}
              scoreMode={scoreMode}
              isSending={isSending}
              onInputChange={setInput}
              onScoreModeChange={setScoreMode}
              onSend={send}
              onQuestionAnswer={answerQuestion}
            />
          ) : (
            <StatsPanel />
          )}
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}
