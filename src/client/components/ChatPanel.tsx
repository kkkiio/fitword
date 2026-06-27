import { Trans, useLingui } from '@lingui/react/macro';
import { Send } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import type { ChatMessage } from '../../shared/types.js';
import { ChatMessageView } from './ChatMessageView';
import { WelcomeScreen } from './WelcomeScreen';

export function ChatPanel({
  hasSession,
  messages,
  input,
  scoreMode,
  isSending,
  onInputChange,
  onScoreModeChange,
  onSend,
  onQuestionAnswer,
}: {
  hasSession: boolean;
  messages: ChatMessage[];
  input: string;
  scoreMode: boolean;
  isSending: boolean;
  onInputChange: (value: string) => void;
  onScoreModeChange: (value: boolean) => void;
  onSend: (answer?: string) => void;
  onQuestionAnswer: (questionId: string, answer: string) => void;
}) {
  const { t } = useLingui();
  const placeholder = scoreMode ? t`粘贴需要评分的文字…` : t`输入你的消息…`;

  return (
    <>
      {hasSession ? (
        <Conversation>
          <ConversationContent className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
            {messages.map((message) => (
              <ChatMessageView key={message.id} message={message} onQuestionAnswer={onQuestionAnswer} />
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      ) : (
        <WelcomeScreen />
      )}
      <PromptInput className="border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-6" onSubmit={(message) => onSend(message.text)}>
        <PromptInputTextarea
          className={scoreMode ? 'min-h-28' : undefined}
          rows={scoreMode ? 4 : 1}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={placeholder}
          disabled={isSending}
        />
        <PromptInputFooter>
          <PromptInputTools>
            <Switch checked={scoreMode} onCheckedChange={onScoreModeChange} disabled={isSending} />
            <span>
              <Trans>写作评分</Trans>
            </span>
          </PromptInputTools>
          <PromptInputSubmit size="sm" aria-label={t`发送`} disabled={isSending || !input.trim()}>
            <Send className="size-4" /> <Trans>发送</Trans>
          </PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
    </>
  );
}
