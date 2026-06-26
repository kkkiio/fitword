import { Message, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import type { ChatMessage } from '../../shared/types.js';
import { QuestionCardView } from './QuestionCardView';
import { ScoreCardView } from './ScoreCardView';

export function ChatMessageView({ message, onAnswer }: { message: ChatMessage; onAnswer: (answer: string) => void }) {
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
