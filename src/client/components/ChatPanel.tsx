import { Trans, useLingui } from '@lingui/react/macro';
import { Send } from 'lucide-react';
import { useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ChatMessage } from '../../shared/types.js';
import { ChatMessageView } from './ChatMessageView';

export function ChatPanel({
  messages,
  input,
  scoreMode,
  onInputChange,
  onScoreModeChange,
  onSend,
}: {
  messages: ChatMessage[];
  input: string;
  scoreMode: boolean;
  onInputChange: (value: string) => void;
  onScoreModeChange: (value: boolean) => void;
  onSend: (answer?: string) => void;
}) {
  const { t } = useLingui();
  const placeholder = useMemo(() => (scoreMode ? t`粘贴需要评分的文字…` : t`输入你的消息…`), [scoreMode, t]);

  return (
    <>
      <Conversation>
        <ConversationContent>
          {messages.map((message) => <ChatMessageView key={message.id} message={message} onAnswer={onSend} />)}
        </ConversationContent>
      </Conversation>
      <div className="border-t bg-background/95 p-4 backdrop-blur">
        <div className="mb-3 flex items-center gap-2">
          <Switch checked={scoreMode} onCheckedChange={onScoreModeChange} />
          <span className="text-sm text-muted-foreground"><Trans>写作评分</Trans></span>
        </div>
        <form
          className="flex items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <Textarea rows={scoreMode ? 4 : 1} value={input} onChange={(event) => onInputChange(event.target.value)} placeholder={placeholder} />
          <Button type="submit">
            <Send className="size-4" /> <Trans>发送</Trans>
          </Button>
        </form>
      </div>
    </>
  );
}
