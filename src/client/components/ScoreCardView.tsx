import { Trans, useLingui } from '@lingui/react/macro';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tool } from '@/components/ai-elements/tool';
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
    <Tool className="border-amber-300/60 bg-amber-50/50">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="size-5 text-amber-600" /> <Trans>写作评分</Trans>
            </CardTitle>
            <CardDescription>
              <Trans>分数是参考，重点看可操作的替换和改写。</Trans>
            </CardDescription>
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
