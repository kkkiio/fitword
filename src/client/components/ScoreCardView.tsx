import { Trans, useLingui } from '@lingui/react/macro';
import { Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool';
import type { ScoreCard } from '../../shared/types.js';

export function ScoreCardView({ card }: { card: ScoreCard }) {
  const { t } = useLingui();
  const dimensions = [
    [t`准确度`, card.dimensions.accuracy],
    [t`具体度`, card.dimensions.specificity],
    [t`自然度`, card.dimensions.naturalness],
    [t`结构`, card.dimensions.structure],
    [t`语域`, card.dimensions.register],
  ] as const;

  return (
    <Tool defaultOpen className="border-amber-300/70 bg-amber-50/60">
      <ToolHeader type="tool-evaluate_writing" state="output-available" title={t`写作评分`} />
      <ToolContent>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-5 text-amber-600" /> <Trans>写作评分</Trans>
            </h3>
            <p className="text-sm text-muted-foreground">
              <Trans>分数是参考，重点看可操作的替换和改写。</Trans>
            </p>
          </div>
          <div className="rounded-full bg-amber-100 px-4 py-2 text-xl font-bold text-amber-900">{card.total_score}/5</div>
        </div>
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
            <div key={`${suggestion.original}-${suggestion.replacement}`} className="space-y-1 rounded-lg border bg-background p-3">
              <p className="font-medium">
                {suggestion.original} <span className="text-muted-foreground">→</span> {suggestion.replacement}
              </p>
              <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
            </div>
          ))}
        </div>
        <blockquote className="rounded-lg border-l-4 border-amber-500 bg-background p-4 leading-7">{card.rewrite}</blockquote>
      </ToolContent>
    </Tool>
  );
}
