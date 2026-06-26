import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import type { ChatMessage } from '../../shared/types.js';
import { QuestionCardView } from './QuestionCardView';
import { ScoreCardView } from './ScoreCardView';

export function ChatMessageView({
  message,
  onQuestionAnswer,
}: {
  message: ChatMessage;
  onQuestionAnswer: (questionId: string, answer: string) => void;
}) {
  const from = message.role === 'user' ? 'user' : 'assistant';
  return (
    <Message from={from}>
      <MessageContent>
        <div className="space-y-3">
          {message.parts.map((part, index) => {
            if (part.kind === 'text') return <MessageResponse key={index}>{part.text}</MessageResponse>;
            if (part.kind === 'question') return <QuestionCardView key={part.card.id} card={part.card} onAnswer={(answer) => onQuestionAnswer(part.card.id, answer)} />;
            return <ScoreCardView key={part.card.scoring_record_id ?? index} card={part.card} />;
          })}
        </div>
      </MessageContent>
    </Message>
  );
}
