import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool';
import type { QuestionCard } from '../../shared/types.js';
import { useKnowledgeLabels } from '../hooks/use-knowledge-labels';

export function QuestionCardView({ card, onAnswer }: { card: QuestionCard; onAnswer: (answer: string) => void }) {
  const { t } = useLingui();
  const [answer, setAnswer] = useState('');
  const [submittedAnswer, setSubmittedAnswer] = useState<string>();
  const questionParts = card.question.split('____');
  const knowledgeLabels = useKnowledgeLabels();

  return (
    <Tool defaultOpen className="border-primary/25 bg-primary/5">
      <ToolHeader type="tool-ask_question" state="output-available" title={card.format === 'choice' ? t`选择题` : t`填空题`} />
      <ToolContent>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant="secondary">{knowledgeLabels[card.knowledge_type]}</Badge>
          {card.topic_tag ? <Badge variant="outline">{card.topic_tag}</Badge> : null}
        </div>
        <h3 className="text-lg leading-8 font-semibold">
          {questionParts[0]}
          <span className="mx-1 rounded-md bg-background px-3 py-1 text-primary ring-1 ring-primary/20">____</span>
          {questionParts[1]}
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>答完后我会给出语境适配度和表达差异。</Trans>
        </p>
        {card.format === 'choice' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {card.candidates?.map((candidate, index) => (
              <Button
                key={candidate}
                variant={submittedAnswer === candidate ? 'secondary' : 'outline'}
                className="h-auto justify-start py-3 text-left"
                disabled={Boolean(submittedAnswer)}
                onClick={() => {
                  setSubmittedAnswer(candidate);
                  onAnswer(candidate);
                }}
              >
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
              if (answer.trim() && !submittedAnswer) {
                setSubmittedAnswer(answer.trim());
                onAnswer(answer.trim());
              }
            }}
          >
            <Input
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={t`输入你觉得最贴切的词`}
              disabled={Boolean(submittedAnswer)}
            />
            <Button type="submit" disabled={Boolean(submittedAnswer)}>
              <Trans>确认答案</Trans>
            </Button>
          </form>
        )}
      </ToolContent>
    </Tool>
  );
}
